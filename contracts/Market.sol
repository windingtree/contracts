// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./ERC721Token.sol";
import "./DealsRegistry.sol";

/**
 * @title Market
 * @dev This contract enables the creation and management of deals
 * @custom:security-contact security@windingtree.com
 */
contract Market is Ownable, Pausable, DealsRegistry, ERC721Token {
  /// @dev Mapping of token Id on offer Id
  mapping(uint256 => bytes32) public tokenOffers;

  /// @dev Mapping of offer Id on token Id
  mapping(bytes32 => uint256) public offerTokens;

  /// Throws when NFT transfer is not allowed by offer rule
  error TokenTransferNotAllowed();

  /**
   * @dev Constructor that initializes the Market contract with the given arguments
   * @param owner The owner of the contract
   * @param name The name of the contract
   * @param version The version of the contract
   * @param asset The address of the asset
   * @param minDeposit The minimum deposit required for the contract
   */
  constructor(
    address owner,
    string memory name,
    string memory version,
    address asset,
    uint256 minDeposit
  )
    DealsRegistry(name, version, asset, minDeposit)
    ERC721Token("DealToken", "DEAL")
  {
    transferOwnership(owner);
  }

  /// Getters

  /**
   * @dev Returns offerId linked to the token
   * @param tokenId The ID of the token
   * @return offerId The ID of the offer linked to the token
   */
  function resolveTokenId(
    uint256 tokenId
  ) external view returns (bytes32 offerId) {
    _requireMinted(tokenId);
    offerId = tokenOffers[tokenId];
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

  /// Deals features

  /**
   * @dev Executes logic before a deal is created
   * @param offer The details of the offer
   * @param price The price of the offer
   * @param asset The address of the asset
   * @param signs The signatures of the offer
   */
  function _beforeCreate(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal override(DealsRegistry) whenNotPaused {
    super._beforeCreate(offer, price, asset, signs);
  }

  /**
   * @dev Executes logic after a deal is created
   * @param offer The details of the offer
   * @param price The price of the offer
   * @param asset The address of the asset
   * @param signs The signatures of the offer
   */
  function _afterCreate(
    Offer memory offer,
    uint256 price,
    address asset,
    bytes[] memory signs
  ) internal override(DealsRegistry) {
    // After-deal logic
    super._afterCreate(offer, price, asset, signs);
  }

  /**
   * @dev Executes logic after a deal is claimed
   * @param offerId The ID of the offer
   * @param buyer The address of the buyer
   */
  function _afterClaim(
    bytes32 offerId,
    address buyer
  ) internal override(DealsRegistry) {
    // Minting of a token
    uint256 tokenId = safeMint(buyer);
    // Create a map of token Id on offer Id
    tokenOffers[tokenId] = offerId;
    // Create a map of offer Id on token Id
    offerTokens[offerId] = tokenId;
    super._afterClaim(offerId, buyer);
  }

  /**
   * @dev Executes logic after a deal is canceled
   * @param offerId The ID of the offer
   */
  function _afterCancel(bytes32 offerId) internal override(DealsRegistry) {
    uint256 tokenId = offerTokens[offerId];

    // If token has been minted we must burn it
    if (tokenId != 0) {
      safeBurn(tokenId);
      delete tokenOffers[tokenId];
      delete offerTokens[offerId];
    }

    super._beforeCancel(offerId);
  }

  /// ERC721 features

  /**
   * @dev Returns the token URI of the given token ID
   * @param tokenId The ID of the token
   * @return The token URI of the given token ID
   */
  function tokenURI(
    uint256 tokenId
  ) public view override(ERC721) returns (string memory) {
    _requireMinted(tokenId);
    // TODO: Generate data-uri that depends on the id
    return "";
  }

  /**
   * @dev Executes before a token transfer
   * @param from The address to transfer the token from
   * @param to The address to transfer the token to
   * @param tokenId The ID of the token being transferred
   * @param batchSize The size of the batch being transferred
   *
   * NOTE: Initially minted token is transferred to his owner without any restrictions
   * All other transfers are managed according the following requirements:
   *
   * - token must be linked to an offerId
   * - token can be transferred or not according to the configuration of offer
   * - token can not be transferred when the deal status is `Claimed` only
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
  ) internal override(ERC721Token) whenNotPaused {
    // Execute the logic when the function called not from `_mint` or `_burn`
    if (from != address(0) && to != address(0)) {
      bytes32 offerId = tokenOffers[tokenId];

      if (offerId == bytes32(0)) {
        revert DealNotFound();
      }

      Deal storage offerDeal = deals[offerId];

      // Prevent transfer of token when this is not allowed by the offer
      // or the deal is in the non-transferrable status
      if (
        !offerDeal.offer.transferable || offerDeal.status != DealStatus.Claimed
      ) {
        revert TokenTransferNotAllowed();
      }

      // Change the deal buyer to the new token owner
      offerDeal.buyer = to;
    }

    super._beforeTokenTransfer(from, to, tokenId, batchSize);
  }

  uint256[50] private __gap;
}
