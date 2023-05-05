// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Import OpenZeppelin ERC721, ERC721Enumerable, Ownable, Pausable contracts
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title ERC721Token
 * @dev Abstract contract that defines an ERC721 token with additional functionality for enumeration and pausing
 */
abstract contract ERC721Token is ERC721, ERC721Enumerable, Pausable {
  using Counters for Counters.Counter;

  /// @dev Internal counter to keep track of tokenIds
  Counters.Counter private _tokenIdCounter;

  /**
   * @dev Constructor that sets the name and symbol of the token
   * @param name The name of the token
   * @param symbol The symbol of the token
   */
  constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

  /**
   * @dev Internal function to safely mint an NFT to an address
   * @param to The address that will receive the minted NFT
   */
  function safeMint(address to) internal returns (uint256) {
    uint256 tokenId = _tokenIdCounter.current();
    _tokenIdCounter.increment();
    _safeMint(to, tokenId);
    return tokenId;
  }

  /**
   * @dev Internal function to safely burn an NFT
   * @param tokenId The ID of the NFT to be burnt
   */
  function safeBurn(uint256 tokenId) internal {
    require(
      _isApprovedOrOwner(_msgSender(), tokenId),
      "ERC721: caller is not token owner or approved"
    );
    _burn(tokenId);
  }

  /**
   * @dev See {ERC721-_beforeTokenTransfer}
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
  ) internal virtual override(ERC721, ERC721Enumerable) whenNotPaused {
    super._beforeTokenTransfer(from, to, tokenId, batchSize);
  }

  /**
   * @dev See {ERC721-supportsInterface}
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view override(ERC721, ERC721Enumerable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
