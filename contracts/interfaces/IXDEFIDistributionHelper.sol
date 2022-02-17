// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;

import { IXDEFIDistribution } from "./IXDEFIDistribution.sol";

interface IXDEFIDistributionLike {
    struct Position {
        uint96 units;
        uint88 depositedXDEFI;
        uint32 expiry;
        uint32 created;
        uint256 pointsCorrection;
    }

    function balanceOf(address account_) external view returns (uint256 balance_);

    function tokenOfOwnerByIndex(address account_, uint256 index_) external view returns (uint256 tokenId_);

    function positionOf(uint256 tokenId_) external view returns (Position memory position_);

    function withdrawableOf(uint256 tokenId_) external view returns (uint256 withdrawableXDEFI_);
}

interface IXDEFIDistributionHelper {
    function getAllTokensForAccount(address xdefiDistribution_, address account_) external view returns (uint256[] memory tokenIds_);

    function getAllLockedPositionsForAccount(address xdefiDistribution_, address account_)
        external
        view
        returns (
            uint256[] memory tokenIds_,
            IXDEFIDistributionLike.Position[] memory positions_,
            uint256[] memory withdrawables_
        );
}
