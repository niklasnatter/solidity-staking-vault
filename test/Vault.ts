import { time, mine, setBalance, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Vault', () => {
    const deployVaultAndDevUSDC = async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        // test environment forks mainnet at block 15804036: https://docs.compound.finance/v2/
        const compoundEther = await ethers.getContractAt(
            'ICompoundEther',
            '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5'
        );
        const compToken = await ethers.getContractAt('ERC20', '0xc00e94Cb662C3520282E6f5717214004A7f26888');

        const priceFeedFactory = await ethers.getContractFactory('MockV3Aggregator');
        const priceFeed = await priceFeedFactory.deploy(8, 100 * 1e8); // mock eth price to 100 usd

        const devUSDCFactory = await ethers.getContractFactory('DevUSDC');
        const devUSDC = await devUSDCFactory.deploy();

        const vaultFactory = await ethers.getContractFactory('Vault');
        const vault = await vaultFactory.deploy(devUSDC.address, priceFeed.address, compoundEther.address);

        await devUSDC.setVault(vault.address);

        return { vault, devUSDC, compoundEther, compToken, owner, account1, account2 };
    };

    const oneEther = ethers.utils.parseEther('1');
    const depositAmount = ethers.utils.parseEther('10');
    const withdrawAmount = ethers.utils.parseEther('3');
    const yearlyRewardAmount = depositAmount.div(10).mul(100); // 10% apy * 100$ eth price
    const oneYearInSeconds = 365 * 24 * 60 * 60;

    describe('Deployment', () => {
        it('Should return the correct reward token', async () => {
            const { vault, devUSDC } = await loadFixture(deployVaultAndDevUSDC);

            expect(await vault.rewardToken()).to.equal(devUSDC.address);
        });
    });

    describe('Deposit', () => {
        it('Should return correct balances after deposit', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            expect(await vault.totalStakedBalance()).to.equal(0);
            expect(await vault.stakedBalance(account1.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(0);

            await vault.connect(account1).deposit({ value: depositAmount });

            // reward should be zero because no time passed after the deposit
            expect(await vault.totalStakedBalance()).to.equal(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(0);

            await time.increase(oneYearInSeconds);

            expect(await vault.totalStakedBalance()).to.equal(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount);
        });

        it('Should return correct balances after two successive deposits', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });

            // use "oneYearInSeconds - 1" because next transaction will be mined in a new block with an increase timestamp
            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount.mul(1));

            await time.increase(oneYearInSeconds);

            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount.mul(3));
        });

        it('Should deposit funds into compound', async () => {
            const { vault, compoundEther, account1 } = await loadFixture(deployVaultAndDevUSDC);
            const acceptedDelta = depositAmount.div(1000); // offset rounding errors for underlying balance

            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.equal(0);

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                depositAmount,
                acceptedDelta
            );

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                depositAmount.mul(2),
                acceptedDelta
            );
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
                'Below minimum staking amount'
            );
        });
    });

    describe('Withdraw', () => {
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
            expect(await devUSDC.balanceOf(account1.address)).to.equal(yearlyRewardAmount);
        });

        it('Should withdraw funds from compound', async () => {
            const { vault, compoundEther, account1 } = await loadFixture(deployVaultAndDevUSDC);
            const acceptedDelta = depositAmount.div(1000); // offset rounding errors for underlying balance

            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                depositAmount,
                acceptedDelta
            );

            await vault.connect(account1).withdraw(depositAmount);
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                0,
                acceptedDelta
            );
        });

        it('Should emit correct event', async () => {
            const { vault, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await vault.connect(account1).deposit({ value: depositAmount });

            // use "oneYearInSeconds - 1" because next transaction will be mined in a new block with an increase timestamp
            await time.increase(oneYearInSeconds - 1);
            await expect(vault.connect(account1).withdraw(withdrawAmount))
                .to.emit(vault, 'Withdrawal')
                .withArgs(account1.address, withdrawAmount, yearlyRewardAmount);
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
                'Below minimum staking amount'
            );
        });
    });

    describe('Deposit and Withdraw', () => {
        it('Should return correct balances for simultaneously active users', async () => {
            const { vault, account1, account2 } = await loadFixture(deployVaultAndDevUSDC);

            await time.increase(oneYearInSeconds - 1);
            expect(await vault.totalStakedBalance()).to.equal(0);
            expect(await vault.stakedBalance(account1.address)).to.equal(0);
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.totalStakedBalance()).to.equal(depositAmount);
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).deposit({ value: depositAmount.mul(2) });
            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(3));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount.mul(2));
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount);
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).withdraw(depositAmount);
            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount);
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount.mul(2));
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(0);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(3));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account2.address)).to.equal(depositAmount);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount.mul(3));
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(yearlyRewardAmount);

            await time.increase(oneYearInSeconds - 1);
            await vault.connect(account2).withdraw(depositAmount);
            expect(await vault.totalStakedBalance()).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account1.address)).to.equal(depositAmount.mul(2));
            expect(await vault.stakedBalance(account2.address)).to.equal(0);
            expect(await vault.accruedRewardAmount(account1.address)).to.equal(yearlyRewardAmount.mul(5));
            expect(await vault.accruedRewardAmount(account2.address)).to.equal(0);
        });
    });

    describe('Comp Rewards', () => {
        it('Should claim accrued comp rewards from comptroller', async () => {
            const { vault, compToken, owner, account1, account2 } = await loadFixture(deployVaultAndDevUSDC);

            expect(await compToken.balanceOf(account2.address)).to.equal(0);

            // no comp should be claimed because there was no deposit
            await vault.connect(owner).claimCompReward(account2.address);
            expect(await compToken.balanceOf(account2.address)).to.equal(0);

            await vault.connect(account1).deposit({ value: depositAmount });
            await time.increase(365 * 24 * 60 * 60);

            await vault.connect(owner).claimCompReward(account2.address);
            expect(await compToken.balanceOf(account2.address)).to.be.greaterThan(0);
        });

        it('Should allow claiming comp rewards for owner only', async () => {
            const { vault, owner, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await expect(vault.connect(account1).claimCompReward(account1.address)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );

            await expect(vault.connect(owner).claimCompReward(account1.address)).not.to.be.reverted;
        });
    });

    describe('Compound Interest', () => {
        it('Should skim accrued interest from compound', async () => {
            const { vault, compoundEther, owner, account1, account2 } = await loadFixture(deployVaultAndDevUSDC);
            const acceptedDelta = depositAmount.div(1000); // offset rounding errors for underlying balance
            await setBalance(account2.address, 0);

            // no skimmable interest because there was no deposit
            await vault.connect(owner).skimCompoundInterest(account2.address);
            expect(await account2.getBalance()).to.equal(0);
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.equal(0);

            // compound balance should match deposited amount directly after deposit
            await vault.connect(account1).deposit({ value: depositAmount });
            expect(await account2.getBalance()).to.equal(0);
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                depositAmount,
                acceptedDelta
            );

            // compound balance should be higher than deposited amount after one year because of compound interest
            await mine(Math.round(oneYearInSeconds / 13)); // compound calculates accrued interest based on block number
            expect(await account2.getBalance()).to.equal(0);
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.greaterThan(
                depositAmount.add(acceptedDelta)
            );

            // compound balance should match deposited amount and interest should be transferred to recipient
            await vault.connect(owner).skimCompoundInterest(account2.address);
            expect(await account2.getBalance()).to.be.greaterThan(0);
            expect(await compoundEther.callStatic.balanceOfUnderlying(vault.address)).to.be.approximately(
                depositAmount,
                acceptedDelta
            );
        });

        it('Should allow skimming compound interest for owner only', async () => {
            const { vault, owner, account1 } = await loadFixture(deployVaultAndDevUSDC);

            await expect(vault.connect(account1).skimCompoundInterest(account1.address)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );

            await expect(vault.connect(owner).skimCompoundInterest(account1.address)).not.to.be.reverted;
        });
    });
});
