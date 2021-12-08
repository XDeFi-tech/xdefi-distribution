//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import { ERC721, ERC721Enumerable, Strings } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IEIP2612 } from "./interfaces/IEIP2612.sol";

contract XDEFIDistribution is ERC721Enumerable {

    event OwnershipProposed(address indexed owner, address indexed pendingOwner);
    event OwnershipAccepted(address indexed previousOwner, address indexed owner);

    event LockPeriodAdded(uint256 duration, uint256 bonusMultiplier);
    event LockPeriodRemoved(uint256 duration);

    event LockPositionCreated(uint256 indexed tokenId, address indexed sender, address indexed owner, uint256 amount, uint256 duration);
    event LockPositionWithdrawn(uint256 indexed tokenId, address indexed owner, address indexed destination, uint256 amount);

    event DistributionUpdated(address indexed caller, uint256 amount);

    struct Position {
        uint96 units;  // 240000000000000000000000000 XDEFI * 100x bonus (which fits in a uint96)
        uint88 depositedXDEFI; // XDEFI cap is 240000000000000000000000000 (which fits in a uint88)
        uint32 expiry;  // block timestamps for the next 32 years (which fits in a uint32)
        int256 pointsCorrection;
    }

    // optimize, see https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
    uint256 constant internal _pointsMultiplier = uint256(2**128);
    uint256 internal _pointsPerUnit;

    address public XDEFI;

    uint256 public distributableXDEFI;
    uint256 public totalDepositedXDEFI;
    uint256 public totalUnits;

    mapping(uint256 => Position) public positionOf;

    mapping(uint256 => uint256) public bonusMultiplierOf;  // Scaled by 100, so 1.1 is 110.

    uint256 constant zeroDurationPointBase = uint256(100);

    string public baseURI;

    address public owner;
    address public pendingOwner;

    bool internal _locked;

    constructor (address XDEFI_, string memory baseURI_) ERC721("Locked XDEFI", "lXDEFI") {
        require((XDEFI = XDEFI_) != address(0), "INVALID_FUNDS_TOKEN_ADDRESS");
        owner = msg.sender;
        baseURI = baseURI_;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "NOT_OWNER");
        _;
    }

    modifier noReenter() {
        require(!_locked, "LOCKED");
        _locked = true;
        _;
        _locked = false;
    }

    /*******************/
    /* Admin Functions */
    /*******************/

    function acceptOwnership() external {
        require(pendingOwner == msg.sender, "NOT_PENDING_OWNER");
        emit OwnershipAccepted(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function addLockPeriods(uint256[] memory durations_, uint256[] memory multipliers) external onlyOwner {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            uint256 duration = durations_[i];
            emit LockPeriodAdded(duration, bonusMultiplierOf[duration] = multipliers[i]);
        }
    }

    function removeLockPeriods(uint256[] memory durations_) external onlyOwner {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            uint256 duration = durations_[i];
            delete bonusMultiplierOf[duration];
            emit LockPeriodRemoved(duration);
        }
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        baseURI = baseURI_;
    }

    function proposeOwnership(address newOwner_) external onlyOwner {
        emit OwnershipProposed(owner, pendingOwner = newOwner_);
    }

    /**********************/
    /* Position Functions */
    /**********************/

    function _withdrawableGiven(uint96 units_, uint88 depositedXDEFI_, int256 pointsCorrection_) internal view returns(uint256 withdrawableXDEFI_) {
        return
            (
                _toUint256Safe(
                    _toInt256Safe(_pointsPerUnit * uint256(units_)) +
                    pointsCorrection_
                ) / _pointsMultiplier
            ) + uint256(depositedXDEFI_);
    }

    function withdrawableOf(uint256 tokenId_) public view returns(uint256 withdrawableXDEFI_) {
        Position storage position = positionOf[tokenId_];
        return _withdrawableGiven(position.units, position.depositedXDEFI, position.pointsCorrection);
    }

    function lock(uint256 amount_, uint256 duration_, address destination_) public noReenter returns (uint256 tokenId_) {
        // Get bonus multiplier and check that it is not zero (which validates the duration).
        uint256 bonusMultiplier = bonusMultiplierOf[duration_];
        require(bonusMultiplier != uint256(0), "INVALID_DURATION");

        // Lock the XDEFI in the contract.
        SafeERC20.safeTransferFrom(IERC20(XDEFI), msg.sender, address(this), amount_);

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

        emit LockPositionCreated(tokenId_, msg.sender, destination_, amount_, duration_);
    }

    function lockWithPermit(uint256 amount_, uint256 duration_, address destination_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) external returns (uint256 tokenId_) {
        // Approve this contract for the amount, using the provided signature.
        IEIP2612(XDEFI).permit(msg.sender, address(this), amount_, deadline_, v_, r_, s_);

        return lock(amount_, duration_, destination_);
    }

    // TODO: This needs to be tested. Also, are returns ok?
    function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 amountUnlocked_, uint256 newTokenId_) {
        // Handle the unlock and get the amount of XDEFI eligible to withdraw.
        // NOTE: Sending token to self to be used for re-locking.
        amountUnlocked_ = unlock(tokenId_, address(this));

        // Handle the lock position creation.
        newTokenId_ = lock(lockAmount_, duration_, destination_);

        // Send the excess XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked_ - lockAmount_);

        // NOTE: This needs to be done again after transferring out.
        _updateXDEFIBalance();
    }

    function unlock(uint256 tokenId_, address destination_) public noReenter returns (uint256 amountUnlocked_) {
        // Check that the caller is the position NFT owner.
        require(ownerOf(tokenId_) == msg.sender, "NOT_OWNER");

        // Fetch position.
        Position storage position = positionOf[tokenId_];
        uint96 units = position.units;
        uint88 depositedXDEFI = position.depositedXDEFI;
        uint32 expiry = position.expiry;

        // Check that enough time has elapsed in order to unlock.
        require(expiry != uint32(0), "NO_LOCKED_POSITION");
        require(block.timestamp >= uint256(expiry), "CANNOT_UNLOCK");

        // Get the withdrawable amount of XDEFI for the position.
        amountUnlocked_ = _withdrawableGiven(units, depositedXDEFI, position.pointsCorrection);

        // Send the the unlocked XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked_);

        // Track deposits
        totalDepositedXDEFI -= uint256(depositedXDEFI);

        // NOTE: This needs to be done after updating totalDepositedXDEFI and transferring out
        _updateXDEFIBalance();

        // Burn FDT Position
        totalUnits -= units;
        delete positionOf[tokenId_];

        emit LockPositionWithdrawn(tokenId_, msg.sender, destination_, amountUnlocked_);
    }

    function updateDistribution() external {
        uint256 newXDEFI = _toUint256Safe(_updateXDEFIBalance());

        // TODO: evaluate the need for this
        // if (newXDEFI <= int256(0)) return;

        require(totalUnits > uint256(0), "NO_UNIT_SUPPLY");

        if (newXDEFI == uint256(0)) return;

        _pointsPerUnit += ((newXDEFI * _pointsMultiplier) / totalUnits);

        emit DistributionUpdated(msg.sender, newXDEFI);
    }

    /****************************/
    /* Batch Position Functions */
    /****************************/

    // TODO: This needs to be tested. Also, are returns ok?
    function relockBatch(uint256[] memory tokenIds_, uint256 lockAmount_, uint256 duration_, address destination_) external returns (uint256 amountUnlocked_, uint256 newTokenId_) {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "USE_RELOCK");

        // Handle the unlock for each position and accumulate the unlocked amount.
        // NOTE: Sending token to self to be used for re-locking.
        for (uint256 i; i < count; ++i) {
            amountUnlocked_ += unlock(tokenIds_[i], address(this));
        }

        // Handle the lock position creation.
        newTokenId_ = lock(lockAmount_, duration_, destination_);

        // Send the excess XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked_ - lockAmount_);

        // NOTE: This needs to be done again after transferring out.
        _updateXDEFIBalance();
    }

    // TODO: This needs to be tested.
    function unlockBatch(uint256[] memory tokenIds_, address destination_) external returns (uint256 amountUnlocked_) {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "USE_UNLOCK");

        // Handle the unlock for each position and accumulate the unlocked amount.
        for (uint256 i; i < count; ++i) {
            amountUnlocked_ += unlock(tokenIds_[i], destination_);
        }

        // Send the effective unlock amount of XDEFI to the destination.
        SafeERC20.safeTransfer(IERC20(XDEFI), destination_, amountUnlocked_);
    }

    /*****************/
    /* NFT Functions */
    /*****************/

    function getPoints(uint256 amount_, uint256 duration_) external pure returns (uint256 points_) {
        return _getPoints(amount_, duration_);
    }

    // TODO: This needs to be tested.
    function merge(uint256[] memory tokenIds_, address destination_) external returns (uint256 tokenId_) {
        uint256 count = tokenIds_.length;
        require(count > uint256(1), "MIN_2_TO_MERGE");

        uint256 points;

        // For each NFT, check that it belongs to the caller, burn it, and accumulate the points.
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds_[i];
            require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
            require(positionOf[tokenId].expiry == uint32(0), "POSITION_NOT_UNLOCKED");

            _burn(tokenId);

            points += _getPointsFromTokenId(tokenId);
        }

        // Mine a new NFT to the destinations, based on the accumulated points.
        _safeMint(destination_, tokenId_ = _generateNewTokenId(points));
    }

    function pointsOf(uint256 tokenId_) external view returns (uint256 points_) {
        require(_exists(tokenId_), "NO_TOKEN");
        return _getPointsFromTokenId(tokenId_);
    }

    function tokenURI(uint256 tokenId_) public view override returns (string memory tokenURI_) {
        require(_exists(tokenId_), "NO_TOKEN");
        return string(abi.encodePacked(baseURI, Strings.toString(tokenId_)));
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    function _generateNewTokenId(uint256 points_) internal view returns (uint256 tokenId_) {
        // Points is capped at 128 bits (max supply of XDEFI for 10 years locked), total supply of NFTs is capped at 128 bits.
        return (points_ << uint256(128)) + uint128(totalSupply() + 1);
    }

    function _getPoints(uint256 amount_, uint256 duration_) internal pure returns (uint256 points_) {
        return amount_ * (duration_ + zeroDurationPointBase);
    }

    function _getPointsFromTokenId(uint256 tokenId_) internal pure returns (uint256 points_) {
        return tokenId_ >> uint256(128);
    }

    function _toInt256Safe(uint256 x_) internal pure returns (int256 y_) {
        y_ = int256(x_);
        assert(y_ >= int256(0));
    }

    function _toUint256Safe(int256 x_) internal pure returns (uint256 y_) {
        assert(x_ >= int256(0));
        return uint256(x_);
    }

    function _updateXDEFIBalance() internal returns (int256 newFundsTokenBalance_) {
        uint256 previousDistributableXDEFI = distributableXDEFI;
        distributableXDEFI = IERC20(XDEFI).balanceOf(address(this)) - totalDepositedXDEFI;

        return _toInt256Safe(distributableXDEFI) - _toInt256Safe(previousDistributableXDEFI);
    }

}
