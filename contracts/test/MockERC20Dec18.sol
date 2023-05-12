// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @custom:security-contact security@windingtree.com
contract MockERC20Dec18 is
  ERC20Upgradeable,
  ERC20BurnableUpgradeable,
  PausableUpgradeable,
  OwnableUpgradeable
{
  function initialize(
    string memory _name,
    string memory _symbol,
    address _owner
  ) external virtual initializer {
    __MockERC20Dec18_init(_name, _symbol, _owner);
  }

  function __MockERC20Dec18_init(
    string memory _name,
    string memory _symbol,
    address _owner
  ) internal onlyInitializing {
    __ERC20_init(_name, _symbol);
    _transferOwnership(_owner);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual override whenNotPaused {
    super._beforeTokenTransfer(from, to, amount);
  }
}
