import { ethers } from 'hardhat';

const ethUsdPriceFeedAddresses: { [chainId: number]: string | undefined } = {
    5: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e', // goerli
};

const main = async () => {
    const network = await ethers.provider.getNetwork();
    console.log(`----- Starting contract deployments to chain with id ${network.chainId} ------`);

    const ethUsdPriceFeedAddress = ethUsdPriceFeedAddresses[network.chainId];
    if (!ethUsdPriceFeedAddress) {
        throw new Error(`Missing ETH/USD price feed address for chain with id ${network.chainId}`);
    }

    const vaultFactory = await ethers.getContractFactory('Vault');
    const vault = await vaultFactory.deploy(ethUsdPriceFeedAddress);
    await vault.deployed();
    console.log(`Successfully deployed "Vault" contract: ${vault.address}`);

    const devUSDCFactory = await ethers.getContractFactory('DevUSDC');
    const devUSDC = await devUSDCFactory.deploy();
    await devUSDC.deployed();
    console.log(`Successfully deployed "DevUSDC" contract: ${devUSDC.address}`);

    const setRewardTx = await vault.setRewardToken(devUSDC.address);
    await setRewardTx.wait();
    console.log(`Successfully set reward token to "Vault" contract`);

    const setVaultTx = await devUSDC.setVault(vault.address);
    await setVaultTx.wait();
    console.log(`Successfully set vault address to "DevUSDC" contract`);

    console.log(`----- Contract deployments finished ------`);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
