// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC1155Token.sol";
import "./DealsRegistry.sol";

contract Market is ERC1155Token, DealsRegistry {
  constructor(address owner) DealsRegistry("Market", "1") {
    transferOwnership(owner);
  }

  function uri(uint256 id) public view override(ERC1155) returns (string memory) {
    // Generate uri that depends on the id
    return "";
  }
}
