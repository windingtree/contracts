// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Simple ERC20 token interface
interface IERC20 {
  function decimals() external view returns (uint256);

  function transfer(address, uint256) external returns (bool);

  function transferFrom(address, address, uint256) external returns (bool);

  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;
}
