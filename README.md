# xdefi-distribution

## Description

This contract provides a mechanism for users to lock XDEFI, resulting in non-fungible locked positions, since each position is only un-lockable in its entirety after a certain time. Locked positions have a right to withdraw at least the respective amount of XDEFI deposited, as well as a portion of XDEFI that was airdropped to this contract, and thus dispersed to all locked positions. This portion is based on the relative portion of locked XDEFI in comparison to all locked XDEFI, and the bonus multiplier of the locked position, which is assigned at lock-time, based on the lock duration. Further, the locked and unlocked positions exist as NFTs with a number of "credits", in which several can be merged/burned to consolidate them into one NFT.

## Features and Functionality

-   Users can lock in an amount of XDEFI for a duration and cannot unlock/withdraw during the specified duration.
-   Lock durations and their respective bonus multiplier are definable by the admin, and can be changed. 0-second durations cannot be enabled. "No bonus" is effectively a bonus multiplier of 1x, which still receives a "normal" share of future distributed rewards. Changes to the lock durations do not retroactively affect existing locked positions.
-   Users can lock in any amount of XDEFI that results in at least 1e18 (1 with 18 decimals) "units" (i.e. 1 XDEFI at a 1x bonus multiplier).
-   Upon creating a locked position, an NFT is minted which is the owner of that locked position. In order words, owning that NFT gives the user the right to eventually withdraw the locked position.
-   The NFT is transferable at any time, regardless if the original locked position still exists.
-   After a locked position's lockup time expires, the owner of the NFT can re-lock the amount into a new stake position, or withdraw it, or some combination, in one transaction.
-   XDEFI Rewards are accrued while locked up, with a bonus multiplier based on the lockup time.
-   Accruing of XDEFI rewards with the bonus multiplier persists after the lockup time expires. This is fine since the goal is to reward the initial commitment. Further, one is still better off re-locking their withdrawable token, to compound.
-   Upon locking, the NFT locked position is also given "credits”, which is some function of amount and lockup time (`amount * duration`).
-   The NFT points to some off-chain server that will serve the correct metadata given the `tokenId`. The metadata (`tier`, `credits`, etc) are enforced by the smart contract.
-   Once the locked position has been unlocked and the XDEFI withdrawn, the NFT still exists simply as a transferable loyalty NFT, and retains its credits, but without any withdrawable XDEFI.
-   Users can combine several of these position-less loyalty NFTs into one, where the resulting NFT’s credits is the sum of those burned to consolidate.
-   Contract supports ERC20 Permit, which avoids the need to do ERC20 approvals for XDEFI locking.
-   A "no-going-back" emergency mode exists where the contract admin can prevent new locks, allow immediate unlocks of all locked positions, as well as an emergency unlock to alow users to remove just their deposits in the event of severe issues.
-   NFT credits can be consumed by the owner, or by anyone via a ConsumePermit, similar to ERC20 Permits.
-   Contract support token and account approvals, so any access control logic that is limited to the owner of the NFTs are actually also enabled for approved operators.

## Contracts

### XDEFIDistribution

This contract contains the standalone logic for locking, unlocking, re-locking, batched unlocking, batched re-locking, merging, and consuming, as well as the ERC721Enumerable functionality.

### XDEFIDistributionHelper

This contract is a stateless helper for read-only functionality, intended to help reduce smart contact queries by front-ends/clients, currently supporting:

-   `getAllTokensForAccount`, which returns an array of all tokenIds owned by an account
-   `getAllLockedPositionsForAccount`, which returns:
    -   an array of all tokenIds owned by an account that are still locked
    -   an array of respective locked position info for each tokenId
    -   an array of respective withdrawable amounts for each tokenId

## Testing and deployment

Setup with `npm install` or `npm ci`.

Compile with `npm run compile`.

Test with `npm run test`.

Coverage with `npm run coverage`.

Ensure a `./secrets.json` exists with:

```json
{
    "ropsten": {
        "mnemonic": "some mnemonic",
        "xdefi": "address of XDEFI token",
        "rpc": "HTTPS RPC URL",
        "baseURI": "Base URI for NFTs"
    },
    "rinkeby": {...},
    "mainnet": {...},
    "ganache": {...},
    "some-other-network": {...}
}
```

Deploy with `npm run deploy:networkName`, where `networkName` is the name of the network (i.e. `ropsten`, `mainnet`, etc).

Run sample backend NFT server with `npm run server`.
