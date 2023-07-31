// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "./MockERC20Dec18.sol";

/// @custom:security-contact security@windingtree.com
contract MockERC20Dec18Permit is MockERC20Dec18, ERC20PermitUpgradeable {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(
    string memory _name,
    string memory _symbol,
    address _owner
  ) external override initializer {
    __MockERC20Dec18_init(_name, _symbol, _owner);
    __ERC20Permit_init(_name);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal override(ERC20Upgradeable, MockERC20Dec18) whenNotPaused {
    super._beforeTokenTransfer(from, to, amount);
  }
}
