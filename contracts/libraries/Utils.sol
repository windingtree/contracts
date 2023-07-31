// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

library Utils {
  using SafeMathUpgradeable for uint256;

  /// Constants

  bytes32 public constant PAYMENT_OPTION_TYPE_HASH =
    keccak256("PaymentOption(bytes32 id,uint256 price,address asset)");

  bytes32 public constant CANCEL_OPTION_TYPE_HASH =
    keccak256("CancelOption(uint256 time,uint256 penalty)");

  bytes32 public constant OFFER_TYPE_HASH =
    keccak256(
      // solhint-disable-next-line max-line-length
      "Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn,uint256 checkOut)"
    );

  bytes32 public constant CHECK_IN_TYPE_HASH =
    keccak256("Voucher(bytes32 id,address signer)");

  /// Errors

  /// @dev Thrown when percents value greater than 100
  error InvalidPercent();

  /// Data structures

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
          _offer.checkIn,
          _offer.checkOut
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
}
