// SPDX-License-Identifier: MIT

pragma solidity =0.8.18;

import { IXDEFIDistributionHelper, IXDEFIDistributionLike } from "./interfaces/IXDEFIDistributionHelper.sol";

/// @dev Stateless helper contract for external clients to reduce web3 calls to gather XDEFIDistribution information related to individual accounts.
contract XDEFIDistributionHelper is IXDEFIDistributionHelper {
    function getAllTokensForAccount(address xdefiDistribution_, address account_) public view returns (uint256[] memory tokenIds_) {
        uint256 count = IXDEFIDistributionLike(xdefiDistribution_).balanceOf(account_);

        tokenIds_ = new uint256[](count);

        for (uint256 i; i < count; ) {
            tokenIds_[i] = IXDEFIDistributionLike(xdefiDistribution_).tokenOfOwnerByIndex(account_, i);

            unchecked {
                ++i;
            }
        }
    }

    function getAllTokensAndCreditsForAccount(address xdefiDistribution_, address account_) public view returns (uint256[] memory tokenIds_, uint256[] memory credits_) {
        uint256 count = IXDEFIDistributionLike(xdefiDistribution_).balanceOf(account_);

        tokenIds_ = new uint256[](count);
        credits_ = new uint256[](count);

        for (uint256 i; i < count; ) {
            credits_[i] = IXDEFIDistributionLike(xdefiDistribution_).creditsOf(tokenIds_[i] = IXDEFIDistributionLike(xdefiDistribution_).tokenOfOwnerByIndex(account_, i));

            unchecked {
                ++i;
            }
        }
    }

    function getAllLockedPositionsForAccount(address xdefiDistribution_, address account_)
        external
        view
        returns (
            uint256[] memory tokenIds_,
            IXDEFIDistributionLike.Position[] memory positions_,
            uint256[] memory withdrawables_
        )
    {
        tokenIds_ = getAllTokensForAccount(xdefiDistribution_, account_);

        (tokenIds_, positions_) = _filterTokensWithPositions(xdefiDistribution_, tokenIds_);

        withdrawables_ = new uint256[](tokenIds_.length);

        for (uint256 i; i < tokenIds_.length; ) {
            withdrawables_[i] = IXDEFIDistributionLike(xdefiDistribution_).withdrawableOf(tokenIds_[i]);

            unchecked {
                ++i;
            }
        }
    }

    function getAllLockedPositionsAndCreditsForAccount(address xdefiDistribution_, address account_)
        external
        view
        returns (
            uint256[] memory tokenIds_,
            IXDEFIDistributionLike.Position[] memory positions_,
            uint256[] memory withdrawables_,
            uint256[] memory credits_
        )
    {
        tokenIds_ = getAllTokensForAccount(xdefiDistribution_, account_);

        (tokenIds_, positions_) = _filterTokensWithPositions(xdefiDistribution_, tokenIds_);

        withdrawables_ = new uint256[](tokenIds_.length);
        credits_ = new uint256[](tokenIds_.length);

        for (uint256 i; i < tokenIds_.length; ) {
            uint256 tokenId = tokenIds_[i];

            withdrawables_[i] = IXDEFIDistributionLike(xdefiDistribution_).withdrawableOf(tokenId);
            credits_[i] = IXDEFIDistributionLike(xdefiDistribution_).creditsOf(tokenId);

            unchecked {
                ++i;
            }
        }
    }

    function _filterTokensWithPositions(address xdefiDistribution_, uint256[] memory tokenIds_) internal view returns (uint256[] memory filteredTokenIds_, IXDEFIDistributionLike.Position[] memory positions_) {
        uint256 validPositionCount;

        uint256[] memory tokenIds = new uint256[](tokenIds_.length);
        IXDEFIDistributionLike.Position[] memory positions = new IXDEFIDistributionLike.Position[](tokenIds_.length);

        // NOTE: unchecked around entire for-loop due to the continue.
        unchecked {
            for (uint256 i; i < tokenIds_.length; ++i) {
                uint256 tokenId = tokenIds_[i];

                IXDEFIDistributionLike.Position memory position = IXDEFIDistributionLike(xdefiDistribution_).positionOf(tokenId);

                if (position.expiry == uint32(0)) continue;

                tokenIds[validPositionCount] = tokenId;
                positions[validPositionCount++] = position;
            }
        }

        filteredTokenIds_ = new uint256[](validPositionCount);
        positions_ = new IXDEFIDistributionLike.Position[](validPositionCount);

        for (uint256 i; i < validPositionCount; ) {
            filteredTokenIds_[i] = tokenIds[i];
            positions_[i] = positions[i];

            unchecked {
                ++i;
            }
        }
    }
}
