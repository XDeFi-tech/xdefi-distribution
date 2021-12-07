//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import { ERC721, ERC721Enumerable, Strings } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IEIP2612 } from "./interfaces/IEIP2612.sol";
import { ILockedXDEFI } from "./interfaces/ILockedXDEFI.sol";

contract LockedXDEFI is ILockedXDEFI, ERC721Enumerable {

    using Strings for uint256;

    struct Position {
        uint96 units;
        uint32 expiry;
    }

    string public baseURI;

    address public owner;
    address public pendingOwner;

    address public XDEFI;

    uint256 public totalUnits;

    mapping(uint256 => Position) public positionOf;
    mapping(uint256 => uint256) public multiplierOf;  // Scaled by 100, so 1.1 is 110.

    constructor(address XDEFI_, string memory baseURI_) ERC721("Locked XDEFI", "lXDEFI") {
        owner = msg.sender;
        XDEFI = XDEFI_;
        baseURI = baseURI_;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "NOT_OWNER");
        _;
    }

    /*******************/
    /* Admin Functions */
    /*******************/

    function acceptOwnership() external {
        require(pendingOwner == msg.sender, "NOT_PENDING_OWNER");
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function addLockPeriods(uint256[] memory durations_, uint256[] memory multipliers) external onlyOwner {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            multiplierOf[durations_[i]] = multipliers[i];
        }
    }

    function deleteLockPeriods(uint256[] memory durations_) external onlyOwner {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            delete multiplierOf[durations_[i]];
        }
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        baseURI = baseURI_;
    }

    function transferOwnership(address newOwner_) external onlyOwner {
        pendingOwner = newOwner_;
    }

    /**********************/
    /* Position Functions */
    /**********************/

    function lock(uint256 amount_, uint256 duration_, address destination_) public returns (uint256 tokenId_) {
        // Handle the lock position creation.
        tokenId_ = _handleLock(amount_, duration_, destination_, IERC20(XDEFI).balanceOf(address(this)));

        // Lock the XDEFI in the contract.
        SafeERC20.safeTransferFrom(IERC20(XDEFI), msg.sender, address(this), amount_);
    }

    function lockWithPermit(uint256 amount_, uint256 duration_, address destination_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) external returns (uint256 tokenId_) {
        // Approve this contract for the amount, using the provided signature.
        IEIP2612(XDEFI).permit(msg.sender, address(this), amount_, deadline_, v_, r_, s_);

        return lock(amount_, duration_, destination_);
    }

    function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 newTokenId_) {
        // Handle the unlock and get the amount of XDEFI eligible to withdraw.
        uint256 amountUnlocked = _handleUnlock(tokenId_);

        // Prepare the amount to transfer;
        uint256 amountToTransfer = amountUnlocked - lockAmount_;

        // Handle the lock position creation.
        newTokenId_ = _handleLock(lockAmount_, duration_, destination_, IERC20(XDEFI).balanceOf(address(this)) - amountToTransfer);

        // Send the excess XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountToTransfer);
    }

    function unlock(uint256 tokenId_, address destination_) external {
        // Handle the unlock and send the effective unlock amount of XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, _handleUnlock(tokenId_));
    }

    function valueOf(uint256 tokenId_) external view returns (uint256 value_) {
        return _getValueOf(positionOf[tokenId_].units, totalUnits);
    }

    /****************************/
    /* Batch Position Functions */
    /****************************/

    function relock(uint256[] memory tokenIds_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 newTokenId_) {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "USE_RELOCK");

        uint256 amountUnlocked;

        // Handle the unlock for each position and accumulate the unlocked amount.
        for (uint256 i; i < count; ++i) {
            amountUnlocked += _handleUnlock(tokenIds_[i]);
        }

        // Prepare the amount to transfer;
        uint256 amountToTransfer = amountUnlocked - lockAmount_;

        // Handle the lock position creation.
        newTokenId_ = _handleLock(lockAmount_, duration_, destination_, IERC20(XDEFI).balanceOf(address(this)) - amountToTransfer);

        // Send the excess XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountToTransfer);
    }

    function unlock(uint256[] memory tokenIds_, address destination_) external {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "USE_UNLOCK");

        uint256 amountUnlocked;

        // Handle the unlock for each position and accumulate the unlocked amount.
        for (uint256 i; i < count; ++i) {
            amountUnlocked += _handleUnlock(tokenIds_[i]);
        }

        // Send the effective unlock amount of XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked);
    }

    /*****************/
    /* NFT Functions */
    /*****************/

    function getPoints(uint256 amount_, uint256 duration_) external pure returns (uint256 points_) {
        return _getPoints(amount_, duration_);
    }

    function merge(uint256[] memory tokenIds_, address destination_) external returns (uint256 tokenId_) {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "MIN_2_TO_MERGE");

        uint256 points;

        // For each NFT, check that it belongs to the caller, burn it, and accumulate the points.
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds_[i];
            require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");

            _burn(tokenId);

            points += _getPointsFromTokenId(tokenId);
        }

        // Mine a new NFT to the destinations, based on the accumulated points.
        _mint(destination_, tokenId_ = _generateNewTokenId(points));
    }

    function pointsOf(uint256 tokenId_) external view returns (uint256 points_) {
        require(_exists(tokenId_), "NO_TOKEN");
        return _getPointsFromTokenId(tokenId_);
    }

    function tokenURI(uint256 tokenId_) public view override returns (string memory tokenURI_) {
        require(_exists(tokenId_), "ERC721Metadata: URI query for nonexistent token");

        return string(abi.encodePacked(baseURI, tokenId_.toString()));
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    function _generateNewTokenId(uint256 points_) internal view returns (uint256 tokenId_) {
        // Points is capped at 128 bits (max supply of XDEFI for 10 years locked), total supply of NFTs is capped at 128 bits.
        return (points_ << uint256(128)) + uint128(totalSupply());
    }

    function _getPoints(uint256 amount_, uint256 duration_) internal pure returns (uint256 points_) {
        return amount_ * duration_;
    }

    function _getPointsFromTokenId(uint256 tokenId_) internal pure returns (uint256 points_) {
        return tokenId_ >> uint256(128);
    }

    function _getValueOf(uint256 units_, uint256 currentTotalUnits_) internal view returns (uint256 value_) {
        // Calculates the amount of XDEFI the locked units are worth.
        return (units_ * IERC20(XDEFI).balanceOf(address(this))) / currentTotalUnits_;
    }

    function _handleLock(uint256 amount_, uint256 duration_, address destination_, uint256 totalLockedXDEFI_) internal returns (uint256 tokenId_) {
        // Gets the total units minted.
        uint256 currentTotalUnits = totalUnits;

        // If no units exist, mint it 1:1 to the amount put in, else calculate and mint the amount of units the XDEFI is worth.
        // The ratio will change overtime, as units are burned/minted and XDEFI deposited + gained from fees/withdrawals.
        uint256 units =
            (
                (
                    (currentTotalUnits == uint256(0) || totalLockedXDEFI_ == uint256(0))
                        ? amount_
                        : (amount_ * currentTotalUnits) / totalLockedXDEFI_
                ) * multiplierOf[duration_]
            ) / uint256(100);

        // Check that the duration is has a valid multiplier.
        require(units != uint256(0), "INVALID_LOCK");

        // Increase total units minted.
        totalUnits = currentTotalUnits + units;

        // Create locked position.
        positionOf[tokenId_] = Position({ units: uint96(units), expiry: uint32(block.timestamp + duration_) });

        // Mint a locked staked position NFT to the destination.
        _safeMint(destination_, tokenId_ = _generateNewTokenId(_getPoints(amount_, duration_)));
    }

    function _handleUnlock(uint256 tokenId_) internal returns (uint256 amount_) {
        // Fetch position.
        Position storage position = positionOf[tokenId_];
        uint256 units = position.units;
        uint256 expiry = position.expiry;

        // Check that enough time has elapsed in order to unlock.
        require(block.timestamp >= expiry, "CANNOT_UNLOCK");

        // Delete position.
        delete positionOf[tokenId_];

        // Gets the total units minted.
        uint256 currentTotalUnits = totalUnits;

        // Calculates the amount of XDEFI the locked units are worth.
        amount_ = _getValueOf(units, currentTotalUnits);

        // Check that some amount can be withdrawn.
        require(amount_ > uint256(0), "NO_POSITION");

        // Decrease the decrease total units in circulation.
        totalUnits = currentTotalUnits - units;
    }

}
