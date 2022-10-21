import { HardhatUserConfig } from 'hardhat/config';
import dotenv from 'dotenv';
import '@nomicfoundation/hardhat-toolbox';

// allow overwriting values in .env.local
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const config: HardhatUserConfig = {
    solidity: '0.8.17',
    networks: {
        goerli: {
            url: process.env.GOERLI_RPC_URL,
            accounts: [`0x${process.env.GOERLI_PRIVATE_KEY}`]
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY
    }
};

export default config;
