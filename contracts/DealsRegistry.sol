// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "./interfaces/IEntitiesRegistry.sol";
import "./interfaces/IConfig.sol";
import "./libraries/Utils.sol";
import "./libraries/SignatureUtils.sol";
import "./utils/IERC20.sol";

/**
 * @title DealsRegistry
 * @dev A smart contract for creating and managing deals between buyers and sellers.
 * The contract stores offers made by suppliers, and allows buyers to create deals based on those offers.
 * Each deal specifies the payment and cancellation terms, and can be tracked on-chain using its unique Id.
 */
abstract contract DealsRegistry is
  EIP712Upgradeable,
  PausableUpgradeable,
  OwnableUpgradeable
{
  using SignatureCheckerUpgradeable for address;
  using SignatureUtils for bytes;
  using SafeMathUpgradeable for uint256;

  /// @dev The protocol config contract address
  address public config;

  /// @dev Entities registry contract address
  address public entities;

  /// @dev Mapping of context to allowed statuses list
  mapping(bytes32 => Utils.DealStatus[]) private allowedStatuses;

  /// @dev Mapping of an offer Id on a Deal
  mapping(bytes32 => Utils.Deal) public deals;

  /// @dev Emitted when a Deal status is updated
  event Status(bytes32 offerId, Utils.DealStatus status, address sender);

  /// @dev Emitted when updated an address of the protocol config contract
  event SetConfig(address oldAddress, address newAddress);

  /// @dev Emitted when updated an address of the Entities registry contract
  event SetEntities(address oldAddress, address newAddress);

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

  /**
   * @dev DealsRegistry initializer
   * @param _name The name of the contract
   * @param _version The version of the contract
   * @param _config The protocol config contract address
   * @param _entities Entities registry contract address
   */
  function __DealsRegistry_init(
    string memory _name,
    string memory _version,
    address _config,
    address _entities
  ) internal onlyInitializing {
    __EIP712_init(_name, _version);
    __Pausable_init();

    // Save the protocol config contract address
    config = _config;

    // Save entities registry address
    entities = _entities;

    // Allowed statuses for functions execution
    allowedStatuses["reject"] = [Utils.DealStatus.Created];
    allowedStatuses["cancel"] = [
      Utils.DealStatus.Created,
      Utils.DealStatus.Claimed
    ];
    allowedStatuses["refund"] = [
      Utils.DealStatus.Claimed,
      Utils.DealStatus.CheckedIn
    ];
    allowedStatuses["claim"] = [Utils.DealStatus.Created];
    allowedStatuses["checkIn"] = [Utils.DealStatus.Claimed];
    allowedStatuses["checkOut"] = [Utils.DealStatus.CheckedIn];
    allowedStatuses["dispute"] = [
      Utils.DealStatus.CheckedIn,
      Utils.DealStatus.CheckedOut
    ];
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
  modifier inStatuses(bytes32 offerId, Utils.DealStatus[] memory statuses) {
    uint256 allowed;
    Utils.DealStatus currentStatus = deals[offerId].status;

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
    if (
      _msgSender() !=
      IEntitiesRegistry(entities)
        .getEntity(deals[offerId].offer.supplierId)
        .signer
    ) {
      revert NotAllowedAuth();
    }
    _;
  }

  /// Utilities

  /**
   * @dev Sets the new address of the protocol config contract address
   * @param _config The new protocol config contract address
   */
  function setConfig(address _config) external onlyOwner {
    emit SetConfig(config, _config);
    config = _config;
  }

  /**
   * @dev Sets the new address of the entities registry
   * @param _entities The new protocol config contract address
   */
  function setEntities(address _entities) external onlyOwner {
    emit SetEntities(entities, _entities);
    entities = _entities;
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
    Utils.Offer memory offer,
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
    Utils.Offer memory offer,
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
    Utils.Offer memory offer,
    Utils.PaymentOption[] memory paymentOptions,
    bytes32 paymentId,
    bytes32 retailerId,
    bytes[] memory signs
  ) external {
    address buyer = _msgSender();

    /// @dev variable scoping used to avoid stack too deep errors
    /// The `supplier` storage variable is required is the frame of this scope only
    {
      bytes32 offerHash = _hashTypedDataV4(Utils.hash(offer));
      IEntitiesRegistry.Entity memory supplier = IEntitiesRegistry(entities)
        .getEntity(offer.supplierId);

      // Checking ECDSA/AA signature is valid
      if (!supplier.signer.isValidSignatureNow(offerHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      // Not-enabled suppliers are not allowed to accept deals
      // So, we cannot allow to create such a deal
      if (!IEntitiesRegistry(entities).isEntityEnabled(offer.supplierId)) {
        revert DisabledSupplier();
      }

      // The retailer is optional, so we validate its rules only if retailerId is defined
      if (retailerId != bytes32(0)) {
        IEntitiesRegistry.Entity memory retailer = IEntitiesRegistry(entities)
          .getEntity(retailerId);

        // Retailer must be registered
        if (retailer.owner == address(0)) {
          revert InvalidRetailer();
        }

        // Not-enabled retailer are not allowed
        if (!IEntitiesRegistry(entities).isEntityEnabled(retailerId)) {
          revert DisabledRetailer();
        }
      }

      // Deal can be created only once
      if (deals[offer.id].offer.id == offer.id) {
        revert DealExists();
      }

      bytes32 paymentHash = Utils.hash(paymentOptions);

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
    deals[offer.id] = Utils.Deal(
      block.timestamp,
      offer,
      retailerId,
      buyer,
      price,
      asset,
      Utils.DealStatus.Created
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

    emit Status(offer.id, Utils.DealStatus.Created, buyer);

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
    Utils.Deal storage storedDeal = deals[offerId];

    // Moving to the Rejected status before all to avoid reentrancy
    storedDeal.status = Utils.DealStatus.Rejected;

    _beforeReject(offerId, reason);

    if (
      !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, Utils.DealStatus.Rejected, _msgSender());

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
    Utils.Deal storage storedDeal = deals[offerId];

    // Moving to the Refunded status before all to avoid reentrancy
    storedDeal.status = Utils.DealStatus.Refunded;

    _beforeRefund(offerId);

    if (
      !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, Utils.DealStatus.Refunded, _msgSender());

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
    Utils.CancelOption[] memory _cancelOptions
  )
    external
    dealExists(offerId)
    inStatuses(offerId, allowedStatuses["cancel"])
  {
    address sender = _msgSender();
    Utils.Deal storage storedDeal = deals[offerId];

    if (sender != storedDeal.buyer) {
      revert NotAllowedAuth();
    }

    // Buyer is not able to cancel the deal during `claim_period`
    // This time is given to the supplier to claim the deal
    if (
      block.timestamp <
      storedDeal.created.add(IConfig(config).getNumber("claim_period"))
    ) {
      revert NotAllowedTime();
    }

    Utils.DealStatus callStatus = storedDeal.status;

    // Moving to the Cancelled status before all to avoid reentrancy
    storedDeal.status = Utils.DealStatus.Cancelled;

    _beforeCancel(offerId);

    if (callStatus == Utils.DealStatus.Created) {
      // Full refund
      if (
        !IERC20(storedDeal.asset).transfer(storedDeal.buyer, storedDeal.price)
      ) {
        revert DealFundsTransferFailed();
      }
    } else if (
      callStatus == Utils.DealStatus.Claimed &&
      block.timestamp < storedDeal.offer.checkIn
    ) {
      if (storedDeal.offer.cancelHash != Utils.hash(_cancelOptions)) {
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

      uint256 penaltyValue = Utils._percentage(
        storedDeal.price,
        selectedPenalty
      );

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
          IEntitiesRegistry(entities)
            .getEntity(storedDeal.offer.supplierId)
            .owner,
          penaltyValue
        )
      ) {
        revert DealFundsTransferFailed();
      }
    } else {
      revert NotAllowedStatus();
    }

    emit Status(offerId, Utils.DealStatus.Cancelled, sender);

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
    Utils.Deal storage storedDeal = deals[offerId];

    _beforeClaim(offerId, storedDeal.buyer);

    storedDeal.status = Utils.DealStatus.Claimed;
    emit Status(offerId, Utils.DealStatus.Claimed, _msgSender());

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
    Utils.Deal storage storedDeal = deals[offerId];
    IEntitiesRegistry.Entity memory supplier = IEntitiesRegistry(entities)
      .getEntity(storedDeal.offer.supplierId);

    address sender = _msgSender();
    bytes32 signInHash;

    if (sender == supplier.signer) {
      // The function is called by the supplier's signer
      signInHash = _hashTypedDataV4(
        Utils.hashCheckInOut(storedDeal.offer.id, supplier.signer)
      );

      // Checking ECDSA/AA signature of the suppliers's signer is valid
      if (!supplier.signer.isValidSignatureNow(signInHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      // Before checkIn time of the offer a signature of the buyer is required
      if (block.timestamp < storedDeal.offer.checkIn) {
        signInHash = _hashTypedDataV4(
          Utils.hashCheckInOut(storedDeal.offer.id, storedDeal.buyer)
        );

        // Checking ECDSA/AA signature of the buyer is valid
        if (!storedDeal.buyer.isValidSignatureNow(signInHash, signs[1])) {
          revert InvalidOfferSignature();
        }
      }
    } else if (sender == storedDeal.buyer) {
      signInHash = _hashTypedDataV4(
        Utils.hashCheckInOut(storedDeal.offer.id, storedDeal.buyer)
      );

      // Checking ECDSA/AA signature of the suppliers's signer is valid
      if (!storedDeal.buyer.isValidSignatureNow(signInHash, signs[0])) {
        revert InvalidOfferSignature();
      }

      signInHash = _hashTypedDataV4(
        Utils.hashCheckInOut(storedDeal.offer.id, supplier.signer)
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

    storedDeal.status = Utils.DealStatus.CheckedIn;
    emit Status(offerId, Utils.DealStatus.CheckedIn, sender);

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
    Utils.Deal storage storedDeal = deals[offerId];

    if (block.timestamp < storedDeal.offer.checkOut) {
      revert NotAllowedTime();
    }

    // Moving to CheckedOut status before all to avoid reentrancy
    storedDeal.status = Utils.DealStatus.CheckedOut;

    // Execute before checkOut hook
    _beforeCheckOut(offerId);

    uint256 protocolFee;
    uint256 retailerFee;
    uint256 supplierValue;

    protocolFee = Utils._percentage(
      storedDeal.price,
      IConfig(config).getNumber("protocol_fee")
    );

    if (storedDeal.retailerId != bytes32(0)) {
      retailerFee = Utils._percentage(
        storedDeal.price,
        IConfig(config).getNumber("retailer_fee")
      );
    }

    supplierValue = storedDeal.price.sub(protocolFee).sub(retailerFee);

    if (
      protocolFee > 0 &&
      // Sends fee to the protocol recipient
      !IERC20(storedDeal.asset).transfer(
        IConfig(config).getAddress("fee_recipient"),
        protocolFee
      )
    ) {
      revert DealFundsTransferFailed();
    }

    if (
      retailerFee > 0 &&
      // Send fee to the deal retailer
      !IERC20(storedDeal.asset).transfer(
        IEntitiesRegistry(entities).getEntity(storedDeal.retailerId).owner,
        retailerFee
      )
    ) {
      revert DealFundsTransferFailed();
    }

    if (
      // Sends value to the supplier
      !IERC20(storedDeal.asset).transfer(
        IEntitiesRegistry(entities)
          .getEntity(storedDeal.offer.supplierId)
          .owner,
        supplierValue
      )
    ) {
      revert DealFundsTransferFailed();
    }

    emit Status(offerId, Utils.DealStatus.CheckedOut, _msgSender());

    // Execute after checkOut hook
    _afterCheckOut(offerId);
  }

  uint256[50] private __gap;
}
