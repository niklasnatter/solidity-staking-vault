// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

//import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IVaultRewardToken.sol";
import "./interfaces/ICompoundEther.sol";
import "./interfaces/IComptroller.sol";

struct CheckmarkedReward {
    uint256 timestamp;
    uint256 etherReward;
}

contract Vault is Ownable {
    event Deposit(address owner, uint256 amount);
    event Withdrawal(address owner, uint256 amount, uint256 rewardAmount);
    event ClaimedCompReward(address caller, address recipient, uint256 amount);
    event SkimmedCompoundInterest(address caller, address recipient, uint256 amount);

    /**
     * @notice Reward APY of the Vault
     */
    uint256 public constant STAKING_APY = 0.1e18;
    /**
     * @notice Minimum amount of ether that must be staked in the Vault
     */
    uint256 public constant MINIMUM_STAKING_AMOUNT = 5 ether;
    /**
     * @notice Token in which the rewards of the Vault are paid
     */
    IVaultRewardToken public immutable rewardToken;
    /**
     * @notice Total amount of ether that is staked in the Vault
     */
    uint256 public totalStakedBalance = 0;

    AggregatorV3Interface private immutable _ethUsdPriceFeed;
    ICompoundEther private immutable _compoundEther;
    mapping(address => uint256) private _stakedBalances;
    mapping(address => CheckmarkedReward) private _checkmarkedRewards;

    constructor(
        IVaultRewardToken rewardToken_,
        AggregatorV3Interface ethUsdPriceFeed_,
        ICompoundEther compoundEther_
    ) {
        rewardToken = rewardToken_;
        _ethUsdPriceFeed = ethUsdPriceFeed_;
        _compoundEther = compoundEther_;
    }

    // allow contract to receive ether: https://docs.soliditylang.org/en/v0.8.10/contracts.html#receive-ether-function
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /**
     * @notice Deposit the sent ether to the Vault. The ether will be deposited in Compound and can be withdrawn
     * by the caller at any time
     */
    function deposit() public payable {
        _checkmarkReward(msg.sender);
        uint256 amount = msg.value;

        _depositToCompound(amount);
        totalStakedBalance += amount;
        _stakedBalances[msg.sender] += amount;

        emit Deposit(msg.sender, amount);

        _assertMinimumStakingAmount(msg.sender);
    }

    /**
     * @notice Withdraw the given ether amount and all accrued reward tokens from the Vault. The ether amount is
     * withdrawn from Compound and sent to the caller
     * @param amount Amount of ether that is withdrawn from the Vault
     */
    function withdraw(uint256 amount) public {
        require(_stakedBalances[msg.sender] >= amount, "Amount exceeds account balance");
        uint256 rewardAmount = _accruedRewardAmount(msg.sender);

        totalStakedBalance -= amount;
        _stakedBalances[msg.sender] -= amount;
        _checkmarkedRewards[msg.sender].etherReward = 0;
        _checkmarkedRewards[msg.sender].timestamp = block.timestamp;

        _withdrawFromCompound(amount);
        payable(msg.sender).transfer(amount);
        rewardToken.mint(msg.sender, rewardAmount);

        emit Withdrawal(msg.sender, amount, rewardAmount);

        _assertMinimumStakingAmount(msg.sender);
    }

    /**
     * @notice Return the total amount of ether that was staked by the given owner
     * @param owner Owner of which the staked amount is returned
     * @return The total amount staked by the owner
     */
    function stakedBalance(address owner) public view returns (uint256) {
        return _stakedBalances[owner];
    }

    /**
     * @notice Return the total amount of reward tokens that can be withdrawn by the given owner
     * @param owner Owner of which the reward amount is returned
     * @return The total reward amount earned by the owner
     */
    function accruedRewardAmount(address owner) public view returns (uint256) {
        return _accruedRewardAmount(owner);
    }

    /**
     * @notice Return the total amount of reward tokens that can be withdrawn by the given owner
     * @param owner Owner of which the reward amount is returned
     * @return The total reward amount earned by the owner
     */
    function _accruedRewardAmount(address owner) internal view returns (uint256) {
        uint256 totalEtherReward = _checkmarkedRewards[owner].etherReward + _pendingEtherReward(owner);

        return _rewardTokenAmount(totalEtherReward);
    }

    /**
     * @notice Return the reward amount in ether that was already accrued but not yet checkmarked
     * @param owner Owner of which the reward amount is returned
     * @return The reward amount that was not yet checkmarked
     */
    function _pendingEtherReward(address owner) internal view returns (uint256) {
        uint256 etherRewardPerYear = (_stakedBalances[owner] * STAKING_APY) / 1e18;
        uint256 secondsSinceCheckmark = block.timestamp - _checkmarkedRewards[owner].timestamp;

        return (etherRewardPerYear * secondsSinceCheckmark) / 365 days;
    }

    /**
     * @notice Return the amount of reward tokens for the given ether amount based on the current
     * ether price fetched from the Chainlink price feed
     * @param etherAmount Amount for which the respective amount of reward tokens is calculated
     * @return The amount of reward tokens for the given ether amount
     */
    function _rewardTokenAmount(uint256 etherAmount) internal view returns (uint256) {
        (, int256 etherPrice, , , ) = _ethUsdPriceFeed.latestRoundData();
        uint256 denominator = 10**_ethUsdPriceFeed.decimals();

        return (etherAmount * uint256(etherPrice)) / denominator;
    }

    /**
     * @notice Update the checkmarked reward amount for the given owner
     * @dev This function must be called before the staked balance of an owner is changed to make sure that the
     * rewards for the previous balance are accounted correctly
     * @param owner Owner of which the reward amount is checkmarked

     */
    function _checkmarkReward(address owner) internal {
        _checkmarkedRewards[owner].etherReward += _pendingEtherReward(owner);
        _checkmarkedRewards[owner].timestamp = block.timestamp;
    }

    /**
     * @notice Deposit the given ether amount from the Vault to Compound
     * @param etherAmount Amount of ether that is deposited
     */
    function _depositToCompound(uint256 etherAmount) internal {
        _compoundEther.mint{value: etherAmount}();
    }

    /**
     * @notice Withdraw the given ether amount from Compound to the Vault
     * @param etherAmount Amount of ether that is withdrawn
     */
    function _withdrawFromCompound(uint256 etherAmount) internal {
        _compoundEther.redeemUnderlying(etherAmount);
    }

    /**
     * @notice Assert that the given owner fulfills the minimum staking requirements, revert if not
     * @dev This function must be called after the staked balance of an owner was changed
     * @param owner Owner of which the staking balance is checked
     */
    function _assertMinimumStakingAmount(address owner) internal view {
        require(
            _stakedBalances[owner] == 0 || _stakedBalances[owner] >= MINIMUM_STAKING_AMOUNT,
            "Below minimum staking amount"
        );
    }

    /**
     * @notice Claim the COMP rewards earned by the Vault from the Compound comptroller and transfer them to the
     * given recipient. Can only be called by the owner
     * @param recipient Address to which the claimed COMP reward is transferred
     */
    function claimCompReward(address recipient) public onlyOwner {
        IComptroller comptroller = IComptroller(_compoundEther.comptroller());
        IERC20 comp = IERC20(comptroller.getCompAddress());

        comptroller.claimComp(address(this));
        uint256 amount = comp.balanceOf(address(this));
        comp.transfer(recipient, amount);

        emit ClaimedCompReward(msg.sender, recipient, amount);
    }

    /**
     * @notice Withdraw the interest earned by the ether deposited in Compound and transfer it to the given recipient.
     * This will only transfer earned interest, all funds belonging to users will be kept in Compound. Can only be
     * called by the owner
     * @param recipient Address to which the earned interest is transferred
     */
    function skimCompoundInterest(address payable recipient) public onlyOwner {
        uint256 cEtherBalance = _compoundEther.balanceOf(address(this));
        _compoundEther.redeem(cEtherBalance);
        _compoundEther.mint{value: totalStakedBalance}();

        uint256 amount = address(this).balance;
        recipient.transfer(amount);

        emit SkimmedCompoundInterest(msg.sender, recipient, amount);
    }
}
