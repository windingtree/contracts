// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Configurable contract interface
 * @dev Interface for a contract that allows for dynamic configuration of uint256 and address values.
 */
interface IConfig {
  /**
   * @dev Returns a number by name
   * @param _name A number name
   * @return The value of the number
   */
  function getNumber(bytes32 _name) external view returns (uint256);

  /**
   * @dev Returns an address by name
   * @param _name An address name
   * @return The address value
   */
  function getAddress(bytes32 _name) external view returns (address);

  /**
   * @dev Returns a list of registered config variables names
   * @return Array of registered variables names
   */
  function variables() external view returns (bytes32[] memory);

  /**
   * @dev Returns a minDeposit value of the entity
   * @param _name An entity name
   * @return The value of the number
   */
  function getMinDeposit(bytes32 _name) external view returns (uint256);

  /**
   * @dev Changes variable uint256 of value
   * @param name Name of variable
   * @param value Value of variable
   */
  function config(bytes32 name, uint256 value) external;

  /**
   * @dev Changes variable address of value
   * @param name Name of variable
   * @param value Value of variable
   */
  function config(bytes32 name, address value) external;

  /**
   * @dev Sets minimum deposits values
   * @param _kinds Supported entity types
   * @param _minDeposits Minimum value of deposit
   */
  function setMinDeposits(
    bytes32[] memory _kinds,
    uint256[] memory _minDeposits
  ) external;
}
