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

## Deployments

| Source      | Address                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Vault.sol   | [0x714d3F5F2F1529541E306034498492c941B5C370](https://goerli.etherscan.io/address/0x714d3F5F2F1529541E306034498492c941B5C370) |
| DevUSDC.sol | [0xE592BF7Fe43a5e76BEF7E336cA846bAa57A44241](https://goerli.etherscan.io/address/0xE592BF7Fe43a5e76BEF7E336cA846bAa57A44241) |

## Development

### Install dependencies

```bash
npm install
```

### Lint code

```bash
npm run lint
```

### Execute test cases

Tests are executed in a mainnet fork at block 15804036. Forking mainnet requires an active internet connection.

```bash
npx hardhat test
```

### Configure environment variables in .env.local file

```
cp .env .env.local
vim .env.local
```

### Deploy contracts

Make sure to set an appropriate `GOERLI_PRIVATE_KEY` variable in the `.env.local` file before executing any commands.

```bash
npx hardhat run --network goerli scripts/deploy.ts
```

### Verify contracts

Make sure to set the `ETHERSCAN_API_KEY` variable in the `.env.local` file before executing any commands.

```bash
# replace placeholders with the values logged by deploy script
npx hardhat verify --network goerli <devusdc-address>
npx hardhat verify --network goerli <vault-address> <devusdc-address> <price-feed-address> <compound-ether-address>
```
