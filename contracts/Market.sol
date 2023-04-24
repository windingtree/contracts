// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/Pausable.sol";
import "./ERC1155Token.sol";
import "./DealsRegistry.sol";

contract Market is Pausable, DealsRegistry, ERC1155Token {
  constructor(
    address owner,
    string memory name,
    string memory version,
    address asset,
    uint256 minDeposit
  ) DealsRegistry(name, version, asset, minDeposit) {
    transferOwnership(owner);
  }

  /// Pausable features

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  /// Deals features

  /**
   * @dev See {DealsRegistry-deal}.
   */
  function deal(
    Offer memory offer,
    PaymentOption[] memory paymentOptions,
    bytes32 paymentId,
    bytes[] memory signs
  ) external whenNotPaused {
    _deal(offer, paymentOptions, paymentId, signs);
  }

  /**
   * @dev See {DealsRegistry-_beforeDealCreated}.
   */
  function _beforeDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal override(DealsRegistry) {
    super._beforeDealCreated(offer, price, asset, signs);
  }

  /**
   * @dev See {DealsRegistry-_afterDealCreated}.
   */
  function _afterDealCreated(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal override(DealsRegistry) {
    super._afterDealCreated(offer, price, asset, signs);
  }

  /// Suppliers features

  /**
   * @dev See {SuppliersRegistry-_register}.
   */
  function register(bytes32 salt, address signer) external whenNotPaused {
    _register(salt, signer);
  }

  /**
   * @dev See {SuppliersRegistry-_changeSigner}.
   */
  function changeSigner(
    bytes32 id,
    address signer
  ) external onlySupplierOwner(id) {
    _changeSigner(id, signer);
  }

  /**
   * @dev See {SuppliersRegistry-_toggleSupplier}.
   */
  function toggleSupplier(
    bytes32 id
  ) external onlySupplierOwner(id) whenNotPaused {
    _toggleSupplier(id);
  }

  /**
   * @dev See {SuppliersRegistry._addDeposit}.
   */
  function addDeposit(
    bytes32 id,
    uint256 value
  ) external onlySupplierOwner(id) whenNotPaused {
    _addDeposit(id, value, 0, "");
  }

  /**
   * @dev See {SuppliersRegistry-_addDeposit}.
   */
  function addDeposit(
    bytes32 id,
    uint256 value,
    uint256 deadline,
    bytes memory sign
  ) external onlySupplierOwner(id) whenNotPaused {
    _addDeposit(id, value, deadline, sign);
  }

  /**
   * @dev See {SuppliersRegistry-_withdrawDeposit}.
   */
  function withdrawDeposit(
    bytes32 id,
    uint256 value
  ) external onlySupplierOwner(id) whenNotPaused {
    _withdrawDeposit(id, value);
  }

  /// ERC1155 features

  /**
   * @dev See {IERC1155MetadataURI-uri}.
   */
  function uri(
    uint256 id
  ) public view override(ERC1155) returns (string memory) {
    // Generate data-uri that depends on the id
    return "";
  }

  /**
   * @dev See {ERC1155-_beforeTokenTransfer}.
   */
  function _beforeTokenTransfer(
    address operator,
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory amounts,
    bytes memory data
  ) internal override(ERC1155Token) {
    super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
  }

  uint256[50] private __gap;
}
