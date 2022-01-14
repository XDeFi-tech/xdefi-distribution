// SPDX-License-Identifier: MIT

pragma solidity =0.8.10;

import { ERC721, ERC721Enumerable, Strings } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IEIP2612 } from "./interfaces/IEIP2612.sol";
import { IXDEFIDistribution } from "./interfaces/IXDEFIDistribution.sol";

/// @dev Handles distributing XDEFI to NFTs that have locked up XDEFI for various durations of time.
contract XDEFIDistribution is IXDEFIDistribution, ERC721Enumerable {

    address internal constant ZERO_ADDRESS = address(0);

    uint256 internal constant ZERO_UINT256 = uint256(0);
    uint256 internal constant ONE_UINT256 = uint256(1);
    uint256 internal constant TWO_UINT256 = uint256(2);

    // See https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
    uint256 internal constant POINTS_MULTIPLIER_BITS = uint256(72);
    uint256 internal _pointsPerUnit;

    address public immutable xdefi;

    uint256 public distributableXDEFI;
    uint256 public totalDepositedXDEFI;
    uint256 public totalUnits;

    mapping(uint256 => Position) public positionOf;

    mapping(uint256 => uint256) public bonusMultiplierOf;  // Scaled by 100, capped at 255 (i.e. 1.1x is 110, 2.55x is 255).

    uint256 internal _tokensMinted;

    string public baseURI;

    address public owner;
    address public pendingOwner;

    uint256 internal constant IS_NOT_LOCKED = uint256(1);
    uint256 internal constant IS_LOCKED = uint256(2);

    uint256 internal _lockedStatus = IS_NOT_LOCKED;

    bool public inEmergencyMode;

    uint256 internal constant MAX_DURATION = uint256(315360000 seconds);  // 10 years.
    uint256 internal constant MAX_BONUS_MULTIPLIER = uint256(255);  // 2.55x.

    uint256 public constant MINIMUM_UNITS = uint256(1e18);

    constructor (address xdefi_, string memory baseURI_) ERC721("Locked XDEFI", "lXDEFI") {
        // Set `xdefi` immutable and check that it's not empty.
        if ((xdefi = xdefi_) == ZERO_ADDRESS) revert InvalidToken();

        owner = msg.sender;
        baseURI = baseURI_;
    }

    modifier onlyOwner() {
        if (owner != msg.sender) revert Unauthorized();

        _;
    }

    modifier noReenter() {
        if (_lockedStatus == IS_LOCKED) revert NoReentering();

        _lockedStatus = IS_LOCKED;
        _;
        _lockedStatus = IS_NOT_LOCKED;
    }

    modifier updatePointsPerUnitAtStart() {
        updateDistribution();
        _;
    }

    modifier updateDistributableAtEnd() {
        _;
        // NOTE: This needs to be done after updating `totalDepositedXDEFI` (which happens in `_destroyLockedPosition`) and transferring out.
        _updateDistributableXDEFI();
    }

    /*******************/
    /* Admin Functions */
    /*******************/

    function acceptOwnership() external {
        if (pendingOwner != msg.sender) revert Unauthorized();

        emit OwnershipAccepted(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = ZERO_ADDRESS;
    }

    function activateEmergencyMode() external onlyOwner {
        inEmergencyMode = true;
        emit EmergencyModeActivated();
    }

    function proposeOwnership(address newOwner_) external onlyOwner {
        emit OwnershipProposed(
            owner,
            pendingOwner = newOwner_
        );
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        emit BaseURISet(
            baseURI = baseURI_
        );
    }

    function setLockPeriods(uint256[] calldata durations_, uint256[] calldata multipliers_) external onlyOwner {
        // Revert if an empty duration array is passed in, which would result in a successful, yet wasted useless transaction.
        if (durations_.length == ZERO_UINT256) revert EmptyArray();

        for (uint256 i; i < durations_.length;) {
            uint256 duration = durations_[i];
            uint256 multiplier = multipliers_[i];

            // Revert if duration is 0 or longer than max defined.
            if (duration == ZERO_UINT256 || duration > MAX_DURATION) revert InvalidDuration();

            // Revert if bonus multiplier is larger than max defined.
            if (multiplier > MAX_BONUS_MULTIPLIER) revert InvalidMultiplier();

            emit LockPeriodSet(
                duration,
                bonusMultiplierOf[duration] = multiplier
            );

            unchecked {
                ++i;
            }
        }
    }

    /**********************/
    /* Position Functions */
    /**********************/

    function emergencyUnlock(uint256 tokenId_, address destination_) external noReenter updateDistributableAtEnd returns (uint256 amountUnlocked_) {
        // Revert if not in emergency mode.
        if (!inEmergencyMode) revert NotInEmergencyMode();

        // Revert if account is not the owner of the token.
        if (ownerOf(tokenId_) != msg.sender) revert NotTokenOwner();

        // Fetch position.
        Position storage position = positionOf[tokenId_];
        uint256 units = uint256(position.units);
        amountUnlocked_ = uint256(position.depositedXDEFI);

        // Track deposits.
        // NOTE: Can be unchecked since `totalDepositedXDEFI` increase in `_createLockedPosition` is the only place where `totalDepositedXDEFI` is set.
        unchecked {
            totalDepositedXDEFI -= amountUnlocked_;
        }

        // Delete FDT Position.
        // NOTE: Can be unchecked since `totalUnits` increase in `_createLockedPosition` is the only place where `totalUnits` is set.
        unchecked {
            totalUnits -= units;
        }

        delete positionOf[tokenId_];

        // Send the unlocked XDEFI to the destination. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transfer(destination_, amountUnlocked_);
    }

    function lock(uint256 amount_, uint256 duration_, uint256 bonusMultiplier_, address destination_) external noReenter updatePointsPerUnitAtStart returns (uint256 tokenId_) {
        tokenId_ = _lock(amount_, duration_, bonusMultiplier_, destination_);
    }

    function lockWithPermit(uint256 amount_, uint256 duration_, uint256 bonusMultiplier_, address destination_, uint256 deadline_, uint8 v_, bytes32 r_, bytes32 s_) external noReenter updatePointsPerUnitAtStart returns (uint256 tokenId_) {
        // Approve this contract for the amount, using the provided signature.
        IEIP2612(xdefi).permit(msg.sender, address(this), amount_, deadline_, v_, r_, s_);

        tokenId_ = _lock(amount_, duration_, bonusMultiplier_, destination_);
    }

    function relock(uint256 tokenId_, uint256 lockAmount_, uint256 duration_, uint256 bonusMultiplier_, address destination_) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_, uint256 newTokenId_) {
        // Handle the unlock and get the amount of XDEFI eligible to withdraw.
        amountUnlocked_ = _destroyLockedPosition(msg.sender, tokenId_);

        newTokenId_ = _relock(lockAmount_, amountUnlocked_, duration_, bonusMultiplier_, destination_);
    }

    function unlock(uint256 tokenId_, address destination_) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_) {
        // Handle the unlock and get the amount of XDEFI eligible to withdraw.
        amountUnlocked_ = _destroyLockedPosition(msg.sender, tokenId_);

        // Send the unlocked XDEFI to the destination. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transfer(destination_, amountUnlocked_);
    }

    function updateDistribution() public {
        // NOTE: Since `_updateDistributableXDEFI` is called anywhere after XDEFI is withdrawn from the contract, here `changeInDistributableXDEFI` should always be greater than 0.
        uint256 increaseInDistributableXDEFI = _updateDistributableXDEFI();

        // Return if no change in distributable XDEFI.
        if (increaseInDistributableXDEFI == ZERO_UINT256) return;

        uint256 totalUnitsCached = totalUnits;

        // Revert if `totalUnitsCached` is zero. (This would have reverted anyway in the line below.)
        if (totalUnitsCached == ZERO_UINT256) revert NoUnitSupply();

        // NOTE: Max numerator is 240_000_000 * 1e18 * (2 ** 72), which is less than `type(uint256).max`, and min denominator is 1.
        //       So, `_pointsPerUnit` can grow by 2**160 every distribution of XDEFI's max supply.
        unchecked {
            _pointsPerUnit += (increaseInDistributableXDEFI << POINTS_MULTIPLIER_BITS) / totalUnitsCached;
        }

        emit DistributionUpdated(msg.sender, increaseInDistributableXDEFI);
    }

    function withdrawableOf(uint256 tokenId_) external view returns (uint256 withdrawableXDEFI_) {
        Position storage position = positionOf[tokenId_];
        withdrawableXDEFI_ = _withdrawableGiven(position.units, position.depositedXDEFI, position.pointsCorrection);
    }

    /****************************/
    /* Batch Position Functions */
    /****************************/

    function relockBatch(uint256[] calldata tokenIds_, uint256 lockAmount_, uint256 duration_, uint256 bonusMultiplier_, address destination_) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_, uint256 newTokenId_) {
        // Handle the unlocks and get the amount of XDEFI eligible to withdraw.
        amountUnlocked_ = _unlockBatch(msg.sender, tokenIds_);

        newTokenId_ = _relock(lockAmount_, amountUnlocked_, duration_, bonusMultiplier_, destination_);
    }

    function unlockBatch(uint256[] calldata tokenIds_, address destination_) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_) {
        // Handle the unlocks and get the amount of XDEFI eligible to withdraw.
        amountUnlocked_ = _unlockBatch(msg.sender, tokenIds_);

        // Send the unlocked XDEFI to the destination. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transfer(destination_, amountUnlocked_);
    }

    /*****************/
    /* NFT Functions */
    /*****************/

    function getScore(uint256 amount_, uint256 duration_) external pure returns (uint256 score_) {
        score_ = _getScore(amount_, duration_);
    }

    function merge(uint256[] calldata tokenIds_, address destination_) external noReenter returns (uint256 tokenId_) {
        // Revert if trying to merge 0 or 1 tokens, which cannot be done.
        if (tokenIds_.length <= ONE_UINT256) revert MustMergeMultiple();

        // For each NFT, check that it belongs to the caller, burn it, and accumulate the score.
        for (uint256 i; i < tokenIds_.length;) {
            uint256 tokenId = tokenIds_[i];

            // Revert if `msg.sender` is not the owner of the token.
            if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

            // Revert if position has an expiry property, which means it still exists.
            // NOTE: `uint256(positionOf[tokenId].expiry) != ZERO_UINT256` is equivalent (in bytecode and gas).
            if (positionOf[tokenId].expiry != uint32(0)) revert PositionStillLocked();

            _burn(tokenId);

            unchecked {
                // Max score of a previously locked position is `type(uint128).max`, so `score` is reasonably not going to overflow.
                // Note: Using the so-far-unused variable `tokenId_` for now as `score`.
                tokenId_ += _getScoreFromTokenId(tokenId);

                ++i;
            }
        }

        // Generate a new tokenId based on the accumulated score.
        // Note: `tokenId_` was used as `score` up until, this point.
        tokenId_ = _generateNewTokenId(tokenId_);

        emit TokensMerged(tokenIds_, tokenId_);

        // Mine a new NFT to the destinations.
        _safeMint(destination_, tokenId_);
    }

    function scoreOf(uint256 tokenId_) external view returns (uint256 score_) {
        // Revert if the token does not exist.
        if (!_exists(tokenId_)) revert TokenDoesNotExist();

        score_ = _getScoreFromTokenId(tokenId_);
    }

    function tokenURI(uint256 tokenId_) public view override(IXDEFIDistribution, ERC721) returns (string memory tokenURI_) {
        // Revert if the token does not exist.
        if (!_exists(tokenId_)) revert TokenDoesNotExist();

        tokenURI_ = string(abi.encodePacked(baseURI, Strings.toString(tokenId_)));
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    function _createLockedPosition(uint256 amount_, uint256 duration_, uint256 bonusMultiplier_, address destination_) internal returns (uint256 tokenId_) {
        // Revert is locking has been disabled.
        if (inEmergencyMode) revert LockingIsDisabled();

        uint256 bonusMultiplier = bonusMultiplierOf[duration_];

        // Revert if the bonus multiplier is zero.
        if (bonusMultiplier == ZERO_UINT256) revert InvalidDuration();

        // Revert if the bonus multiplier is not at least what was expected.
        if (bonusMultiplier < bonusMultiplier_) revert IncorrectBonusMultiplier();

        // Track deposits.
        totalDepositedXDEFI += amount_;

        // Generate a token id.
        tokenId_ = _generateNewTokenId(_getScore(amount_, duration_));

        // Create Position.
        unchecked {
            uint256 units = (amount_ * bonusMultiplier) / uint256(100);

            // Revert if position will end up with less than define minimum lockable units.
            if (units < MINIMUM_UNITS) revert LockResultsInTooFewUnits();

            totalUnits += units;

            positionOf[tokenId_] =
                Position({
                    units: uint96(units),  // 240M * 1e18 * 255 can never be larger than a `uint96`.
                    depositedXDEFI: uint88(amount_),  // There are only 240M (18 decimals) XDEFI tokens so can never be larger than a `uint88`.
                    expiry: uint32(block.timestamp + duration_),  // For many years, block.timestamp + duration_ will never be larger than a `uint32`.
                    created: uint32(block.timestamp),  // For many years, block.timestamp will never be larger than a `uint32`.
                    pointsCorrection: _pointsPerUnit * units  // _pointsPerUnit * units cannot be greater than a `uint256`.
                });
        }

        emit LockPositionCreated(tokenId_, destination_, amount_, duration_);

        // Mint a locked staked position NFT to the destination.
        _safeMint(destination_, tokenId_);
    }

    function _destroyLockedPosition(address account_, uint256 tokenId_) internal returns (uint256 amountUnlocked_) {
        // Revert if account is not the owner of the token.
        if (ownerOf(tokenId_) != account_) revert NotTokenOwner();

        // Fetch position.
        Position storage position = positionOf[tokenId_];
        uint256 units = uint256(position.units);
        uint256 depositedXDEFI = uint256(position.depositedXDEFI);
        uint256 expiry = uint256(position.expiry);

        // Revert if the position does not have an expiry, which means the position does not exist.
        if (expiry == ZERO_UINT256) revert PositionAlreadyUnlocked();

        // Revert if not enough time has elapsed in order to unlock AND locking is not disabled (which would mean we are allowing emergency withdrawals).
        if (block.timestamp < expiry && !inEmergencyMode) revert CannotUnlock();

        // Get the withdrawable amount of XDEFI for the position.
        amountUnlocked_ = _withdrawableGiven(units, depositedXDEFI, position.pointsCorrection);

        // Track deposits.
        // NOTE: Can be unchecked since `totalDepositedXDEFI` increase in `_createLockedPosition` is the only place where `totalDepositedXDEFI` is set.
        unchecked {
            totalDepositedXDEFI -= depositedXDEFI;
        }

        // Delete FDT Position.
        // NOTE: Can be unchecked since `totalUnits` increase in `_createLockedPosition` is the only place where `totalUnits` is set.
        unchecked {
            totalUnits -= units;
        }

        delete positionOf[tokenId_];

        emit LockPositionWithdrawn(tokenId_, account_, amountUnlocked_);
    }

    function _generateNewTokenId(uint256 score_) internal returns (uint256 tokenId_) {
        // Score is implicitly capped at max supply of XDEFI for 10 years locked (less than 2**119).
        // Total minted NFTs is expected to be reasonably capped at `type(uint128).max`.
        unchecked {
            tokenId_ = (score_ << uint256(128)) + _tokensMinted++;
        }
    }

    function _getScore(uint256 amount_, uint256 duration_) internal pure returns (uint256 score_) {
        // Score is implicitly capped at max supply of XDEFI for 10 years locked (less than 2**116).
        unchecked {
            score_ = amount_ * duration_;
        }
    }

    function _getScoreFromTokenId(uint256 tokenId_) internal pure returns (uint256 score_) {
        score_ = tokenId_ >> uint256(128);
    }

    function _lock(uint256 amount_, uint256 duration_, uint256 bonusMultiplier_, address destination_) internal returns (uint256 tokenId_) {
        // Lock the XDEFI in the contract. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transferFrom(msg.sender, address(this), amount_);

        // Handle the lock position creation and get the tokenId of the locked position.
        tokenId_ = _createLockedPosition(amount_, duration_, bonusMultiplier_, destination_);
    }

    function _relock(uint256 lockAmount_, uint256 amountUnlocked_, uint256 duration_, uint256 bonusMultiplier_, address destination_) internal returns (uint256 tokenId_) {
        // Throw convenient error if trying to re-lock more than was unlocked. `amountUnlocked_ - lockAmount_` cannot reverted below now.
        if (lockAmount_ > amountUnlocked_) revert InsufficientAmountUnlocked();

        // Handle the lock position creation and get the tokenId of the locked position.
        tokenId_ = _createLockedPosition(lockAmount_, duration_, bonusMultiplier_, destination_);

        unchecked {
            if (amountUnlocked_ - lockAmount_ != ZERO_UINT256) {
                // Send the excess XDEFI to the destination, if needed. (Don't need SafeERC20 since XDEFI is standard ERC20).
                IERC20(xdefi).transfer(destination_, amountUnlocked_ - lockAmount_);
            }
        }
    }

    function _unlockBatch(address account_, uint256[] calldata tokenIds_) internal returns (uint256 amountUnlocked_) {
        // Revert if trying to unlock 0 positions, which would result in a successful, yet wasted useless transaction.
        if (tokenIds_.length == ZERO_UINT256) revert EmptyArray();

        // Handle the unlock for each position and accumulate the unlocked amount.
        for (uint256 i; i < tokenIds_.length;) {
            unchecked {
                amountUnlocked_ += _destroyLockedPosition(account_, tokenIds_[i]);

                ++i;
            }
        }
    }

    function _updateDistributableXDEFI() internal returns (uint256 increaseInDistributableXDEFI_) {
        uint256 xdefiBalance = IERC20(xdefi).balanceOf(address(this));
        uint256 previousDistributableXDEFI = distributableXDEFI;

        unchecked {
            uint256 currentDistributableXDEFI = xdefiBalance > totalDepositedXDEFI ? xdefiBalance - totalDepositedXDEFI : ZERO_UINT256;

            // Return 0 early if distributable XDEFI did not change.
            if (currentDistributableXDEFI == previousDistributableXDEFI) return ZERO_UINT256;

            // Set distributableXDEFI.
            distributableXDEFI = currentDistributableXDEFI;

            // Return 0 early if distributable XDEFI decreased.
            if (currentDistributableXDEFI < previousDistributableXDEFI) return ZERO_UINT256;

            increaseInDistributableXDEFI_ = currentDistributableXDEFI - previousDistributableXDEFI;
        }
    }

    function _withdrawableGiven(uint256 units_, uint256 depositedXDEFI_, uint256 pointsCorrection_) internal view returns (uint256 withdrawableXDEFI_) {
        // NOTE: In a worst case (120k XDEFI locked at 2.55x bonus, 120k XDEFI reward, cycled 1 million times) `_pointsPerUnit * units_` is smaller than 2**248.
        //       Since `pointsCorrection_` is always less than `_pointsPerUnit * units_`, (because `_pointsPerUnit` only grows) there is no underflow on the subtraction.
        //       Finally, `depositedXDEFI_` is at most 88 bits, so after the division by a very large `POINTS_MULTIPLIER`, this doesn't need to be checked.
        unchecked {
            withdrawableXDEFI_ =
                (
                    (
                        (
                            _pointsPerUnit * units_
                        ) - pointsCorrection_
                    ) >> POINTS_MULTIPLIER_BITS
                ) + depositedXDEFI_;
        }
    }

}
