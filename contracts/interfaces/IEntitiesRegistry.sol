// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IEntitiesRegistry
 * @dev A smart contract interface for registering and managing entities who can participate in the protocol.
 */
interface IEntitiesRegistry {
  /**
   * @dev Entity storage struct
   * @param id Unique entity Id
   * @param owner Owner of the entity entity
   * @param enabled The entity entity activity flag
   * @param signer Offers signer
   */
  struct Entity {
    bytes32 kind;
    bytes32 id;
    address owner;
    bool enabled;
    address signer;
  }

  /**
   * @dev Returns entity by Id
   * @param _id The entity Id
   */
  function getEntity(bytes32 _id) external view returns (Entity memory);

  /**
   * @dev Returns the value of the entity's deposit
   * @param _id The entity Id
   */
  function balanceOfEntity(bytes32 _id) external view returns (uint256);

  /**
   * @dev Returns the value of `enabled` entity status
   * @param _id The entity Id
   */
  function isEntityEnabled(bytes32 _id) external view returns (bool);

  /**
   * @dev Sets the new address of the protocol config contract address
   */
  function setConfig(address _config) external;

  /**
   * @dev Registers a new entity
   * @param _kind Type of entity
   * @param _salt Unique bytes32 string that allows off-chain calculation of the entity Id
   * @param _signer Account address that authorized by the entity owner to sign offers
   *
   * If registering of the entity is succeeded:
   * - the function emits `EntityRegistered(bytes32 id, bytes32 id)` event
   *
   * Requirements:
   *
   * - `salt` can be used only once. If a `salt` has been used and the entity is registered
   *   the next attempt will results in the error `EntityExists()`
   * - an entity type provided with `_kind` must be registered
   *
   * NOTE: When the entity is registered its initial `enabled` status is set to `false`.
   * This means that to start accepting deals the entity must be enabled
   */
  function register(bytes32 _kind, bytes32 _salt, address _signer) external;

  /**
   * @dev Changes signer account of the entity
   * @param _id The entity Id
   * @param _signer Account authorized by the entity to sign offers
   *
   * If changing of the signer is succeeded:
   * - the function emits `SignerChanged(bytes32 id, address sender, address oldSigner, address new Signer)` event
   *
   * Requirements:
   *
   * - can be called by the entity owner only
   */
  function changeSigner(bytes32 _id, address _signer) external;

  /**
   * @dev Toggles an enabled status of the entity
   * @param _id The entity Id
   *
   * This function inverts a value of the `enabled` parameter of the entity
   *
   * If toggling is succeeded:
   * - the function emits `ToggleEnabled(bytes32 id, address sender, bool enabled)` event
   *
   * Requirements:
   *
   * - can be called by the entity owner only
   */
  function toggleEntity(bytes32 _id) external;

  /**
   * @dev See {EntitiesRegistry._addDeposit}.
   */
  function addDeposit(bytes32 _id, uint256 _value) external;

  /**
   * @dev Makes deposit of `asset` tokens with permit
   * @param _id The entity Id
   * @param _value Amount of `asset` tokens that must be deposited
   * @param _deadline Deadline time of permit
   * @param _sign Permit signature (EIP712)
   *
   * If `_sign` argument is provided the function will use the `permit` function
   * to transfer tokens from the sender to the contract, overwise the usual
   * `transferFrom` will be used.
   *
   * If the tokens transfer is succeeded:
   * - the function emits `Deposit(bytes32 id, address sender, uint256 value)` event
   *
   * Requirements:
   *
   * - can be called by the entity owner only
   */
  function addDeposit(
    bytes32 _id,
    uint256 _value,
    uint256 _deadline,
    bytes memory _sign
  ) external;

  /**
   * @dev Makes deposit withdrawal of the entity
   * @param _id The entity Id
   * @param _value Amount of `asset` tokens that must be withdrawn
   *
   * If the tokens withdrawal is succeeded:
   * - the function emits `Withdraw(bytes32 id, address sender, uint256 value)` event
   *
   * Requirements:
   *
   * - can be called by the entity owner only
   */
  function withdrawDeposit(bytes32 _id, uint256 _value) external;
}
