# xdefi-distribution

## Description
This contract provides a mechanisms for users to lock XDEFI, resulting in non-fungible locked positions, since each position is only unlockable in its entirety after a certain time from locking. Locked positions have a right to withdraw at least the respective amount of XDEFI deposited, as well as a portion of XDEFI that was airdropped to this contract. This portion is based on the relative portion of locked XDEFI in comparison to all locked XDEFI, and the bonus multiplier of the locked position, which is assigned at lock-time based on the lock duration. Further, the locked and unlocked positions exist as NFTs with a score, in which several can be merged/burned to create new NFTs of a larger score.

## Features and Functionality
- Users can lock in an amount of XDEFI for a duration and cannot unlock/withdraw during the specified duration
- Lock durations and their respective bonus multiplier are definable by the admin, and can be changed. Even 0 seconds can be enabled. "No bonus" is effectively a bonus multiplier of 1.
- User can lock in any amount of XDEFI, but not 0.
- The lockup becomes a “locked position”, which is an NFT (similar to Uniswap v3's liquidity position NFTs, but simpler).
- The "locked position" is transferable as a NFT during lockup and after it is unlocked/withdrawn.
- After a locked position's lockup time expires, the owner of the NFT can re-lock the amount into a new stake position, or withdraw it, or some combination, in one tx.
- Rewards are accrued while locked up, with a bonus multiplier based on the lockup time.
- Accruing of rewards/revenue with the bonus multiplier persists after the lockup time expires. This is fine since the goal is to reward the initial commitment. Further, one would be better off re-locking their withdrawable token, to compound.
- Upon locking, the NFT locked position is given a “score”, which is some function of amount and lockup time (`amount * duration`).
- The NFT's score is embedded in the `tokenId`, so the chain enforced it.
- The NFT points to some off-chain server that will serve the correct metadata given the NFTs points (i.e. `tokenId`). This is a stateless process off-chain.
- Once the NFT position has been unlocked and the XDEFI withdrawn, the NFT still exists simply as a transferable loyalty NFT, with its same score, but without any withdrawable XDEFI.
- Users can combine several of these amount-less loyalty NFTs into one, where the resulting NFT’s points is the sum of those burned to produce it.
- Contract supports Permit, which avoids the need to do ERC20 approvals for XDEFI locking.

## Testing and deployment

Setup with `npm install` or `npm ci`.

Test with `npx hardhat test`.

Coverage with `npx hardhat coverage`.

Ensure a `./secrets.json` exists with:
```json
{
    "networkName1": {
        "mnemonic": "some mnemonic",
        "xdefi": "address of XDEFI token",
        "rpc": "HTTPS RPC URL",
        "baseURI": "Base URI for NFTs"
    },
    "networkName2": {...},
    "networkName3": {...}
}
```

Deploy with `npx hardhat run scripts/deploy.js --network networkName`.
