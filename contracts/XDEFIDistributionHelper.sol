// SPDX-License-Identifier: MIT

pragma solidity =0.8.10;

import { IXDEFIDistributionHelper, IXDEFIDistributionLike } from "./interfaces/IXDEFIDistributionHelper.sol";

/// @dev Stateless helper contract for external clients to reduce web3 calls to gather XDEFIDistribution information related to individual accounts.
contract XDEFIDistributionHelper is IXDEFIDistributionHelper {

    function getAllTokensForAccount(address xdefiDistribution_, address account_) public view returns (uint256[] memory tokenIds_) {
        uint256 count = IXDEFIDistributionLike(xdefiDistribution_).balanceOf(account_);
        tokenIds_ = new uint256[](count);

        for (uint256 i; i < count;) {
            tokenIds_[i] = IXDEFIDistributionLike(xdefiDistribution_).tokenOfOwnerByIndex(account_, i);

            unchecked {
                ++i;
            }
        }
    }

    function getAllLockedPositionsForAccount(address xdefiDistribution_, address account_) external view returns (uint256[] memory tokenIds_, IXDEFIDistributionLike.Position[] memory positions_, uint256[] memory withdrawables_) {
        uint256[] memory tokenIds = getAllTokensForAccount(xdefiDistribution_, account_);

        IXDEFIDistributionLike.Position[] memory positions = new IXDEFIDistributionLike.Position[](tokenIds.length);

        uint256 validPositionCount;

        // NOTE: unchecked around entire for-loop due to the continue.
        unchecked {
            for (uint256 i; i < tokenIds.length; ++i) {
                uint256 tokenId = tokenIds[i];
                IXDEFIDistributionLike.Position memory position = IXDEFIDistributionLike(xdefiDistribution_).positionOf(tokenId);

                if (position.expiry == uint32(0)) continue;

                tokenIds[validPositionCount] = tokenId;
                positions[validPositionCount++] = position;
            }
        }


        tokenIds_ = new uint256[](validPositionCount);
        positions_ = new IXDEFIDistributionLike.Position[](validPositionCount);
        withdrawables_ = new uint256[](validPositionCount);

        for (uint256 i; i < validPositionCount;) {
            positions_[i] = positions[i];
            withdrawables_[i] = IXDEFIDistributionLike(xdefiDistribution_).withdrawableOf(tokenIds_[i] = tokenIds[i]);

            unchecked {
                ++i;
            }
        }
    }

}
