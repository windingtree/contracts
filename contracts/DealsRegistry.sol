// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./SuppliersRegistry.sol";
import "./utils/IERC20.sol";
import "./utils/StringUtils.sol";
import "./utils/SignatureUtils.sol";

/**
 * @title DealsRegistry
 * @dev A smart contract for creating and managing deals between buyers and sellers.
 * The contract stores offers made by suppliers, and allows buyers to create deals based on those offers.
 * Each deal specifies the payment and cancellation terms, and can be tracked on-chain using its unique Id.
 */
abstract contract DealsRegistry is Context, EIP712, SuppliersRegistry {
  using SignatureChecker for address;
  using SignatureUtils for bytes;

  bytes32 public constant PAYMENT_OPTION_TYPE_HASH =
    keccak256("PaymentOption(bytes32 id,uint256 price,address asset)");

  bytes32 public constant CANCEL_OPTION_TYPE_HASH =
    keccak256("CancelOption(uint256 time,uint256 penalty)");

  bytes32 public constant OFFER_TYPE_HASH =
    keccak256(
      // solhint-disable-next-line max-line-length
      "Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn)"
    );

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
  }

  /**
   * @dev Deal status
   */
  enum DealStatus {
    Created, // Just created
    Claimed, // Claimed by the supplier
    Rejected, // Rejected by the supplier
    Cancelled, // Cancelled by the buyer
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
    Offer offer;
    uint256 price;
    address asset;
    DealStatus status;
  }

  /// @dev Mapping of an offer Id on a Deal
  mapping(bytes32 => Deal) public deals;

  /**
   * @dev Emitted when a Deal is created by a buyer
   * @param offerId The Id of the offer used to create the deal
   * @param buyer The address of the buyer who created the deal
   */
  event DealCreated(bytes32 indexed offerId, address indexed buyer);

  /// @dev Thrown when a user attempts to create a deal using an offer with an invalid signature
  error InvalidOfferSignature();

  /// @dev Thrown when a user attempts to create an already existing Deal
  error DealExists();

  /// @dev Thrown when a user attempts to create a deal providing an invalid payment options
  error InvalidPaymentOptions();

  /// @dev Thrown when a user attempts to create a deal providing an invalid payment option Id
  error InvalidPaymentId();

  /// @dev Thrown when a Deal funds transfer is failed
  error DealFundsTransferFailed();

  /// @dev Thrown when the supplier of the offer is not found
  error InvalidSupplier();

  /// @dev Thrown when the supplier of the offer is not enabled
  error DisabledSupplier();

  /**
   * @dev DealsRegistry constructor
   * @param name EIP712 contract name
   * @param version EIP712 contract version
   */
  constructor(
    string memory name,
    string memory version,
    address asset,
    uint256 minDeposit
  ) EIP712(name, version) SuppliersRegistry(asset, minDeposit) {}

  /// @dev Create a has of bytes32 array
  function hash(bytes32[] memory hashes) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(hashes));
  }

  /// @dev Creates a hash of a PaymentOption
  function hash(PaymentOption memory paymentOptions) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(
          PAYMENT_OPTION_TYPE_HASH,
          paymentOptions.id,
          paymentOptions.price,
          paymentOptions.asset
        )
      );
  }

  /// @dev Creates a hash of a CancelOption
  function hash(CancelOption memory cancel) internal pure returns (bytes32) {
    return
      keccak256(abi.encodePacked(CANCEL_OPTION_TYPE_HASH, cancel.time, cancel.penalty));
  }

  /// @dev Creates a hash of an array of PaymentOption
  function hash(PaymentOption[] memory paymentOptions) internal pure returns (bytes32) {
    bytes32[] memory hashes = new bytes32[](paymentOptions.length);

    for (uint256 i = 0; i < paymentOptions.length; i++) {
      hashes[i] = hash(paymentOptions[i]);
    }

    return hash(hashes);
  }

  /// @dev Creates a hash of an array of CancelOption
  function hash(CancelOption[] memory cancelOptions) internal pure returns (bytes32) {
    bytes32[] memory hashes = new bytes32[](cancelOptions.length);

    for (uint256 i = 0; i < cancelOptions.length; i++) {
      hashes[i] = hash(cancelOptions[i]);
    }

    return hash(hashes);
  }

  /// @dev Creates a hash of an Offer
  function hash(Offer memory offer) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          OFFER_TYPE_HASH,
          offer.id,
          offer.expire,
          offer.supplierId,
          offer.chainId,
          offer.requestHash,
          offer.optionsHash,
          offer.paymentHash,
          offer.cancelHash,
          offer.transferable,
          offer.checkIn
        )
      );
  }

  /**
   * @dev Creates a Deal on a base of an offer
   * @param offer An offer payload
   * @param paymentOptions Raw offered payment options array
   * @param paymentId Payment option Id
   * @param signs Signatures: [0] - offer: ECDSA/ERC1271; [1] - asset permit: ECDSA (optional)
   *
   * NOTE: `permit` signature can be ECDSA of type only
   */
  function deal(
    Offer memory offer,
    PaymentOption[] memory paymentOptions,
    bytes32 paymentId,
    bytes[] memory signs
  ) external {
    address buyer = _msgSender();

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
    if (!supplier.enabled) {
      revert DisabledSupplier();
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

    _beforeDealCreated(offer, price, asset, signs);

    // Creating the deal before any external call to avoid reentrancy
    deals[offer.id] = Deal(offer, price, asset, DealStatus.Created);

    if (signs.length > 1) {
      // Use permit function to transfer tokens from the sender to the contract
      (uint8 v, bytes32 r, bytes32 s) = signs[1].split();
      IERC20(asset).permit(buyer, address(this), price, offer.expire, v, r, s);
    } else {
      // Use transferFrom function to transfer tokens from the sender to the contract
      if (!IERC20(asset).transferFrom(buyer, address(this), price)) {
        revert DealFundsTransferFailed();
      }
    }

    emit DealCreated(offer.id, buyer);

    _afterDealCreated(offer, price, asset, signs);
  }

  /**
   * @dev Hook function that runs before a new deal is created.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offer The offer used to create the deal
   * @param price The price of the asset in wei
   * @param asset The address of the ERC20 token used for payment
   * @param signs An array of signatures authorizing the creation of the deal
   */
  function _beforeDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual {}

  /**
   * @dev Hook function that runs after a new deal is created.
   * Allows inheriting smart contracts to perform custom logic.
   * @param offer The offer used to create the deal
   * @param price The price of the asset in wei
   * @param asset The address of the ERC20 token used for payment
   * @param signs An array of signatures authorizing the creation of the deal
   */
  function _afterDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual {}

  uint256[50] private __gap;
}
