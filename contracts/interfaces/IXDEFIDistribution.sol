//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

interface IXDEFIDistribution {

    event OwnershipProposed(address indexed owner, address indexed pendingOwner);
    event OwnershipAccepted(address indexed previousOwner, address indexed owner);

    event LockPeriodSet(uint256 duration, uint256 bonusMultiplier);

    event LockPositionCreated(uint256 indexed tokenId, address indexed owner, uint256 amount, uint256 duration);
    event LockPositionWithdrawn(uint256 indexed tokenId, address indexed owner, uint256 amount);

    event DistributionUpdated(address indexed caller, uint256 amount);

    function XDEFI() external view returns (address XDEFI_);

    function distributableXDEFI() external view returns (uint256 distributableXDEFI_);

    function totalDepositedXDEFI() external view returns (uint256 totalDepositedXDEFI_);

    function totalUnits() external view returns (uint256 totalUnits_);

    function positionOf(uint256 id_) external view returns (uint96 units_, uint88 depositedXDEFI_, uint32 expiry_, int256 pointsCorrection_);

    function bonusMultiplierOf(uint256 duration_) external view returns (uint256 bonusMultiplier_);

    function baseURI() external view returns (string memory baseURI_);

    function owner() external view returns (address owner_);

    function pendingOwner() external view returns (address pendingOwner_);

    /*******************/
    /* Admin Functions */
    /*******************/

    function acceptOwnership() external;

    function setBaseURI(string memory baseURI_) external;

    function setLockPeriods(uint256[] memory durations_, uint256[] memory multipliers) external;

    function proposeOwnership(address newOwner_) external;

    /**********************/
    /* Position Functions */
    /**********************/

    function withdrawableOf(uint256 tokenId_) external view returns (uint256 withdrawableXDEFI_);

    function lock(uint256 amount_, uint256 duration_, address destination_) external returns (uint256 tokenId_);

    function lockWithPermit(uint256 amount_, uint256 duration_, address destination_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) external returns (uint256 tokenId_);

    function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 amountUnlocked_, uint256 newTokenId_);

    function unlock(uint256 tokenId_, address destination_) external returns (uint256 amountUnlocked_);

    function updateDistribution() external;

    /****************************/
    /* Batch Position Functions */
    /****************************/

    function relockBatch(uint256[] memory tokenIds_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 amountUnlocked_, uint256 newTokenId_);

    function unlockBatch(uint256[] memory tokenIds_, address destination_) external returns (uint256 amountUnlocked_);

    /*****************/
    /* NFT Functions */
    /*****************/

    function getPoints(uint256 amount_, uint256 duration_) external pure returns (uint256 points_);

    function merge(uint256[] memory tokenIds_, address destination_) external returns (uint256 tokenId_);

    function pointsOf(uint256 tokenId_) external view returns (uint256 points_);

    function tokenURI(uint256 tokenId_) external view returns (string memory tokenURI_);

}
