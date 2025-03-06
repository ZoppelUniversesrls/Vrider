// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";


/**
 * @title ArtifactGenerator
 * @dev An ERC721-based contract that allows controlled minting and transferring of NFTs.
 *      Supports enumerable and URI storage extensions. Includes role-based access control.
 */
contract ArtifactGenerator is IERC165, ERC721Enumerable, ERC721URIStorage, AccessControl {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    /// @dev Role identifier for minters.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    /// @dev Role identifier for the marketplace, allowing controlled transfers.
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    /// @dev Tracks the next token ID to be minted.
    uint256 private _nextTokenId;

    uint256 public AMOUNT = 0.00001 ether; 

    /// @dev Base URI for token metadata.
    string private _baseTokenURI;

    /**
     * @dev Initializes the contract with roles and a base URI.
     * @param defaultAdmin Address to be assigned as the default admin.
     * @param minter Address to be granted the minter and admin role.
     * @param marketplace Address to be granted the marketplace role.
     * @param baseTokenURI Base URI for token metadata.
     */
    constructor(address defaultAdmin, address minter, address marketplace, string memory baseTokenURI) 
        ERC721("Vrider", "VRDR") 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(ADMIN_ROLE, minter);
        _grantRole(MARKETPLACE_ROLE, marketplace);
        _baseTokenURI = baseTokenURI;
    }

    receive( ) external payable{}

    /**
     * @dev Returns the base URI for metadata.
     * @return The base URI string.
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }



    function concedeMinterRole(address to) external onlyRole(ADMIN_ROLE) {
        require(!hasRole(MINTER_ROLE, to), "Already Minter");
 
        /**
        sFUEL distribution
        **/
        if(to.balance < 0.000005 ether){
            require(address(this).balance >= AMOUNT, "ContractOutOfSFuel");
            payable(to).transfer(AMOUNT);
            
        }

        _grantRole(MINTER_ROLE, to);

    }

     /**
     * @dev helper function to revoke MINTER_ROLE
     */
    function revokeMinterRole(address to) external onlyRole(ADMIN_ROLE) {
        require(hasRole(MINTER_ROLE, to), "Not Minter");
        _revokeRole(MINTER_ROLE, to);
    }



     /**
 The wallet with minter role can perform the mint. Once the mint is completed the role gets revoked if the signer is a user
    **/
    function safeMint(address to, string memory uri)
        public
        onlyRole(MINTER_ROLE)
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        
        if (!hasRole(ADMIN_ROLE,msg.sender)){

        _revokeRole(MINTER_ROLE, msg.sender);
        }
 
        return tokenId;
    }



    /**
     * @notice Mints multiple tokens to multiple recipients.
     * @dev Can only be called by an address with the ADMIN_ROLE.
     * @param recipients Array of addresses to receive minted tokens.
     * @param uris Array of metadata URIs corresponding to each token.
     * @return tokenIds Array of minted token IDs.
     */
    function batchMint(address[] memory recipients, string[] memory uris)
        public
        onlyRole(ADMIN_ROLE)
        returns (uint256[] memory)
    {
        require(recipients.length == uris.length, "Mismatched recipients and URIs");
        uint256[] memory tokenIds = new uint256[](recipients.length);

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _nextTokenId++;
            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, uris[i]);
            tokenIds[i] = tokenId;
        }

        return tokenIds;
    }

    /**
     * @notice Returns an array of token IDs owned by the specified address.
     * @param owner Address to query.
     * @return tokenIds Array of token IDs owned by `owner`.
     */
    function tokensOfOwner(address owner) public view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokenIds = new uint256[](balance);

        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(owner, i);
        }

        return tokenIds;
    }

    /**
     * @notice Returns an array of token URIs owned by the specified address.
     * @param owner Address to query.
     * @return uris Array of token URIs owned by `owner`.
     */
    function tokenURIsOfOwner(address owner) public view returns (string[] memory) {
        uint256 balance = balanceOf(owner);
        string[] memory uris = new string[](balance);

        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            uris[i] = tokenURI(tokenId);
        }

        return uris;
    }

    /**
     * @notice Transfers a token between addresses, restricted to marketplace role.
     * @dev Overrides safeTransferFrom to enforce MARKETPLACE_ROLE.
     * @param from Current owner of the token.
     * @param to Address to receive the token.
     * @param tokenId ID of the token being transferred.
     * @param data Additional data sent with the transfer.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public
        onlyRole(MARKETPLACE_ROLE)
        override(IERC721, ERC721)
    {
        return super.safeTransferFrom(from, to, tokenId, data);
    }

    /**
     * @notice Allows admin to update the base URI for all token metadata.
     * @param newBaseURI The new base URI.
     */
    function setBaseURI(string memory newBaseURI) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
    }

     /**
     * @notice Allows admin to update the ETH amount to transfer in the concedeMinterRole transaction.
     * @param newAmount The new AMOUNT.
     */
    function setETHAmount(uint256 newAmount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        AMOUNT = newAmount;
    }

    /**
     * @dev Overrides `_update` function to support ERC721Enumerable.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Overrides `_increaseBalance` to support ERC721Enumerable.
     */
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    /**
     * @notice Returns the token URI for the specified token ID.
     * @param tokenId ID of the token.
     * @return The token metadata URI.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @notice Checks if the contract supports a specific interface.
     * @param interfaceId The interface identifier.
     * @return True if the interface is supported, false otherwise.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC721URIStorage, AccessControl, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}