const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArtifactGenerator", function () {
    let  artifactGenerator;
    let owner, minter, marketplace, user, user1;
    const baseTokenURI = "https://example.com/metadata/";
    before(async function () {
        [owner, minter, marketplace, user, user1] = await ethers.getSigners();

        // Deploy contract
        
        const ArtifactGenerator = await ethers.getContractFactory("ArtifactGenerator");
        artifactGenerator = await ArtifactGenerator.deploy(owner.address, minter.address, marketplace.address, baseTokenURI);
        await artifactGenerator.waitForDeployment();
    });

    it("Should deploy with correct roles assigned", async function () {
        expect(await artifactGenerator.hasRole(await artifactGenerator.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), minter.address)).to.be.true;
        expect(await artifactGenerator.hasRole(await artifactGenerator.ADMIN_ROLE(), minter.address)).to.be.true;
        expect(await artifactGenerator.hasRole(await artifactGenerator.MARKETPLACE_ROLE(), marketplace.address)).to.be.true;
    });

    it("Minter should be able to mint multiple NFTs", async function () {
        const uris = ["uri1","uri2"];
        await artifactGenerator.connect(minter).safeMint(user1.address, uris[0]);
        await artifactGenerator.connect(minter).safeMint(user1.address, uris[1]);

        expect(await artifactGenerator.balanceOf(user1.address)).to.equal(2);
        expect(await artifactGenerator.tokenURI(0)).to.equal(baseTokenURI + uris[0]);
        expect(await artifactGenerator.tokenURI(1)).to.equal(baseTokenURI + uris[1]);
    });

    it("User should NOT be able to mint without minter role", async function () {
        await expect(artifactGenerator.connect(user).safeMint(user.address, "uri3"))
            .to.be.revertedWithCustomError(artifactGenerator, "AccessControlUnauthorizedAccount");
    });

    it("Admin should be able to grant MINTER_ROLE", async function () {
        await artifactGenerator.connect(minter).concedeMinterRole(user.address);
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), user.address)).to.be.true;
    });

    it("User should be able to mint after receiving MINTER_ROLE", async function () {
        const uri = "uri4";
        await artifactGenerator.connect(user).safeMint(user.address, uri);

        expect(await artifactGenerator.balanceOf(user.address)).to.equal(1);
        expect(await artifactGenerator.tokenURI(2)).to.equal(baseTokenURI + uri);
    });

    it("User should NOT be able to mint after minting once", async function () {
        const uri = "3";
        await expect(artifactGenerator.connect(user).safeMint(user.address, uri))
        .to.be.revertedWithCustomError(artifactGenerator, "AccessControlUnauthorizedAccount");

    });

    it("Non-admin should NOT be able to grant MINTER_ROLE", async function () {
        await expect(artifactGenerator.connect(user).concedeMinterRole(marketplace.address))
            .to.be.revertedWithCustomError(artifactGenerator, "AccessControlUnauthorizedAccount");
    });

    it("Admin should be able to revoke MINTER_ROLE if user doesn't mint for any reason", async function () {
        await artifactGenerator.connect(minter).concedeMinterRole(user.address);
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), user.address)).to.be.true;
        await artifactGenerator.connect(minter).revokeMinterRole(user.address);
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), user.address)).to.be.false;
    });

    it("Revoked minter should NOT be able to mint", async function () {
        await expect(artifactGenerator.connect(user).safeMint(user.address, "uri5"))
            .to.be.revertedWithCustomError(artifactGenerator, "AccessControlUnauthorizedAccount");
    });

    it("Marketplace should be able to transfer tokens after approval", async function () {
        
        await artifactGenerator.connect(user).approve(marketplace.address,2);

        await artifactGenerator.connect(marketplace)["safeTransferFrom(address,address,uint256,bytes)"](user.address, user1.address, 2, "0x");
        expect(await artifactGenerator.ownerOf(2)).to.equal(user1.address);
    });

    it("Non-marketplace should NOT be able to transfer tokens", async function () {
        await expect(
            artifactGenerator.connect(user)["safeTransferFrom(address,address,uint256,bytes)"](user.address, owner.address, 2, "0x")
        ).to.be.revertedWithCustomError(artifactGenerator, "AccessControlUnauthorizedAccount");
    });

    it("Should return correct token URIs for user1", async function () {
        const uris = await artifactGenerator.tokenURIsOfOwner(user1.address);
        expect(uris).to.deep.equal([baseTokenURI + "uri1",baseTokenURI + "uri2",baseTokenURI + "uri4"]);
    });

    it("Owner Should update base URI correctly", async function () {
        await artifactGenerator.connect(owner).setBaseURI("https://newbase.com/");
        expect(await artifactGenerator.tokenURI(1)).to.equal("https://newbase.com/uri2");
    });

    it("Should fail to distribute sFUEL if contract is out of funds", async function () {
        // Get user's current ETH balance
        const userBalance = await ethers.provider.getBalance(user.address);
        
        // Estimate gas price in Ethers v6
        const feeData = await ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        
        const gasLimit = 21000n; // Minimum gas for a transfer
        const gasCost = gasLimit * gasPrice;
    
        // Calculate the max amount user can send while covering gas fees
        const amountToSend = userBalance > gasCost ? userBalance - gasCost : 0n;
    
        if (amountToSend > 0) {
            // Send all ETH except gas to another address (e.g., user1)
            const tx = await user.sendTransaction({
                to: user1.address,
                value: amountToSend,
                gasLimit: gasLimit,
                gasPrice: gasPrice,
            });
    
            await tx.wait(); // Wait for transaction confirmation
        }
    
        // Verify user now has very little ETH left (< 0.000005)
        const userBalanceAfter = await ethers.provider.getBalance(user.address);
        expect(userBalanceAfter).to.be.lt(ethers.parseEther("0.000005"));
    
        // Ensure the contract has no ETH
        const contractBalance = await ethers.provider.getBalance(artifactGenerator.target);
        expect(contractBalance).to.equal(0);
    
        // Expect `concedeMinterRole` to fail due to lack of funds
        await expect(
            artifactGenerator.connect(minter).concedeMinterRole(user.address)
        ).to.be.revertedWith("ContractOutOfSFuel");
    
        // Ensure MINTER_ROLE is NOT granted
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), user.address)).to.be.false;
    });
    

    it("Should distribute sFUEL when conceding MINTER_ROLE if balance is low", async function () {
        const amount = await artifactGenerator.AMOUNT();
    
        // Fund the contract with 0.001 ether for sFUEL distribution
        const fundTx = await owner.sendTransaction({
            to: artifactGenerator.target,
            value: ethers.parseEther("0.0001"), // Enough to cover the transfer
        });
        await fundTx.wait();
    
        // Ensure contract received funds
        const contractBalance = await ethers.provider.getBalance(artifactGenerator.target);
        expect(contractBalance).to.be.gte(amount); // Contract should have enough funds
    
        // Ensure user has a low balance
        const userBalanceBefore = await ethers.provider.getBalance(user.address);
        expect(userBalanceBefore).to.be.lt(ethers.parseEther("0.000005"));
    
        // Admin grants MINTER_ROLE to user
        const tx = await artifactGenerator.connect(minter).concedeMinterRole(user.address);
        await tx.wait();
    
        // Check that user received sFUEL
        const userBalanceAfter = await ethers.provider.getBalance(user.address);
        expect(userBalanceAfter).to.be.gte(userBalanceBefore + amount); // Allowing small gas difference
    
        // Check MINTER_ROLE was assigned
        expect(await artifactGenerator.hasRole(await artifactGenerator.MINTER_ROLE(), user.address)).to.be.true;
    });

    it("Owner Should update ETH amount correctly", async function () {
        await artifactGenerator.connect(owner).setETHAmount(ethers.parseEther("0.01"));
        expect(await artifactGenerator.AMOUNT()).to.equal(ethers.parseEther("0.01"));
    });

    
    

    
});