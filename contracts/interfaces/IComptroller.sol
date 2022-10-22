// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/**
 * @dev Extracted from: https://github.com/compound-finance/compound-protocol/blob/v2.8.1/contracts/Comptroller.sol
 */
interface IComptroller {
    /**
     * @notice Claim all the comp accrued by holder in all markets
     * @param holder The address to claim COMP for
     */
    function claimComp(address holder) external;

    /**
     * @notice Return the address of the COMP token
     * @return The address of COMP
     */
    function getCompAddress() external view returns (address);
}
