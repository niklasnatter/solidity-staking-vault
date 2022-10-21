# solidity-staking-vault

## Requirements

-   You are asked to write smart contracts for an ETH staking app.
-   User can stake their ETH in a vault (Constant APR 10%)
-   User gets rewarded in devUSDC (an ERC20 token you will create as well)
-   Assume that devUSDC is always worth $1
-   When a user stakes ETH: all of that ETH will be put as collateral in Compound (v2).
-   When a user wants to Withdraw their ETH. The vault will take out the ETH the user staked (without the yields) from Compound - and will give it back to the user with the devUSDC rewards
-   Minimum amount to stake is 5 ETH
-   To get the price of ETH you will need to use a price oracle from chainlink

## Development

### Install dependencies

```bash
npm install
```

### Configure environment variables in .env.local file

```
cp .env .env.local
vim .env.local
```

### Lint code

```bash
npm run lint
```

### Execute test cases

```bash
npx hardhat test
```

### Deploy contracts

Make sure to set the `GOERLI_PRIVATE_KEY` variable in the `.env.local` file before executing any commands.

```bash
npx hardhat run --network goerli scripts/deploy.ts
```

### Verify contracts

Make sure to set the `ETHERSCAN_API_KEY` variable in the `.env.local` file before executing any commands.

```bash
# replace <vault-address> and <devusdc-address> with the addresses logged by deploy script
npx hardhat verify --network goerli <vault-address>
npx hardhat verify --network goerli <devusdc-address>
```
