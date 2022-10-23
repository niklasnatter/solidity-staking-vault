// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IVaultRewardToken.sol";

contract DevUSDC is IVaultRewardToken, ERC20, Ownable {
    event ChangedVault(address newVault);

    /**
     * @notice Vault contract that is allowed to mint new tokens
     */
    address private _vault;

    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20("devUSDC", "dUSDC") {}

    /**
     * @notice Set vault contract that is allowed to mint new tokens. Can only be called by the owner
     * @param vault The address of the vault contract
     */
    function setVault(address vault) public onlyOwner {
        _vault = vault;

        emit ChangedVault(vault);
    }

    /**
     * @notice Mint new tokens and assign them to the given account. Can only be called by the Vault contract
     * @param account Owner of the minted tokens
     * @param amount Amount of tokens that are minted
     */
    function mint(address account, uint256 amount) public {
        require(_vault == msg.sender, "!vault");

        _mint(account, amount);
    }
}
