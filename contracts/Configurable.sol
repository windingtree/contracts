// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

abstract contract Configurable is Ownable {
  using EnumerableSet for EnumerableSet.Bytes32Set;

  EnumerableSet.Bytes32Set private _variables;

  /// @dev Mapping of a named Id to uint256 number
  mapping(bytes32 => uint256) public numbers;

  /// @dev Mapping of a named Id to address
  mapping(bytes32 => address) public addresses;

  /**
   * @dev Emitted when a variable is created/updated
   * @param name Name of variable
   * @param value Value of variable
   */
  event ConfigNumbers(bytes32 indexed name, uint256 indexed value);

  /**
   * @dev Emitted when a variable is created/updated
   * @param name Name of variable
   * @param value Value of variable
   */
  event ConfigAddresses(bytes32 indexed name, address indexed value);

  /// Features

  /**
   * @dev Returns a list of registered config variables names
   * @return names Array of registered variables names
   */
  function variables() external view returns (bytes32[] memory names) {
    names = _variables.values();
  }

  /**
   * @dev Changes variable uint256 of value
   * @param name Name of variable
   * @param value Value of variable
   */
  function config(bytes32 name, uint256 value) public onlyOwner {
    numbers[name] = value;
    _variables.add(name);
    emit ConfigNumbers(name, value);
  }

  /**
   * @dev Changes variable uint256 of value
   * @param name Name of variable
   * @param value Value of variable
   */
  function config(bytes32 name, address value) public onlyOwner {
    addresses[name] = value;
    _variables.add(name);
    emit ConfigAddresses(name, value);
  }
}
