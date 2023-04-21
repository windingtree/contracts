// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./utils/IERC20.sol";
import "./utils/StringUtils.sol";
import "./utils/SignatureUtils.sol";

abstract contract DealsRegistry is Context, EIP712 {
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
   */
  struct PaymentOption {
    /// @dev Unique paymentOptions option Id
    bytes32 id;
    /// @dev Asset price in WEI
    uint256 price;
    /// @dev ERC20 asset contract address
    address asset;
  }

  /**
   * @dev Deal cancellation option
   */
  struct CancelOption {
    /// @dev Seconds before checkIn
    uint256 time;
    /// @dev Percents of total sum
    uint256 penalty;
  }

  /**
   * @dev Offer payload
   */
  struct Offer {
    /// @dev Offer Id
    bytes32 id;
    /// @dev Expiration time
    uint256 expire;
    /// @dev Unique supplier Id registered on the protocol contract
    bytes32 supplierId;
    /// @dev Target network chain Id
    uint256 chainId;
    /// @dev <keccak256(encode(request))>
    bytes32 requestHash;
    /// @dev <keccak256(encode(offer.options))>
    bytes32 optionsHash;
    /// @dev <keccak256(encode(offer.payment))>
    bytes32 paymentHash;
    /// @dev <keccak256(encode(offer.cancel(sorted by time DESC) || []))>
    bytes32 cancelHash;
    /// @dev makes the deal NFT transferable or not
    bool transferable;
    /// @dev check-in time in seconds
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
   */
  struct Deal {
    /// @dev Offer payload
    Offer offer;
    /// @dev Deal price
    uint256 price;
    /// @dev Deal asset
    address asset;
    /// @dev Current deal status
    DealStatus status;
  }

  /// @dev Mapping of an offer Id on a Deal
  mapping(bytes32 => Deal) public deals;

  /// @dev Emitted when a Deal is created by a buyer
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

  /**
   * @dev DealsRegistry constructor
   * @param name EIP712 contract name
   * @param version EIP712 contract version
   */
  constructor(string memory name, string memory version) EIP712(name, version) {}

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
  function hash(CancelOption[] memory cancel) internal pure returns (bytes32) {
    bytes32[] memory hashes = new bytes32[](cancel.length);

    for (uint256 i = 0; i < cancel.length; i++) {
      hashes[i] = hash(cancel[i]);
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

    // bytes32 offerHash = _hashTypedDataV4(hash(offer));

    // @todo Create supplier registry
    // @todo Get supplier signer address from the supplier registry

    // if (!supplier.isValidSignatureNow(offerHash, signs[0])) {
    //   revert InvalidOfferSignature();
    // }

    if (deals[offer.id].offer.id == offer.id) {
      revert DealExists();
    }

    bytes32 paymentHash = hash(paymentOptions);

    if (paymentHash != offer.paymentHash) {
      revert InvalidPaymentOptions();
    }

    uint256 price;
    address asset;

    for (uint256 i = 0; i < paymentOptions.length; i++) {
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

    if (signs.length > 1) {
      (uint8 v, bytes32 r, bytes32 s) = signs[1].split();
      IERC20(asset).permit(buyer, address(this), price, offer.expire, v, r, s);
    } else if (!IERC20(asset).transferFrom(buyer, address(this), price)) {
      revert DealFundsTransferFailed();
    }

    deals[offer.id] = Deal(offer, price, asset, DealStatus.Created);

    emit DealCreated(offer.id, buyer);

    _afterDealCreated(offer, price, asset, signs);
  }

  function _beforeDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual {}

  function _afterDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal virtual {}
}
