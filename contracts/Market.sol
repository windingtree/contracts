// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC1155Token.sol";

contract Market is ERC1155Token {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize() public override(ERC1155Token) initializer {
    super.initialize();
  }

  function uri(uint256 id) public view override(ERC1155Upgradeable) returns (string memory) {
    // Generate uri that depends on the id
    return '';
  }
}
