import { ethers } from 'hardhat';

const GOERLI_CHAIN_ID = 5;
const ethUsdPriceFeedAddresses: { [chainId: number]: string | undefined } = {
    [GOERLI_CHAIN_ID]: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e',
};
const compoundEtherAddresses: { [chainId: number]: string | undefined } = {
    [GOERLI_CHAIN_ID]: '0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde',
};

const main = async () => {
    const network = await ethers.provider.getNetwork();
    console.log(`----- Starting contract deployments to chain with id ${network.chainId} ------`);

    const ethUsdPriceFeedAddress = ethUsdPriceFeedAddresses[network.chainId];
    if (!ethUsdPriceFeedAddress) {
        throw new Error(`Missing ethUsdPriceFeedAddresses for chain with id ${network.chainId}`);
    }
    console.log(`ETH/USD price feed address: ${ethUsdPriceFeedAddress}`);

    const compoundEtherAddress = compoundEtherAddresses[network.chainId];
    if (!compoundEtherAddress) {
        throw new Error(`Missing compoundEtherAddress for chain with id ${network.chainId}`);
    }
    console.log(`Compound ether address: ${compoundEtherAddress}`);
    console.log('-');

    const devUSDCFactory = await ethers.getContractFactory('DevUSDC');
    const devUSDC = await devUSDCFactory.deploy();
    console.log(`Sent "DevUSDC" deployment transaction: ${devUSDC.deployTransaction.hash}`);
    await devUSDC.deployed();
    console.log(`Successfully deployed "DevUSDC" contract: ${devUSDC.address}`);
    console.log('-');

    const vaultFactory = await ethers.getContractFactory('Vault');
    const vault = await vaultFactory.deploy(devUSDC.address, ethUsdPriceFeedAddress, compoundEtherAddress);
    console.log(`Sent "Vault" deployment transaction: ${vault.deployTransaction.hash}`);
    await vault.deployed();
    console.log(`Successfully deployed "Vault" contract: ${vault.address}`);

    const setVaultTx = await devUSDC.setVault(vault.address);
    console.log(`Sent transaction for setting vault address to "DevUSDC" contract: ${vault.deployTransaction.hash}`);
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
