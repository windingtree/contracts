// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Configurable.sol";
import "./utils/IERC20.sol";
import "./utils/SignatureUtils.sol";

/**
 * @title SuppliersRegistry
 * @dev A smart contract for registering and managing suppliers who can participate in deals.
 */
abstract contract SuppliersRegistry is Context, Configurable, Pausable {
  using SafeMath for uint256;
  using SignatureUtils for bytes;

  /**
   * @dev Supplier storage struct
   * @param id Unique supplier Id
   * @param owner Owner of the supplier entity
   * @param enabled The supplier entity activity flag
   * @param signer Offers signer
   */
  struct Supplier {
    bytes32 id;
    address owner;
    bool enabled;
    address signer;
  }

  /// @dev Mapping of a supplier Id to Supplier storage
  mapping(bytes32 => Supplier) public suppliers;

  /// @dev Mapping of a supplier Id to deposit
  mapping(bytes32 => uint256) public deposits;

  /// @dev Emitted when a Supplier is registered
  event SupplierRegistered(address indexed owner, bytes32 indexed id);

  /// @dev Emitted when the supplier's signer is changed
  event SignerChanged(
    bytes32 indexed id,
    address indexed sender,
    address oldSigner,
    address newSigner
  );

  /// @dev Emitted when a supplier's enabled status is toggled
  event ToggleEnabled(bytes32 indexed id, address indexed sender, bool enabled);

  /// @dev Emitted when a supplier makes a deposit
  event Deposit(bytes32 indexed id, address indexed sender, uint256 value);

  /// @dev Emitted when a supplier withdraws a deposit
  event Withdraw(bytes32 indexed id, address indexed sender, uint256 value);

  /// @dev Throws when sender attempts to register already existed supplier
  error SupplierExists();

  /// @dev Throws when sender not an owner of the supplier entity
  error NotSupplierOwner();

  /// @dev Throws when the deposit value is less than the `minDeposit`
  error DepositTooSmall();

  /// @dev Throws when the deposit funds transfer is failed
  error DepositTransferFailed();

  /// @dev Throws when the deposit withdrawal is not possible due to slack of funds
  error DepositNotEnough();

  /// @dev Checks is the caller is upgrader
  modifier onlySupplierOwner(bytes32 id) {
    if (suppliers[id].owner != _msgSender()) {
      revert NotSupplierOwner();
    }
    _;
  }

  /**
   * @dev SuppliersRegistry constructor
   */
  constructor(address _asset, uint256 _minDeposit) {
    // Supplier's deposit asset
    config("asset", _asset);

    // Minimum deposit value
    config("min_deposit", _minDeposit);
  }

  /// Getters

  /**
   * @dev Returns the value of the supplier's deposit
   * @param id The supplier Id
   */
  function balanceOfSupplier(bytes32 id) public view returns (uint256) {
    return deposits[id];
  }

  /**
   * @dev Returns the value of `enabled` supplier status
   * @param id The supplier Id
   */
  function isSupplierEnabled(bytes32 id) external view returns (bool) {
    return suppliers[id].enabled && deposits[id] > 0;
  }

  /// Features

  /**
   * @dev Registers a new supplier entity
   * @param salt Unique bytes32 string that allows off-chain calculation of the supplier Id
   * @param signer Account address that authorized by the supplier owner to sign offers
   *
   * If registering of the supplier is succeeded:
   * - the function emits `SupplierRegistered(bytes32 id, bytes32 id)` event
   *
   * Requirements:
   *
   * - `salt` can be used only once. If a `salt` has been used and the supplier is registered
   *   the next attempt will results in the error `SupplierExists()`
   *
   * NOTE: When the supplier is registered its initial `enabled` status is set to `false`.
   * This means that to start accepting deals the supplier must be enabled
   */
  function register(bytes32 salt, address signer) external whenNotPaused {
    address supplierOwner = _msgSender();
    bytes32 id = keccak256(abi.encodePacked(supplierOwner, salt));

    if (suppliers[id].id == id) {
      revert SupplierExists();
    }

    suppliers[id] = Supplier(id, supplierOwner, false, signer);
    emit SupplierRegistered(supplierOwner, id);
  }

  /**
   * @dev Changes signer account of the supplier
   * @param id The supplier Id
   * @param signer Account authorized by the supplier to sign offers
   *
   * If changing of the signer is succeeded:
   * - the function emits `SignerChanged(bytes32 id, address sender, address oldSigner, address new Signer)` event
   *
   * Requirements:
   *
   * - can be called by the supplier owner only
   */
  function changeSigner(
    bytes32 id,
    address signer
  ) external onlySupplierOwner(id) whenNotPaused {
    address oldSigner = suppliers[id].signer;
    suppliers[id].signer = signer;
    emit SignerChanged(id, _msgSender(), oldSigner, signer);
  }

  /**
   * @dev Toggles an enabled status of the supplier
   * @param id The supplier Id
   *
   * This function inverts a value of the `enabled` parameter of the supplier
   *
   * If toggling is succeeded:
   * - the function emits `ToggleEnabled(bytes32 id, address sender, bool enabled)` event
   *
   * Requirements:
   *
   * - can be called by the supplier owner only
   */
  function toggleSupplier(
    bytes32 id
  ) external onlySupplierOwner(id) whenNotPaused {
    bool enabled = !suppliers[id].enabled;
    suppliers[id].enabled = enabled;
    emit ToggleEnabled(id, _msgSender(), enabled);
  }

  /**
   * @dev See {SuppliersRegistry._addDeposit}.
   */
  function addDeposit(bytes32 id, uint256 value) external whenNotPaused {
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
  ) external whenNotPaused {
    _addDeposit(id, value, deadline, sign);
  }

  /**
   * @dev Makes deposit withdrawal of the supplier
   * @param id The supplier Id
   * @param value Amount of `asset` tokens that must be withdrawn
   *
   * If the tokens withdrawal is succeeded:
   * - the function emits `Withdraw(bytes32 id, address sender, uint256 value)` event
   *
   * Requirements:
   *
   * - can be called by the supplier owner only
   */
  function withdrawDeposit(
    bytes32 id,
    uint256 value
  ) external onlySupplierOwner(id) whenNotPaused {
    if (deposits[id] < value) {
      revert DepositNotEnough();
    }

    if (!IERC20(addresses["asset"]).transfer(_msgSender(), value)) {
      revert DepositTransferFailed();
    }

    deposits[id] = deposits[id].sub(value);

    emit Withdraw(id, _msgSender(), value);
  }

  /// Internal functions

  /**
   * @dev Makes deposit of `asset` tokens with permit
   * @param id The supplier Id
   * @param value Amount of `asset` tokens that must be deposited
   * @param deadline Deadline time of permit
   * @param sign Permit signature (EIP712)
   *
   * If `sign` argument is provided the function will use the `permit` function
   * to transfer tokens from the sender to the contract, overwise the usual
   * `transferFrom` will be used.
   *
   * If the tokens transfer is succeeded:
   * - the function emits `Deposit(bytes32 id, address sender, uint256 value)` event
   *
   * Requirements:
   *
   * - can be called by the supplier owner only
   */
  function _addDeposit(
    bytes32 id,
    uint256 value,
    uint256 deadline,
    bytes memory sign
  ) internal onlySupplierOwner(id) {
    if (deposits[id].add(value) < numbers["min_deposit"]) {
      revert DepositTooSmall();
    }

    address supplierOwner = _msgSender();
    address asset = addresses["asset"];

    if (sign.length > 0) {
      // Use permit function to transfer tokens from the sender to the contract
      (uint8 v, bytes32 r, bytes32 s) = sign.split();
      IERC20(asset).permit(
        supplierOwner,
        address(this),
        value,
        deadline,
        v,
        r,
        s
      );
    }

    // Use transferFrom function to transfer tokens from the sender to the contract
    if (!IERC20(asset).transferFrom(supplierOwner, address(this), value)) {
      revert DepositTransferFailed();
    }

    deposits[id] = deposits[id].add(value);

    emit Deposit(id, supplierOwner, value);
  }

  uint256[50] private __gap;
}
