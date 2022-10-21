// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IVaultRewardToken.sol";

contract Vault is Ownable {
    uint256 public constant STAKING_APY = 0.1e18;
    uint256 public constant MINIMUM_STAKING_AMOUNT = 5 ether;
    IVaultRewardToken public rewardToken;

    AggregatorV3Interface private _ethUsdPriceFeed;
    mapping(address => uint256) private _stakedBalances;
    mapping(address => uint256) private _lastCheckmark;
    mapping(address => uint256) private _checkmarkedEtherReward;

    event Deposit(address owner, uint256 amount);
    event Withdrawal(address owner, uint256 amount, uint256 rewardAmount);

    constructor(AggregatorV3Interface ethUsdPriceFeed) {
        _ethUsdPriceFeed = ethUsdPriceFeed;
    }

    function setRewardToken(IVaultRewardToken rewardToken_) public onlyOwner {
        rewardToken = rewardToken_;
    }

    function deposit() public payable {
        _checkmarkReward(msg.sender);

        uint256 amount = msg.value;
        _stakedBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);

        _assertMinimumStakingAmount(msg.sender);
    }

    function withdraw(uint256 amount) public {
        require(_stakedBalances[msg.sender] >= amount, "Amount exceeds account balance");

        uint256 totalEtherReward = _checkmarkReward(msg.sender);
        _checkmarkedEtherReward[msg.sender] = 0;
        _stakedBalances[msg.sender] -= amount;

        uint256 totalRewardAmount = _rewardTokenAmount(totalEtherReward);
        rewardToken.mint(msg.sender, totalRewardAmount);
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount, totalRewardAmount);

        _assertMinimumStakingAmount(msg.sender);
    }

    function stakedBalance(address owner) public view returns (uint256) {
        return _stakedBalances[owner];
    }

    function earnedRewardAmount(address owner) public view returns (uint256) {
        uint256 totalEtherReward = _checkmarkedEtherReward[owner] + _pendingEtherReward(owner);

        return _rewardTokenAmount(totalEtherReward);
    }

    function _pendingEtherReward(address owner) internal view returns (uint256) {
        uint256 etherRewardPerYear = (_stakedBalances[owner] * STAKING_APY) / 1e18;
        uint256 secondsSinceCheckmark = block.timestamp - _lastCheckmark[owner];

        return (etherRewardPerYear * secondsSinceCheckmark) / 365 days;
    }

    function _checkmarkReward(address owner) internal returns (uint256) {
        uint256 totalEtherReward = _checkmarkedEtherReward[owner] + _pendingEtherReward(owner);
        _checkmarkedEtherReward[owner] = totalEtherReward;
        _lastCheckmark[owner] = block.timestamp;

        return totalEtherReward;
    }

    function _rewardTokenAmount(uint256 etherAmount) internal view returns (uint256) {
        (, int256 etherPrice, , , ) = _ethUsdPriceFeed.latestRoundData();
        uint256 denominator = 10**_ethUsdPriceFeed.decimals();

        return (etherAmount * uint256(etherPrice)) / denominator;
    }

    function _assertMinimumStakingAmount(address owner) internal view {
        require(
            _stakedBalances[owner] == 0 || _stakedBalances[owner] >= MINIMUM_STAKING_AMOUNT,
            "Below minimum staking amount"
        );
    }
}
