// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IVaultRewardToken.sol";

contract DevUSDC is IVaultRewardToken, ERC20, Ownable {
    address private _vault;

    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20("devUSDC", "dUSDC") {}

    function setVault(address vault) public onlyOwner {
        _vault = vault;
    }

    function mint(address account, uint256 amount) public {
        require(_vault == msg.sender, "!vault");

        _mint(account, amount);
    }
}
