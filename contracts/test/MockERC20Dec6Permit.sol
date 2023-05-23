// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./MockERC20Dec18Permit.sol";

/// @custom:security-contact security@windingtree.com
contract MockERC20Dec6Permit is MockERC20Dec18Permit {
  function decimals() public pure override returns (uint8) {
    return 6;
  }
}
