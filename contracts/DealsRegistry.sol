// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Configurable.sol";
import "./SuppliersRegistry.sol";
import "./utils/IERC20.sol";
import "./utils/SignatureUtils.sol";

/**
 * @title DealsRegistry
 * @dev A smart contract for creating and managing deals between buyers and sellers.
 * The contract stores offers made by suppliers, and allows buyers to create deals based on those offers.
 * Each deal specifies the payment and cancellation terms, and can be tracked on-chain using its unique Id.
 */
abstract contract DealsRegistry is
  Configurable,
  Pausable,
  SuppliersRegistry,
  EIP712
{
  using SignatureChecker for address;
  using SignatureUtils for bytes;
  using SafeMath for uint256;

  bytes32 public constant PAYMENT_OPTION_TYPE_HASH =
    keccak256("PaymentOption(bytes32 id,uint256 price,address asset)");

  bytes32 public constant CANCEL_OPTION_TYPE_HASH =
    keccak256("CancelOption(uint256 time,uint256 penalty)");

  bytes32 public constant OFFER_TYPE_HASH =
    keccak256(
      // solhint-disable-next-line max-line-length
      "Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn)"
    );

  bytes32 public constant CHECK_IN_TYPE_HASH =
    keccak256("Voucher(bytes32 id,address signer)");

  /**
   * @dev Payment option
   * @param id Unique ID of the payment option
   * @param price The price of the asset in wei
   * @param asset The address of the ERC20 token used for payment
   */
  struct PaymentOption {
    bytes32 id;
    uint256 price;
    address asset;
  }

  /**
   * @dev Deal cancellation option
   * @param time The number of seconds before checkIn
   * @param penalty The percentage of the total sum to be paid as a penalty if the deal is cancelled
   */
  struct CancelOption {
    uint256 time;
    uint256 penalty;
  }

  /**
   * @dev Offer payload
   * @param id The unique ID of the offer
   * @param expire The time when the offer expires (in seconds since the Unix epoch)
   * @param supplierId The unique ID of the supplier offering the deal
   * @param chainId The ID of the network chain where the deal is to be executed
   * @param requestHash The hash of the request made by the buyer
   * @param optionsHash The hash of the payment and cancellation options for the deal
   * @param paymentHash The hash of the payment option used for the deal
   * @param cancelHash The hash of the cancellation option used for the deal
   * @param transferable Indicates whether the deal NFT is transferable or not
   * @param checkIn The check-in time for the deal (in seconds since the Unix epoch)
   * @param checkOut The check-out time for the deal (in seconds since the Unix epoch)
   */
  struct Offer {
    bytes32 id;
    uint256 expire;
    bytes32 supplierId;
    uint256 chainId;
    bytes32 requestHash;
    bytes32 optionsHash;
    bytes32 paymentHash;
    bytes32 cancelHash;
    bool transferable;
    uint256 checkIn;
    uint256 checkOut;
  }

  /**
   * @dev Deal status
   */
  enum DealStatus {
    Created, // Just created
    Claimed, // Claimed by the supplier
    Rejected, // Rejected by the supplier
    Refunded, // Refunded by the supplier
    Cancelled, // Cancelled by the buyer
    CheckedIn, // Checked In
    CheckedOut, // Checked Out
    Disputed // Dispute started
  }

  /**
   * @dev Deal storage struct
   * @param offer Offer payload
   * @param price Deal price
   * @param asset Deal asset
   * @param status Current deal status
   */
  struct Deal {
    uint256 created;
    Offer offer;
    bytes32 retailerId;
    address buyer;
    uint256 price;
    address asset;
    DealStatus status;
  }

  /// @dev Mapping of context to allowed statuses list
  mapping(bytes32 => DealStatus[]) private allowedStatuses;

  /// @dev Mapping of an offer Id on a Deal
  mapping(bytes32 => Deal) public deals;

  /**
   * @dev Emitted when a Deal status is updated
   * @param offerId The Id of the offer used to create the deal
   * @param status The deal status
   * @param sender The address of the user who is updated the status of the deal
   */
  event Status(
    bytes32 indexed offerId,
    DealStatus status,
    address indexed sender
  );

  /// @dev Thrown when a user attempts to provide an invalid config property value
  error InvalidConfig();

  /// @dev Thrown when a user attempts to create a deal using an offer with an invalid signature
  error InvalidOfferSignature();

  /// @dev Thrown when a user attempts to create an already existing Deal
  error DealExists();

  /// @dev Thrown when Deal was created in the `_beforeCreate` hook
  error DealAlreadyCreated();

  /// @dev Thrown when the Deal is not found
  error DealNotFound();

  /// @dev Thrown when a user attempts to create a deal providing an invalid payment options
  error InvalidPaymentOptions();

  /// @dev Thrown when a user attempts to create a deal providing an invalid payment option Id
  error InvalidPaymentId();

  /// @dev Thrown when a Deal funds transfer is failed
  error DealFundsTransferFailed();

  /// @dev Thrown when the supplier of the offer is not found
  error InvalidSupplier();

  /// @dev Thrown when the retailer of the offer is not found
  error InvalidRetailer();

  /// @dev Thrown when the supplier of the offer is not enabled
  error DisabledSupplier();

  /// @dev Thrown when the retailer is not enabled
  error DisabledRetailer();

  /// @dev Thrown when a function call is not allowed for current user
  error NotAllowedAuth();

  /// @dev Thrown when a user attempts to claim the deal in non-created status
  error NotAllowedStatus();

  /// @dev Thrown when a user attempts to do something that not allowed at a moment
  error NotAllowedTime();

  /// @dev Thrown when a user attempts to cancel the deal using invalid cancellation options
  error InvalidCancelOptions();

  /// @dev Thrown when percents value greater than 100
  error InvalidPercent();

  /**
   * @dev DealsRegistry constructor
   * @param _name The name of the contract
   * @param _version The version of the contract
   * @param _claimPeriod The default time period, in seconds, allowed for the supplier to claim the deal.
   * @param _protocolFee Protocol's fee in percents
   * @param _retailerFee Retailer's fee in percents
   * @param _feeRecipient he recipient of the protocol fee
   * @param _asset The address of the asset
   * @param _minDeposit The minimum deposit required for the contract
   */
  constructor(
    string memory _name,
    string memory _version,
    uint256 _claimPeriod,
    uint256 _protocolFee,
    uint256 _retailerFee,
    address _feeRecipient,
    address _asset,
    uint256 _minDeposit
  ) EIP712(_name, _version) SuppliersRegistry(_asset, _minDeposit) {
    // The default time period, in seconds, allowed for the supplier to claim the deal.
    // The buyer is not able to cancel the deal during this period
    config("claim_period", _claimPeriod);

    // The recipient of the protocol fee
    config("fee_recipient", _feeRecipient);

    // In total, all the fees must not be greater than 100.
    // Of course, having 100% of the fees is absurd case.
    if (_protocolFee.add(_retailerFee) > 100) {
      revert InvalidConfig();
    }

    // Protocol's fee in percents
    config("protocol_fee", _protocolFee);

    // Retailer's fee in percents
    config("retailer_fee", _retailerFee);

    // Allowed statuses for functions execution
    allowedStatuses["reject"] = [DealStatus.Created];
    allowedStatuses["cancel"] = [DealStatus.Created, DealStatus.Claimed];
    allowedStatuses["refund"] = [DealStatus.Claimed, DealStatus.CheckedIn];
    allowedStatuses["claim"] = [DealStatus.Created];
    allowedStatuses["checkIn"] = [DealStatus.Claimed];
    allowedStatuses["checkOut"] = [DealStatus.CheckedIn];
    allowedStatuses["dispute"] = [DealStatus.CheckedIn, DealStatus.CheckedOut];
  }

  /// Modifiers

  /**
   * @dev Modifier to make a function callable only when deal is exists
   *
   * Requirements:
   *
   * - the deal of the `offerId` must exists
   */
  modifier dealExists(bytes32 offerId) {
    if (deals[offerId].offer.id == bytes32(0)) {
      revert DealNotFound();
    }
    _;
  }

  /**
   * @dev Modifier to make a function callable only when deal in specific statuses.
   *
   * Requirements:
   *
   * - the deal of the `offerId` must exists
   * - the deal is in `statuses`
   */
  modifier inStatuses(bytes32 offerId, DealStatus[] memory statuses) {
    uint256 allowed;
    DealStatus currentStatus = deals[offerId].status;

    for (uint256 i = 0; i < statuses.length; i++) {
      if (currentStatus == statuses[i]) {
        allowed = 1;
        break;
      }
    }

    if (allowed != 1) {
      revert NotAllowedStatus();
    }
    _;
  }

  /**
   * @dev Modifier to make a function callable only by supplier's signer.
   *
   * Requirements:
   *
   * - the function called by the supplier's signer
   */
  modifier onlySigner(bytes32 offerId) {
    if (_msgSender() != suppliers[deals[offerId].offer.supplierId].signer) {
      revert NotAllowedAuth();
    }
    _;
  }

  /// Utilities

  /// @dev Create a has of bytes32 array
  function hash(bytes32[] memory _hashes) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_hashes));
  }

  /// @dev Creates a hash of a PaymentOption
  function hash(
    PaymentOption memory _paymentOptions
  ) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(
          PAYMENT_OPTION_TYPE_HASH,
          _paymentOptions.id,
          _paymentOptions.price,
          _paymentOptions.asset
        )
      );
  }

  /// @dev Creates a hash of a CancelOption
  function hash(CancelOption memory _cancel) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(CANCEL_OPTION_TYPE_HASH, _cancel.time, _cancel.penalty)
      );
  }

  /// @dev Creates a hash of an array of PaymentOption
  function hash(
    PaymentOption[] memory _paymentOptions
  ) internal pure returns (bytes32) {
    bytes32[] memory hashes = new bytes32[](_paymentOptions.length);

    for (uint256 i = 0; i < _paymentOptions.length; i++) {
      hashes[i] = hash(_paymentOptions[i]);
    }

    return hash(hashes);
  }

  /// @dev Creates a hash of an array of CancelOption
  function hash(
    CancelOption[] memory _cancelOptions
  ) internal pure returns (bytes32) {
    bytes32[] memory hashes = new bytes32[](_cancelOptions.length);

    for (uint256 i = 0; i < _cancelOptions.length; i++) {
      hashes[i] = hash(_cancelOptions[i]);
    }

    return hash(hashes);
  }

  /// @dev Creates a hash of an Offer
  function hash(Offer memory _offer) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          OFFER_TYPE_HASH,
          _offer.id,
          _offer.expire,
          _offer.supplierId,
          _offer.chainId,
          _offer.requestHash,
          _offer.optionsHash,
          _offer.paymentHash,
          _offer.cancelHash,
          _offer.transferable,
          _offer.checkIn
        )
      );
  }

  /// @dev Create a hash of check-in data
  function hashCheckInOut(
    bytes32 _id,
    address _signer
  ) internal pure returns (bytes32) {
    return keccak256(abi.encode(CHECK_IN_TYPE_HASH, _id, _signer));
  }

  /// @dev Calculates percentage value
  function _percentage(
    uint256 value,
    uint256 percent
  ) internal pure returns (uint256) {
    if (percent > 100) {
      revert InvalidPercent();
    }
    return value.mul(1000).mul(percent).div(100).div(1000);
  }

  /// Workflow hooks

  /**
   * @dev Hook function that runs before a new deal is created.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offer The offer used to create the deal
   * @param price The price of the asset in wei
   * @param asset The address of the ERC20 token used for payment
   * @param signs An array of signatures authorizing the creation of the deal
   */
  function _beforeCreate(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after a new deal is created.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offer The offer used to create the deal
   * @param price The price of the asset in wei
   * @param asset The address of the ERC20 token used for payment
   * @param signs An array of signatures authorizing the creation of the deal
   */
  function _afterCreate(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is rejected by a supplier.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param reason Rejection reason
   */
  function _beforeReject(
    bytes32 offerId,
    bytes32 reason
  ) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is rejected by s supplier.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param reason Rejection reason
   */
  function _afterReject(bytes32 offerId, bytes32 reason) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is canceled.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _beforeCancel(bytes32 offerId) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is canceled.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _afterCancel(bytes32 offerId) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is refunded.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _beforeRefund(bytes32 offerId) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is refunded.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _afterRefund(bytes32 offerId) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is claimed.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param buyer Address of the deal buyer
   */
  function _beforeClaim(
    bytes32 offerId,
    address buyer
  ) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is claimed.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param buyer Address of the deal buyer
   */
  function _afterClaim(bytes32 offerId, address buyer) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is checked in.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param signs An array of signatures authorizing the check in of the deal
   */
  function _beforeCheckIn(
    bytes32 offerId,
    bytes[] memory signs
  ) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is checked in.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   * @param signs An array of signatures authorizing the check in of the deal
   */
  function _afterCheckIn(
    bytes32 offerId,
    bytes[] memory signs
  ) internal virtual {}

  /**
   * @dev Hook function that runs before the deal is checked out.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _beforeCheckOut(bytes32 offerId) internal virtual whenNotPaused {}

  /**
   * @dev Hook function that runs after the deal is checked out.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offerId The offerId of the deal
   */
  function _afterCheckOut(bytes32 offerId) internal virtual {}

  /// Features

  /**
   * @dev Creates a Deal on a base of an offer
   * @param offer An offer payload
   * @param paymentOptions Raw offered payment options array
   * @param paymentId Payment option Id
   * @param retailerId Retailer Id
   * @param signs Signatures: [0] - offer: ECDSA/ERC1271; [1] - asset permit: ECDSA (optional)
   *
   * Requirements:
   *
   * - supplier of the offer must be registered
   * - offer must be signed with a proper signer
   * - the deal should not be created before
   * - the deal should not be created inside the _before hook
   * - payment options must be valid (equal to those from the offer)
   * - payment Id must exists in payment options
   * - the contract must be able to make transfer of funds
   *
   * NOTE: `permit` signature can be ECDSA of type only
   */
  function deal(
    Offer memory offer,
    PaymentOption[] memory paymentOptions,
    bytes32 paymentId,
    bytes32 retailerId,
    bytes[] memory signs
  ) external {
    address buyer = _msgSender();

    /// @dev variable scoping used to avoid stack too deep errors
    /// The `supplier` storage variable is required is the frame of this scope only
    {
      bytes32 offerHash = _hashTypedDataV4(hash(offer));
      Supplier storage supplier = suppliers[offer.supplierId];

      // Supplier who created an offer must be registered
      if (supplier.signer == address(0)) {
        revert InvalidSupplier();
      }

      // Checking ECDSA/AA signature is valid
      if (!supplier.signer.isValidSignatureNow(offerHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      // Not-enabled suppliers are not allowed to accept deals
      // So, we cannot allow to create such a deal
      if (!supplier.enabled || deposits[offer.supplierId] == 0) {
        revert DisabledSupplier();
      }

      // The retailer is optional, so we validate its rules only if retailerId is defined
      if (retailerId != bytes32(0)) {
        Supplier storage retailer = suppliers[retailerId];

        // Retailer must be registered
        if (retailer.owner == address(0)) {
          revert InvalidRetailer();
        }

        // Not-enabled retailer are not allowed
        if (!retailer.enabled || deposits[retailerId] == 0) {
          revert DisabledRetailer();
        }
      }

      // Deal can be created only once
      if (deals[offer.id].offer.id == offer.id) {
        revert DealExists();
      }

      bytes32 paymentHash = hash(paymentOptions);

      // payment options provided with argument must be the same
      // as signed in the offer
      if (paymentHash != offer.paymentHash) {
        revert InvalidPaymentOptions();
      }
    }

    uint256 price;
    address asset;

    for (uint256 i = 0; i < paymentOptions.length; i++) {
      // Payment id must be one of the defined in payment options
      if (paymentOptions[i].id == paymentId) {
        price = paymentOptions[i].price;
        asset = paymentOptions[i].asset;
        break;
      }
    }

    if (asset == address(0)) {
      revert InvalidPaymentId();
    }

    _beforeCreate(offer, price, asset, signs);

    // Check that the deal was not created by `_beforeCreate` hook
    if (deals[offer.id].offer.id == offer.id) {
      revert DealAlreadyCreated();
    }

    // Creating the deal before any external call to avoid reentrancy
    deals[offer.id] = Deal(
      block.timestamp,
      offer,
      retailerId,
      buyer,
      price,
      asset,
      DealStatus.Created
    );

    if (signs.length > 1) {
      // Use permit function to transfer tokens from the sender to the contract
      (uint8 v, bytes32 r, bytes32 s) = signs[1].split();
      IERC20(asset).permit(buyer, address(this), price, offer.expire, v, r, s);
    }

    // Use transferFrom function to transfer tokens from the sender to the contract
    if (!IERC20(asset).transferFrom(buyer, address(this), price)) {
      revert DealFundsTransferFailed();
    }

    emit Status(offer.id, DealStatus.Created, buyer);

    _afterCreate(offer, price, asset, signs);
  }

  /**
   * @dev Rejects the deal
   * @param offerId The deal offer Id
   * @param reason Rejection reason
   *
   * Requirements:
   *
   * - the deal must exists
   * - the deal must be in status DealStatus.Created
   * - must be called by the signer address of the deal offer supplier
   */
  function reject(
    bytes32 offerId,
    bytes32 reason
  )
    external
    dealExists(offerId)
    onlySigner(offerId)
    inStatuses(offerId, allowedStatuses["reject"])
  {
    Deal storage storedDeal = deals[offerId];

    // Moving to the Rejected status before all to avoid reentrancy
    storedDeal.status = DealStatus.Rejected;

    _beforeReject(offerId, reason);

    if (
      !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, DealStatus.Rejected, _msgSender());

    _afterReject(offerId, reason);
  }

  /**
   * @dev Refunds the deal
   * @param offerId The deal offer Id
   *
   * Requirements:
   *
   * - the deal must exists
   * - the deal must be in status DealStatus.CheckedIn
   * - must be called by the signer address of the deal offer supplier
   */
  function refund(
    bytes32 offerId
  )
    external
    dealExists(offerId)
    onlySigner(offerId)
    inStatuses(offerId, allowedStatuses["refund"])
  {
    Deal storage storedDeal = deals[offerId];

    // Moving to the Refunded status before all to avoid reentrancy
    storedDeal.status = DealStatus.Refunded;

    _beforeRefund(offerId);

    if (
      !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, DealStatus.Refunded, _msgSender());

    _afterRefund(offerId);
  }

  /**
   * @dev Cancels the deal
   * @param offerId The deal offer Id
   * @param _cancelOptions Cancellation options from offer
   *
   * Requirements:
   *
   * - the deal must exists
   * - the deal must be in status DealStatus.Created or DealStatus.Claimed
   * - must be called by buyer
   * - if the deal in DealStatus.Claimed status:
   *   - if block.timestamp > checkIn time then zero refund
   *   - cancellation rules must follow the rules defined by offer
   */
  function cancel(
    bytes32 offerId,
    CancelOption[] memory _cancelOptions
  )
    external
    dealExists(offerId)
    inStatuses(offerId, allowedStatuses["cancel"])
  {
    address sender = _msgSender();
    Deal storage storedDeal = deals[offerId];

    if (sender != storedDeal.buyer) {
      revert NotAllowedAuth();
    }

    // Buyer is not able to cancel the deal during `claim_period`
    // This time is given to the supplier to claim the deal
    if (block.timestamp < storedDeal.created.add(numbers["claim_period"])) {
      revert NotAllowedTime();
    }

    DealStatus callStatus = storedDeal.status;

    // Moving to the Cancelled status before all to avoid reentrancy
    storedDeal.status = DealStatus.Cancelled;

    _beforeCancel(offerId);

    if (callStatus == DealStatus.Created) {
      // Full refund
      if (
        !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
      ) {
        revert DealFundsTransferFailed();
      }
    } else if (
      callStatus == DealStatus.Claimed &&
      block.timestamp < storedDeal.offer.checkIn
    ) {
      if (storedDeal.offer.cancelHash != hash(_cancelOptions)) {
        revert InvalidCancelOptions();
      }

      // Using offer cancellation rules
      uint256 selectedTime;
      uint256 selectedPenalty;

      for (uint256 i = 0; i < _cancelOptions.length; i++) {
        if (
          block.timestamp >= _cancelOptions[i].time &&
          (selectedTime == 0 || _cancelOptions[i].time < selectedTime)
        ) {
          selectedTime = _cancelOptions[i].time;
          selectedPenalty = _cancelOptions[i].penalty;
        }
      }

      if (selectedPenalty > 100) {
        selectedPenalty = 100;
      }

      uint256 penaltyValue = _percentage(storedDeal.price, selectedPenalty);

      if (
        !IERC20(storedDeal.asset).transfer(
          storedDeal.buyer,
          storedDeal.price.sub(penaltyValue)
        )
      ) {
        revert DealFundsTransferFailed();
      }

      if (
        penaltyValue > 0 &&
        !IERC20(storedDeal.asset).transfer(
          suppliers[storedDeal.offer.supplierId].owner,
          penaltyValue
        )
      ) {
        revert DealFundsTransferFailed();
      }
    } else {
      revert NotAllowedStatus();
    }

    emit Status(offerId, DealStatus.Cancelled, sender);

    _afterCancel(offerId);
  }

  /**
   * @dev Claims the deal
   * @param offerId The deal offer Id
   *
   * Requirements:
   *
   * - the deal must exists
   * - the deal must be in status DealStatus.Created
   * - must be called by the signer address of the deal offer supplier
   */
  function claim(
    bytes32 offerId
  )
    external
    dealExists(offerId)
    onlySigner(offerId)
    inStatuses(offerId, allowedStatuses["claim"])
  {
    Deal storage storedDeal = deals[offerId];

    _beforeClaim(offerId, storedDeal.buyer);

    storedDeal.status = DealStatus.Claimed;
    emit Status(offerId, DealStatus.Claimed, _msgSender());

    _afterClaim(offerId, storedDeal.buyer);
  }

  /**
   * @dev Checks in the deal
   * @param offerId The deal offer Id
   * @param signs Signatures
   *
   * Requirements:
   *
   * - the deal must exists
   * - the deal must be in status DealStatus.Claimed
   * - must be called by the supplier's signer or buyer's address
   * - if called by the supplier's signer:
   *   - a valid signature of suppliers's signer must be provided in signs[0]
   *   - if before sign-in time: a valid signature of the buyer must be provided in signs[1]
   * - if called buy buyer:
   *   - a valid signature of the buyer must be provided in signs[0]
   *   - a valid signature of suppliers's signer must be provided in signs[1]
   */
  function checkIn(
    bytes32 offerId,
    bytes[] memory signs
  )
    external
    dealExists(offerId)
    inStatuses(offerId, allowedStatuses["checkIn"])
  {
    Deal storage storedDeal = deals[offerId];
    Supplier storage supplier = suppliers[storedDeal.offer.supplierId];

    address sender = _msgSender();
    bytes32 signInHash;

    if (sender == supplier.signer) {
      // The function is called by the supplier's signer
      signInHash = _hashTypedDataV4(
        hashCheckInOut(storedDeal.offer.id, supplier.signer)
      );

      // Checking ECDSA/AA signature of the suppliers's signer is valid
      if (!supplier.signer.isValidSignatureNow(signInHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      // Before checkIn time of the offer a signature of the buyer is required
      if (block.timestamp < storedDeal.offer.checkIn) {
        signInHash = _hashTypedDataV4(
          hashCheckInOut(storedDeal.offer.id, storedDeal.buyer)
        );

        // Checking ECDSA/AA signature of the buyer is valid
        if (!storedDeal.buyer.isValidSignatureNow(signInHash, signs[1])) {
          revert InvalidOfferSignature();
        }
      }
    } else if (sender == storedDeal.buyer) {
      signInHash = _hashTypedDataV4(
        hashCheckInOut(storedDeal.offer.id, storedDeal.buyer)
      );

      // Checking ECDSA/AA signature of the suppliers's signer is valid
      if (!storedDeal.buyer.isValidSignatureNow(signInHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      signInHash = _hashTypedDataV4(
        hashCheckInOut(storedDeal.offer.id, supplier.signer)
      );

      // Checking ECDSA/AA signature of the buyer is valid
      if (!supplier.signer.isValidSignatureNow(signInHash, signs[1])) {
        revert InvalidOfferSignature();
      }
    } else {
      revert NotAllowedAuth();
    }

    // Execute before checkIn hook
    _beforeCheckIn(offerId, signs);

    storedDeal.status = DealStatus.CheckedIn;
    emit Status(offerId, DealStatus.CheckedIn, sender);

    // Execute after checkIn hook
    _afterCheckIn(offerId, signs);
  }

  /**
   * @dev Checks out the deal and sends funds to the supplier
   * @param offerId The deal offer Id
   *
   * Requirements:
   *
   * - the deal must exists
   * - must be called by the supplier's signer only
   * - the deal must be in status DealStatus.CheckIn
   * - must be called after checkOut time only
   */
  function checkOut(
    bytes32 offerId
  )
    external
    dealExists(offerId)
    onlySigner(offerId)
    inStatuses(offerId, allowedStatuses["checkOut"])
  {
    Deal storage storedDeal = deals[offerId];

    if (block.timestamp < storedDeal.offer.checkOut) {
      revert NotAllowedTime();
    }

    // Moving to CheckedOut status before all to avoid reentrancy
    storedDeal.status = DealStatus.CheckedOut;

    // Execute before checkOut hook
    _beforeCheckOut(offerId);

    uint256 protocolFee;
    uint256 retailerFee;
    uint256 supplierValue;

    protocolFee = _percentage(storedDeal.price, numbers["protocol_fee"]);

    if (storedDeal.retailerId != bytes32(0)) {
      retailerFee = _percentage(storedDeal.price, numbers["retailer_fee"]);
    }

    supplierValue = storedDeal.price.sub(protocolFee).sub(retailerFee);

    if (
      protocolFee > 0 &&
      // Sends fee to the protocol recipient
      !IERC20(storedDeal.asset).transfer(
        addresses["fee_recipient"],
        protocolFee
      )
    ) {
      revert DealFundsTransferFailed();
    }

    if (
      retailerFee > 0 &&
      // Send fee to the deal retailer
      !IERC20(storedDeal.asset).transfer(
        suppliers[storedDeal.retailerId].owner,
        retailerFee
      )
    ) {
      revert DealFundsTransferFailed();
    }

    if (
      // Sends value to the supplier
      !IERC20(storedDeal.asset).transfer(
        suppliers[storedDeal.offer.supplierId].owner,
        supplierValue
      )
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, DealStatus.CheckedOut, _msgSender());

    // Execute after checkOut hook
    _afterCheckOut(offerId);
  }

  uint256[50] private __gap;
}
