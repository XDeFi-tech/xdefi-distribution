# xdefi-distribution

## Audit Walid

https://xdefiio.slack.com/archives/C02K51BH0M9/p1638955146406000
User can lock in an amount for a duration and cannot unlock/withdraw during the specified duration
Lock durations and their respective multiplier are definable by the admin, and can be changed. Even 0 seconds can be enabled.
User can lock in any amount of XDEFI, but not 0
Locked position is transferable as a NFT during lockup and after it is unlocked/withdrawn
The lockup becomes a “staking position”, which is an NFT (similar to Uniswap v3's liquidity position NFTs, but simpler)
Rewards are accrued while locked up, with a multiplier based on the lockup time
A this moment with the smart contract, accruing of rewards/revenue with the multiplier persists after the expiry (however, users are still better off relocking to “reinvest” their rewards)
Once unlockable, the user can re-lock the amount into a new stake position, or withdraw it, or some combination, in one tx
Upon staking, the NFT staking position is given a “score” which is some function of amount and lockup time (right now amount*duration)
This score is embedded in the tokenId, so the chain enforced is (backend cannot lie)
The NFT points to some off-chain server that will serve the correct metadata given the NFTs points/Tier
Once the NFT position has been unlocked, it still exists simply as a transferable loyalty NFT, just without any withdrawal value behind it
The user can combine several of these amount-less loyalty NFTs into one, where the resulting NFT’s points is the sum of those burned to produce it
Contract supports Permit, which avoids the need to do ERC20 approvals for XDEFI


## Admin functions

All is fine here, for modifiers, and ownership transfer

## Lock / Unlock / Relock

In relock function, we should make sure the lockAmount_ is less than unlocked amount, even if the safeTransfer would throw an erro in that cas
```

function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, address destination_) external noReenter returns (uint256 amountUnlocked_, uint256 newTokenId_) {
    // Handle the unlock and get the amount of XDEFI eligible to withdraw.
    amountUnlocked_ = _unlock(msg.sender, tokenId_);

    // Handle the lock position creation and get the tokenId of the locked position.
    newTokenId_ = _lock(lockAmount_, duration_, destination_);

    require(lockAmount_ <= amountUnlocked_, "INSUFFICIENT_UNLOCKED_AMOUNT"):

    // Send the excess XDEFI to the destination.
    SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked_ - lockAmount_);

    // NOTE: This needs to be done again after transferring out.
    _updateXDEFIBalance();
}

```

We can lock with amount = 0, it would mint a NFT with 0 points every time, don't know if it's an issue 
Don't know if not having a minimal lock duration is not an issue also

```

    function _lock(uint256 amount_, uint256 duration_, address destination_) internal returns (uint256 tokenId_) {
        // Get bonus multiplier and check that it is not zero (which validates the duration).
        uint256 bonusMultiplier = bonusMultiplierOf[duration_];
        require(bonusMultiplier != uint256(0), "INVALID_DURATION");

        // Mint a locked staked position NFT to the destination.
        _safeMint(destination_, tokenId_ = _generateNewTokenId(_getPoints(amount_, duration_)));

        // Track deposits.
        totalDepositedXDEFI += amount_;

        // Create Position.
        uint96 units = uint96((amount_ * bonusMultiplier) / uint256(100));
        totalUnits += units;
        positionOf[tokenId_] =
            Position({
                units: units,
                depositedXDEFI: uint88(amount_),
                expiry: uint32(block.timestamp + duration_),
                pointsCorrection: -_toInt256Safe(_pointsPerUnit * units)
            });

        emit LockPositionCreated(tokenId_, destination_, amount_, duration_);
    }

```


## NFT Logic

Looks fine to me