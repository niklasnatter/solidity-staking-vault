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
    uint256 public constant STAKING_APY = 0.1e18;
    uint256 public constant MINIMUM_STAKING_AMOUNT = 5 ether;
    IVaultRewardToken public immutable rewardToken;
    uint256 public totalStakedBalance = 0;

    AggregatorV3Interface private immutable _ethUsdPriceFeed;
    ICompoundEther private immutable _compoundEther;

    mapping(address => uint256) private _stakedBalances;
    mapping(address => CheckmarkedReward) private _checkmarkedRewards;

    event ClaimedCompReward(address caller, address recipient, uint256 amount);
    event SkimmedCompoundInterest(address caller, address recipient, uint256 amount);
    event Deposit(address owner, uint256 amount);
    event Withdrawal(address owner, uint256 amount, uint256 rewardAmount);

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

    function claimCompReward(address recipient) public onlyOwner {
        IComptroller comptroller = IComptroller(_compoundEther.comptroller());
        IERC20 comp = IERC20(comptroller.getCompAddress());

        comptroller.claimComp(address(this));
        uint256 amount = comp.balanceOf(address(this));
        comp.transfer(recipient, amount);

        emit ClaimedCompReward(msg.sender, recipient, amount);
    }

    function skimCompoundInterest(address payable recipient) public onlyOwner {
        uint256 cEtherBalance = _compoundEther.balanceOf(address(this));
        _compoundEther.redeem(cEtherBalance);
        _compoundEther.mint{value: totalStakedBalance}();

        uint256 amount = address(this).balance;
        recipient.transfer(amount);

        emit SkimmedCompoundInterest(msg.sender, recipient, amount);
    }

    function deposit() public payable {
        _checkmarkReward(msg.sender);
        uint256 amount = msg.value;

        _depositToCompound(amount);
        totalStakedBalance += amount;
        _stakedBalances[msg.sender] += amount;

        emit Deposit(msg.sender, amount);

        _assertMinimumStakingAmount(msg.sender);
    }

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

    function stakedBalance(address owner) public view returns (uint256) {
        return _stakedBalances[owner];
    }

    function accruedRewardAmount(address owner) public view returns (uint256) {
        return _accruedRewardAmount(owner);
    }

    function _accruedRewardAmount(address owner) internal view returns (uint256) {
        uint256 totalEtherReward = _checkmarkedRewards[owner].etherReward + _pendingEtherReward(owner);

        return _rewardTokenAmount(totalEtherReward);
    }

    function _pendingEtherReward(address owner) internal view returns (uint256) {
        uint256 etherRewardPerYear = (_stakedBalances[owner] * STAKING_APY) / 1e18;
        uint256 secondsSinceCheckmark = block.timestamp - _checkmarkedRewards[owner].timestamp;

        return (etherRewardPerYear * secondsSinceCheckmark) / 365 days;
    }

    function _rewardTokenAmount(uint256 etherAmount) internal view returns (uint256) {
        (, int256 etherPrice, , , ) = _ethUsdPriceFeed.latestRoundData();
        uint256 denominator = 10**_ethUsdPriceFeed.decimals();

        return (etherAmount * uint256(etherPrice)) / denominator;
    }

    function _checkmarkReward(address owner) internal {
        _checkmarkedRewards[owner].etherReward += _pendingEtherReward(owner);
        _checkmarkedRewards[owner].timestamp = block.timestamp;
    }

    function _depositToCompound(uint256 etherAmount) internal {
        _compoundEther.mint{value: etherAmount}();
    }

    function _withdrawFromCompound(uint256 etherAmount) internal {
        _compoundEther.redeemUnderlying(etherAmount);
    }

    function _assertMinimumStakingAmount(address owner) internal view {
        require(
            _stakedBalances[owner] == 0 || _stakedBalances[owner] >= MINIMUM_STAKING_AMOUNT,
            "Below minimum staking amount"
        );
    }
}
