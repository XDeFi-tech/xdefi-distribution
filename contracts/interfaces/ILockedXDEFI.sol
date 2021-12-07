//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

interface ILockedXDEFI {

    /*******************/
    /* State Variables */
    /*******************/

    function baseURI() external view returns (string memory baseURI_);

    function multiplierOf(uint256 duration_) external view returns (uint256 multiplier_);

    function owner() external view returns (address owner_);

    function pendingOwner() external view returns (address pendingOwner_);

    function positionOf(uint256 tokenId_) external view returns (uint96 units, uint32 expiry);

    function totalUnits() external view returns (uint256 totalUnits_);

    function XDEFI() external view returns (address XDEFI_);

    /*******************/
    /* Admin Functions */
    /*******************/

    function acceptOwnership() external;

    function addLockPeriods(uint256[] memory durations_, uint256[] memory multipliers) external;

    function deleteLockPeriods(uint256[] memory durations_) external;

    function setBaseURI(string memory baseURI_) external;

    function transferOwnership(address newOwner_) external;

    /**********************/
    /* Position Functions */
    /**********************/

    function lock(uint256 amount_, uint256 duration_, address destination_) external returns (uint256 tokenId_);

    function lockWithPermit(uint256 amount_, uint256 duration_, address destination_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) external returns (uint256 tokenId_);

    function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 newTokenId_);

    function unlock(uint256 tokenId_, address destination_) external;

    function valueOf(uint256 tokenId_) external view returns (uint256 value_);

    /****************************/
    /* Batch Position Functions */
    /****************************/

    function relock(uint256[] memory tokenIds_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 newTokenId_);

    function unlock(uint256[] memory tokenIds_, address destination_) external;

    /*****************/
    /* NFT Functions */
    /*****************/

    function getPoints(uint256 amount_, uint256 duration_) external pure returns (uint256 points_);

    function merge(uint256[] memory tokenIds_, address destination_) external returns (uint256 tokenId_);

    function pointsOf(uint256 tokenId_) external view returns (uint256 points_);

}
