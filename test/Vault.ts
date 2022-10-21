import { time, setBalance, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Vault', () => {
    const deployVaultAndDevUSDC = async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        const vaultFactory = await ethers.getContractFactory('Vault');
        const vault = await vaultFactory.deploy();

        const devUSDCFactory = await ethers.getContractFactory('DevUSDC');
        const devUSDC = await devUSDCFactory.deploy();

        await vault.setRewardToken(devUSDC.address);
        await devUSDC.setVault(vault.address);

        return { vault, devUSDC, owner, account1, account2 };
    };

    describe('Reward Token', () => {
        const newRewardTokenAddress = '0x19893a3E185F8c0C0a6F1aC6b9ef0F833352F26e';

        it('Should allow setting reward token for owner only', async () => {
            const { vault, owner, account1 } = await loadFixture(deployVaultAndDevUSDC);

            expect(await vault.rewardToken()).not.to.equal(newRewardTokenAddress);

            await expect(vault.connect(account1).setRewardToken(newRewardTokenAddress)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );

            await expect(vault.connect(owner).setRewardToken(newRewardTokenAddress)).not.to.be.reverted;

            expect(await vault.rewardToken()).to.equal(newRewardTokenAddress);
        });
    });

    describe('Deposit', () => {
        const depositAmount = ethers.utils.parseEther('10');
        const oneYearInSeconds = 365 * 24 * 60 * 60;

        it('Should return correct balances after deposit', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            expect(await vault.stakedBalance(account1.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(0);

            await vault.connect(account1).deposit({ value: depositAmount });

            // reward should be zero because no time passed after the deposit
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(0);

            await time.increase(oneYearInSeconds);

            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.div(100));
        });

        it('Should return correct balances after two successive deposits', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            // use "oneYearInSeconds - 1" because next transaction will be mined in a new block with an increase timestamp
            await time.increase(oneYearInSeconds - 1);

            await vault.connect(account1).deposit({ value: depositAmount });
            await time.increase(oneYearInSeconds);

            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.mul(3).div(100));
        });

        it('Should emit correct event', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await expect(vault.connect(account1).deposit({ value: depositAmount }))
                .to.emit(vault, 'Deposit')
                .withArgs(account1.address, depositAmount);
        });

        it('Should reject deposit below minimum staking amount', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await expect(vault.connect(account1).deposit({ value: ethers.utils.parseEther('1') })).to.be.revertedWith(
                'Account below minimum staking amount'
            );
        });
    });

    describe('Withdraw', () => {
        const oneEther = ethers.utils.parseEther('1');
        const depositAmount = ethers.utils.parseEther('10');
        const withdrawAmount = ethers.utils.parseEther('3');
        const oneYearInSeconds = 365 * 24 * 60 * 60;

        it('Should return correct balances after partial withdraw', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);

            await vault.connect(account1).withdraw(withdrawAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.sub(withdrawAmount));

            await vault.connect(account1).withdraw(depositAmount.sub(withdrawAmount));
            expect(await vault.stakedBalance(account1.address)).to.equal(0);
        });

        it('Should return correct balances after full withdraw', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);

            await vault.connect(account1).withdraw(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(0);
        });

        it('Should send ether and rewards to account', async () => {
            const { vault, devUSDC, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            // use "oneYearInSeconds - 1" because next transaction will be mined in a new block with an increase timestamp
            await time.increase(oneYearInSeconds - 1);

            await setBalance(account1.address, oneEther);
            expect(await account1.getBalance()).to.equal(oneEther);
            expect(await devUSDC.balanceOf(account1.address)).to.equal(0);

            const tx = await vault.connect(account1).withdraw(withdrawAmount);
            const result = await tx.wait();
            const withdrawalCost = result.gasUsed.mul(result.effectiveGasPrice);

            expect(await account1.getBalance()).to.equal(oneEther.add(withdrawAmount).sub(withdrawalCost));
            expect(await devUSDC.balanceOf(account1.address)).to.equal(depositAmount.div(100));
        });

        it('Should emit correct event', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            // use "oneYearInSeconds - 1" because next transaction will be mined in a new block with an increase timestamp
            await time.increase(oneYearInSeconds - 1);

            await expect(vault.connect(account1).withdraw(withdrawAmount))
                .to.emit(vault, 'Withdrawal')
                .withArgs(account1.address, withdrawAmount, depositAmount.div(100));
        });

        it('Should reject withdrawal that that exceeds account balance', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);

            await expect(vault.connect(account1).withdraw(depositAmount.add(1))).to.be.revertedWith(
                'Amount exceeds account balance'
            );
        });

        it('Should reject withdrawal that puts account below minimum staking amount', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);

            await expect(vault.connect(account1).withdraw(depositAmount.sub(1))).to.be.revertedWith(
                'Account below minimum staking amount'
            );
        });
    });

    describe('Deposit and Withdraw', () => {
        const depositAmount = ethers.utils.parseEther('10');
        const oneYearInSeconds = 365 * 24 * 60 * 60;

        it('Should return correct balances for simultaneously active users', async () => {
            const { vault, account1, account2 } = await loadFixture(deployVaultAndDevUSDC);

            await time.increase(oneYearInSeconds - 1);
            expect(await vault.stakedBalance(account1.address)).to.equal(0);
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).deposit({ value: depositAmount.mul(2) });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount.mul(2));
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.mul(1).div(100));
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(depositAmount.mul(0).div(100));

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).withdraw(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.mul(2).div(100));
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.mul(3).div(100));
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(depositAmount.div(100));

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).withdraw(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.earnedRewardAmount(account1.address)).to.equal(depositAmount.mul(5).div(100));
            expect(await vault.earnedRewardAmount(account2.address)).to.equal(0);
        });
    });
});
