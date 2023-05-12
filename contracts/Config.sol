// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "./interfaces/IConfig.sol";

contract Config is IConfig, OwnableUpgradeable {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
  using SafeMathUpgradeable for uint256;

  EnumerableSetUpgradeable.Bytes32Set private _variables;

  /// @dev Mapping of a named Id to uint256 number
  mapping(bytes32 => uint256) private numbers;

  /// @dev Mapping of a named Id to address
  mapping(bytes32 => address) private addresses;

  /// @dev Mapping of en entity type on minimum deposit value
  mapping(bytes32 => uint256) private minDeposits;

  /// Events

  /// @dev Emitted when a variable is created/updated
  event ConfigNumbers(bytes32 name, uint256 value);

  /// @dev Emitted when a variable is created/updated
  event ConfigAddresses(bytes32 name, address value);

  /// @dev Emitted when an entity minimum deposit set/updates
  event ConfigMinDeposit(bytes32 kind, uint256 value);

  /// Errors

  /// @dev Thrown when a user attempts to provide an invalid config property value
  error InvalidConfig();

  /**
   * @dev Initializes Config contract
   * @param _asset The address of the asset used by the protocol in tokenomics
   * @param _claimPeriod The default time period, in seconds, allowed for the supplier to claim the deal.
   * @param _protocolFee Protocol's fee in percents
   * @param _retailerFee Retailer's fee in percents
   * @param _feeRecipient he recipient of the protocol fee
   * @param _kinds Supported entity types
   * @param _minDeposits Minimum value of deposit
   */
  function initialize(
    address _owner,
    address _asset,
    uint256 _claimPeriod,
    uint256 _protocolFee,
    uint256 _retailerFee,
    address _feeRecipient,
    bytes32[] memory _kinds,
    uint256[] memory _minDeposits
  ) external initializer {
    _transferOwnership(_owner);

    // Save an asset address
    config("asset", _asset);

    // The default time period, in seconds, allowed for the supplier to claim the deal.
    // The buyer is not able to cancel the deal during this period
    config("claim_period", _claimPeriod);

    // The recipient of the protocol fee
    config("fee_recipient", _feeRecipient);

    // In total, all the fees must not be greater than 100.
    // Of course, having 100% of the fees is absurd case.
    if (_protocolFee.add(_retailerFee) > 100) {
      revert InvalidConfig();
    }

    // Protocol's fee in percents
    config("protocol_fee", _protocolFee);

    // Retailer's fee in percents
    config("retailer_fee", _retailerFee);

    // Save initial minimum deposits values
    _setMinDeposits(_kinds, _minDeposits);
  }

  /// @inheritdoc IConfig
  function getNumber(bytes32 _name) public view returns (uint256) {
    return numbers[_name];
  }

  /// @inheritdoc IConfig
  function getAddress(bytes32 _name) public view returns (address) {
    return addresses[_name];
  }

  /// @inheritdoc IConfig
  function getMinDeposit(bytes32 _name) public view returns (uint256) {
    return minDeposits[_name];
  }

  /// @inheritdoc IConfig
  function variables() external view returns (bytes32[] memory) {
    return _variables.values();
  }

  /// @inheritdoc IConfig
  function config(bytes32 name, uint256 value) public onlyOwner {
    numbers[name] = value;
    _variables.add(name);
    emit ConfigNumbers(name, value);
  }

  /// @inheritdoc IConfig
  function config(bytes32 name, address value) public onlyOwner {
    addresses[name] = value;
    _variables.add(name);
    emit ConfigAddresses(name, value);
  }

  /// @inheritdoc IConfig
  function setMinDeposits(
    bytes32[] memory _kinds,
    uint256[] memory _minDeposits
  ) external onlyOwner {
    _setMinDeposits(_kinds, _minDeposits);
  }

  /// Internal functions

  /// @dev See {IConfig.setMinDeposits}
  function _setMinDeposits(
    bytes32[] memory _kinds,
    uint256[] memory _minDeposits
  ) internal {
    // Entity types number must be equal to minimum deposits values number
    if (_kinds.length != _minDeposits.length) {
      revert InvalidConfig();
    }

    // Save minimum deposit values
    for (uint256 i = 0; i < _minDeposits.length; i++) {
      minDeposits[_kinds[i]] = _minDeposits[i];
      emit ConfigMinDeposit(_kinds[i], _minDeposits[i]);
    }
  }
}
