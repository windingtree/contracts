// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

/**
 * @title ERC721Token
 * @dev Abstract contract that defines an ERC721 token
 * with additional functionality for enumeration and pausing
 */
abstract contract ERC721Token is
  ERC721Upgradeable,
  ERC721EnumerableUpgradeable,
  PausableUpgradeable,
  OwnableUpgradeable
{
  using CountersUpgradeable for CountersUpgradeable.Counter;

  /// @dev Internal counter to keep track of tokenIds
  CountersUpgradeable.Counter private _tokenIdCounter;

  /**
   * @dev Initializer that sets the name and symbol of the token
   * @param name The name of the token
   * @param symbol The symbol of the token
   */
  function __ERC721Token_init(
    string memory name,
    string memory symbol
  ) internal onlyInitializing {
    __ERC721_init(name, symbol);
    __ERC721Enumerable_init();
    __Pausable_init();
  }

  /**
   * @dev Internal function to safely mint an NFT to an address with custom URI
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

  /// @inheritdoc ERC721Upgradeable
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
  )
    internal
    virtual
    override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    whenNotPaused
  {
    super._beforeTokenTransfer(from, to, tokenId, batchSize);
  }

  /// @inheritdoc ERC721Upgradeable
  function supportsInterface(
    bytes4 interfaceId
  )
    public
    view
    override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
