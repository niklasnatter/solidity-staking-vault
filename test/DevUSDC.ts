import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import {DevUSDC} from "../typechain-types";

describe("DevUSDC", function () {
  async function deployDevUSDC() {
    const [owner, vault, otherAccount] = await ethers.getSigners();

    const devUSDCFactory = await ethers.getContractFactory("DevUSDC");
    const devUSDC = await devUSDCFactory.deploy() as DevUSDC;
    await devUSDC.setVault(vault.address);

    return { devUSDC, owner, vault, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right name", async function () {
      const { devUSDC } = await loadFixture(deployDevUSDC);

      expect(await devUSDC.name()).to.equal('devUSDC');
    });

    it("Should set the right symbol", async function () {
      const { devUSDC } = await loadFixture(deployDevUSDC);

      expect(await devUSDC.symbol()).to.equal('dUSDC');
    });
  });

  describe("Vault", function () {
    const mintAmount = ethers.utils.parseEther('0.5');

    it("Should allow setting vault for owner only", async function () {
      const { devUSDC, owner, vault, otherAccount } = await loadFixture(deployDevUSDC);


      await expect(devUSDC.connect(otherAccount).setVault(vault.address)).to.be.revertedWith(
          "Ownable: caller is not the owner"
      );

      await expect(devUSDC.connect(owner).setVault(vault.address)).not.to.be.reverted;
    });
  });

  describe("Mint", function () {
    const mintAmount = ethers.utils.parseEther('0.5');

    it("Should emit an event on mint", async function () {
      const { devUSDC, owner, vault } = await loadFixture(deployDevUSDC);

      await expect(devUSDC.connect(vault).mint(owner.address, mintAmount))
          .to.emit(devUSDC, "Transfer")
          .withArgs(ethers.constants.AddressZero, owner.address, mintAmount);
    });

    it("Should allow mint for vault only", async function () {
      const { devUSDC, owner, vault, otherAccount } = await loadFixture(deployDevUSDC);


      await expect(devUSDC.connect(otherAccount).mint(owner.address, mintAmount)).to.be.revertedWith(
          "!vault"
      );

      await expect(devUSDC.connect(vault).mint(owner.address, mintAmount)).not.to.be.reverted;
    });
  });
});
