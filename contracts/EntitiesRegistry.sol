// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "./interfaces/IEntitiesRegistry.sol";
import "./interfaces/IConfig.sol";
import "./libraries/SignatureUtils.sol";
import "./utils/IERC20.sol";

/**
 * @title EntitiesRegistry
 * @dev A smart contract for registering and managing entities who can participate in the protocol.
 */
contract EntitiesRegistry is
  IEntitiesRegistry,
  PausableUpgradeable,
  OwnableUpgradeable
{
  using SafeMathUpgradeable for uint256;
  using SignatureUtils for bytes;

  /// @dev The protocol config contract address
  address public config;

  /// @dev Mapping of a entity Id to Entity storage
  mapping(bytes32 => Entity) private entities;

  /// @dev Mapping of a entity Id to deposit
  mapping(bytes32 => uint256) private deposits;

  /// Events

  /// @dev Emitted when a Entity is registered
  event EntityRegistered(address owner, bytes32 id);

  /// @dev Emitted when the entity's signer is changed
  event SignerChanged(
    bytes32 id,
    address sender,
    address oldSigner,
    address newSigner
  );

  /// @dev Emitted when updated an address of the protocol config contract
  event SetConfig(address oldAddress, address newAddress);

  /// @dev Emitted when a entity's enabled status is toggled
  event ToggleEnabled(bytes32 id, address sender, bool enabled);

  /// @dev Emitted when a entity makes a deposit
  event Deposit(bytes32 id, address sender, uint256 value);

  /// @dev Emitted when a entity withdraws a deposit
  event Withdraw(bytes32 id, address sender, uint256 value);

  /// Errors

  /// @dev Throws when sender attempts to provide invalid configuration
  error InvalidConfig();

  /// @dev Throws when sender attempts refer to non-registered entity type
  error InvalidKind();

  /// @dev Throws when sender attempts send invalid signer address
  error InvalidSigner();

  /// @dev Throws when sender attempts to register already existed entity
  error EntityExists();

  /// @dev Throws when entity not found in the registry
  error EntityNotFound();

  /// @dev Throws when sender not an owner of the entity
  error NotEntityOwner();

  /// @dev Throws when the deposit value is less than the `minDeposit`
  error DepositTooSmall();

  /// @dev Throws when the deposit funds transfer is failed
  error DepositTransferFailed();

  /// @dev Throws when the deposit withdrawal is not possible due to slack of funds
  error DepositNotEnough();

  /// @dev Prevents function execution when entity not found
  modifier entityExists(bytes32 _id) {
    Entity storage entity = entities[_id];
    if (entity.owner == address(0)) {
      revert EntityNotFound();
    }
    _;
  }

  /// @dev Checks is the caller is entity owner
  modifier onlyEntityOwner(bytes32 _id) {
    if (entities[_id].owner != _msgSender()) {
      revert NotEntityOwner();
    }
    _;
  }

  /**
   * @dev EntitiesRegistry initializer
   * @param _config The protocol config contract address
   */
  function initialize(address _owner, address _config) external initializer {
    // Set owner
    _transferOwnership(_owner);

    // Initialize pausable behaviour
    __Pausable_init();

    // Save the protocol config contract address
    config = _config;
  }

  /// Getters

  /// @inheritdoc IEntitiesRegistry
  function getEntity(
    bytes32 _id
  ) external view entityExists(_id) returns (Entity memory) {
    return entities[_id];
  }

  /// @inheritdoc IEntitiesRegistry
  function balanceOfEntity(
    bytes32 _id
  ) public view entityExists(_id) returns (uint256) {
    return deposits[_id];
  }

  /// @inheritdoc IEntitiesRegistry
  function isEntityEnabled(
    bytes32 _id
  ) external view entityExists(_id) returns (bool) {
    return entities[_id].enabled && deposits[_id] > 0;
  }

  /// Pausable features

  /**
   * @dev Pauses the contract
   */
  function pause() public onlyOwner {
    _pause();
  }

  /**
   * @dev Unpauses the contract
   */
  function unpause() public onlyOwner {
    _unpause();
  }

  /// Features

  /// @inheritdoc IEntitiesRegistry
  function setConfig(address _config) external onlyOwner {
    emit SetConfig(config, _config);
    config = _config;
  }

  /// @inheritdoc IEntitiesRegistry
  function register(
    bytes32 _kind,
    bytes32 _salt,
    address _signer
  ) external whenNotPaused {
    if (IConfig(config).getMinDeposit(_kind) == 0) {
      revert InvalidKind();
    }

    address entityOwner = _msgSender();
    bytes32 id = keccak256(abi.encodePacked(entityOwner, _salt));

    if (entities[id].id == id) {
      revert EntityExists();
    }

    entities[id] = Entity(_kind, id, entityOwner, false, _signer);
    emit EntityRegistered(entityOwner, id);
  }

  /// @inheritdoc IEntitiesRegistry
  function changeSigner(
    bytes32 _id,
    address _signer
  ) external onlyEntityOwner(_id) whenNotPaused {
    if (_signer == address(0)) {
      revert InvalidSigner();
    }
    address oldSigner = entities[_id].signer;
    entities[_id].signer = _signer;
    emit SignerChanged(_id, _msgSender(), oldSigner, _signer);
  }

  /// @inheritdoc IEntitiesRegistry
  function toggleEntity(
    bytes32 _id
  ) external entityExists(_id) onlyEntityOwner(_id) whenNotPaused {
    bool enabled = !entities[_id].enabled;
    entities[_id].enabled = enabled;
    emit ToggleEnabled(_id, _msgSender(), enabled);
  }

  /// @inheritdoc IEntitiesRegistry
  function addDeposit(
    bytes32 _id,
    uint256 _value
  ) external entityExists(_id) whenNotPaused {
    _addDeposit(_id, _value, 0, "");
  }

  /// @inheritdoc IEntitiesRegistry
  function addDeposit(
    bytes32 _id,
    uint256 _value,
    uint256 _deadline,
    bytes memory sign
  ) external entityExists(_id) whenNotPaused {
    _addDeposit(_id, _value, _deadline, sign);
  }

  /// @inheritdoc IEntitiesRegistry
  function withdrawDeposit(
    bytes32 _id,
    uint256 _value
  ) external entityExists(_id) onlyEntityOwner(_id) whenNotPaused {
    // TODO: Implement withdrawal delay

    if (deposits[_id] < _value) {
      revert DepositNotEnough();
    }

    if (
      !IERC20(IConfig(config).getAddress("asset")).transfer(
        _msgSender(),
        _value
      )
    ) {
      revert DepositTransferFailed();
    }

    deposits[_id] = deposits[_id].sub(_value);

    emit Withdraw(_id, _msgSender(), _value);
  }

  /// Internal functions

  /// @dev Makes deposit of `asset` tokens with permit
  function _addDeposit(
    bytes32 _id,
    uint256 _value,
    uint256 _deadline,
    bytes memory _sign
  ) internal onlyEntityOwner(_id) {
    if (
      deposits[_id].add(_value) <
      IConfig(config).getMinDeposit(entities[_id].kind)
    ) {
      revert DepositTooSmall();
    }

    address entityOwner = _msgSender();
    address asset = IConfig(config).getAddress("asset");

    if (_sign.length > 0) {
      // Use permit function to transfer tokens from the sender to the contract
      (uint8 v, bytes32 r, bytes32 s) = _sign.split();
      IERC20(asset).permit(
        entityOwner,
        address(this),
        _value,
        _deadline,
        v,
        r,
        s
      );
    }

    // Use transferFrom function to transfer tokens from the sender to the contract
    if (!IERC20(asset).transferFrom(entityOwner, address(this), _value)) {
      revert DepositTransferFailed();
    }

    deposits[_id] = deposits[_id].add(_value);

    emit Deposit(_id, entityOwner, _value);
  }

  uint256[50] private __gap;
}
