import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('DevUSDC', () => {
    const deployDevUSDC = async () => {
        const [owner, vault, otherAccount] = await ethers.getSigners();

        const devUSDCFactory = await ethers.getContractFactory('DevUSDC');
        const devUSDC = await devUSDCFactory.deploy();
        await devUSDC.setVault(vault.address);

        return { devUSDC, owner, vault, otherAccount };
    };

    describe('Deployment', () => {
        it('Should set the right name', async () => {
            const { devUSDC } = await loadFixture(deployDevUSDC);

            expect(await devUSDC.name()).to.equal('devUSDC');
        });

        it('Should set the right symbol', async () => {
            const { devUSDC } = await loadFixture(deployDevUSDC);

            expect(await devUSDC.symbol()).to.equal('dUSDC');
        });
    });

    describe('Vault', () => {
        it('Should emit an event when Vault address is set', async () => {
            const { devUSDC, owner, vault } = await loadFixture(deployDevUSDC);

            await expect(devUSDC.connect(owner).setVault(vault.address))
                .to.emit(devUSDC, 'ChangedVault')
                .withArgs(vault.address);
        });

        it('Should allow setting the Vault address for owner only', async () => {
            const { devUSDC, owner, vault, otherAccount } = await loadFixture(deployDevUSDC);

            await expect(devUSDC.connect(otherAccount).setVault(vault.address)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );

            await expect(devUSDC.connect(owner).setVault(vault.address)).not.to.be.reverted;
        });
    });

    describe('Mint', () => {
        const mintAmount = ethers.utils.parseEther('0.5');

        it('Should emit an event on mint', async () => {
            const { devUSDC, owner, vault } = await loadFixture(deployDevUSDC);

            await expect(devUSDC.connect(vault).mint(owner.address, mintAmount))
                .to.emit(devUSDC, 'Transfer')
                .withArgs(ethers.constants.AddressZero, owner.address, mintAmount);
        });

        it('Should allow mint for vault only', async () => {
            const { devUSDC, owner, vault, otherAccount } = await loadFixture(deployDevUSDC);

            await expect(devUSDC.connect(otherAccount).mint(owner.address, mintAmount)).to.be.revertedWith('!vault');

            await expect(devUSDC.connect(vault).mint(owner.address, mintAmount)).not.to.be.reverted;
        });
    });
});
