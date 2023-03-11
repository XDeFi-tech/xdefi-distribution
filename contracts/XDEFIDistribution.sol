// SPDX-License-Identifier: MIT

pragma solidity =0.8.19;

import { ERC721, ERC721Enumerable, Strings } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IEIP2612 } from "./interfaces/IEIP2612.sol";
import { IXDEFIDistribution } from "./interfaces/IXDEFIDistribution.sol";

/// @dev Handles distributing XDEFI to NFTs that have locked up XDEFI for various durations of time.
contract XDEFIDistribution is IXDEFIDistribution, ERC721Enumerable {
    address internal constant ZERO_ADDRESS = address(0);

    uint256 internal constant ZERO_UINT256 = uint256(0);
    uint256 internal constant ONE_UINT256 = uint256(1);
    uint256 internal constant ONE_HUNDRED_UINT256 = uint256(100);

    uint256 internal constant TIER_1 = uint256(1);
    uint256 internal constant TIER_2 = uint256(2);
    uint256 internal constant TIER_3 = uint256(3);
    uint256 internal constant TIER_4 = uint256(4);
    uint256 internal constant TIER_5 = uint256(5);
    uint256 internal constant TIER_6 = uint256(6);
    uint256 internal constant TIER_7 = uint256(7);
    uint256 internal constant TIER_8 = uint256(8);
    uint256 internal constant TIER_9 = uint256(9);
    uint256 internal constant TIER_10 = uint256(10);
    uint256 internal constant TIER_11 = uint256(11);
    uint256 internal constant TIER_12 = uint256(12);
    uint256 internal constant TIER_13 = uint256(13);

    uint256 internal constant TIER_2_THRESHOLD = uint256(150 * 1e18 * 30 days);
    uint256 internal constant TIER_3_THRESHOLD = uint256(300 * 1e18 * 30 days);
    uint256 internal constant TIER_4_THRESHOLD = uint256(750 * 1e18 * 30 days);
    uint256 internal constant TIER_5_THRESHOLD = uint256(1_500 * 1e18 * 30 days);
    uint256 internal constant TIER_6_THRESHOLD = uint256(3_000 * 1e18 * 30 days);
    uint256 internal constant TIER_7_THRESHOLD = uint256(7_000 * 1e18 * 30 days);
    uint256 internal constant TIER_8_THRESHOLD = uint256(15_000 * 1e18 * 30 days);
    uint256 internal constant TIER_9_THRESHOLD = uint256(30_000 * 1e18 * 30 days);
    uint256 internal constant TIER_10_THRESHOLD = uint256(60_000 * 1e18 * 30 days);
    uint256 internal constant TIER_11_THRESHOLD = uint256(120_000 * 1e18 * 30 days);
    uint256 internal constant TIER_12_THRESHOLD = uint256(250_000 * 1e18 * 30 days);
    uint256 internal constant TIER_13_THRESHOLD = uint256(500_000 * 1e18 * 30 days);

    // See https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
    uint256 internal constant POINTS_MULTIPLIER_BITS = uint256(72);
    uint256 internal _pointsPerUnit;

    address public immutable xdefi;

    uint256 public distributableXDEFI;
    uint256 public totalDepositedXDEFI;
    uint256 public totalUnits;

    mapping(uint256 => Position) internal _positionOf;

    mapping(uint256 => uint256) public creditsOf;

    mapping(uint256 => uint256) public bonusMultiplierOf; // Scaled by 100, capped at 255 (i.e. 1.1x is 110, 2.55x is 255).

    uint256 internal _tokensMinted;

    string public baseURI;

    address public owner;
    address public pendingOwner;

    uint256 internal constant IS_NOT_LOCKED = uint256(1);
    uint256 internal constant IS_LOCKED = uint256(2);

    uint256 internal _lockedStatus = IS_NOT_LOCKED;

    bool public inEmergencyMode;

    uint256 internal constant MAX_DURATION = uint256(315360000 seconds); // 10 years.
    uint256 internal constant MAX_BONUS_MULTIPLIER = uint256(255); // 2.55x.

    uint256 public constant MINIMUM_UNITS = uint256(1e18);

    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(uint256 => uint256) public consumePermitNonce;

    string private constant EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = "\x19\x01";

    // keccak256('PermitConsume(uint256 tokenId,address consumer,uint256 limit,uint256 nonce,uint256 deadline)');
    bytes32 private constant CONSUME_PERMIT_SIGNATURE_HASH = bytes32(0xa0a7128942405265cd830695cb06df90c6bfdbbe22677cc592c3d36c3180b079);

    constructor(address xdefi_, string memory baseURI_) ERC721("XDEFI Badges", "bXDEFI") {
        // Set `xdefi` immutable and check that it's not empty.
        if ((xdefi = xdefi_) == ZERO_ADDRESS) revert InvalidToken();

        owner = msg.sender;
        baseURI = baseURI_;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                // keccak256(bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
                0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f,
                // keccak256(bytes('XDEFI Badges')),
                0x4c62db20b6844e29b4686cc489ff0c3aac678cce88f9352a7a0ef17d53feb307,
                // keccak256(bytes('1')),
                0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6,
                block.chainid,
                address(this)
            )
        );
    }

    /*************/
    /* Modifiers */
    /*************/

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
        emit OwnershipProposed(owner, pendingOwner = newOwner_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        emit BaseURISet(baseURI = baseURI_);
    }

    function setLockPeriods(uint256[] calldata durations_, uint256[] calldata multipliers_) external onlyOwner {
        // Revert if an empty duration array is passed in, which would result in a successful, yet wasted useless transaction.
        if (durations_.length == ZERO_UINT256) revert EmptyArray();

        for (uint256 i; i < durations_.length; ) {
            uint256 duration = durations_[i];
            uint256 multiplier = multipliers_[i];

            // Revert if duration is 0 or longer than max defined.
            if (duration == ZERO_UINT256 || duration > MAX_DURATION) revert InvalidDuration();

            // Revert if bonus multiplier is larger than max defined.
            if (multiplier > MAX_BONUS_MULTIPLIER) revert InvalidMultiplier();

            emit LockPeriodSet(duration, bonusMultiplierOf[duration] = multiplier);

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

        // Revert if caller is not the token's owner, not approved for all the owner's token, and not approved for this specific token.
        if (!_isApprovedOrOwner(msg.sender, tokenId_)) revert NotApprovedOrOwnerOfToken();

        // Fetch position.
        Position storage position = _positionOf[tokenId_];
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

        delete _positionOf[tokenId_];

        // Send the unlocked XDEFI to the destination. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transfer(destination_, amountUnlocked_);
    }

    function getBonusMultiplierOf(uint256 tokenId_) external view returns (uint256 bonusMultiplier_) {
        // Fetch position.
        Position storage position = _positionOf[tokenId_];
        uint256 units = uint256(position.units);
        uint256 depositedXDEFI = uint256(position.depositedXDEFI);

        bonusMultiplier_ = (units * ONE_HUNDRED_UINT256) / depositedXDEFI;
    }

    function lock(
        uint256 amount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) external noReenter updatePointsPerUnitAtStart returns (uint256 tokenId_) {
        tokenId_ = _lock(amount_, duration_, bonusMultiplier_, destination_);
    }

    function lockWithPermit(
        uint256 amount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external noReenter updatePointsPerUnitAtStart returns (uint256 tokenId_) {
        // Approve this contract for the amount, using the provided signature.
        IEIP2612(xdefi).permit(msg.sender, address(this), amount_, deadline_, v_, r_, s_);

        tokenId_ = _lock(amount_, duration_, bonusMultiplier_, destination_);
    }

    function positionOf(uint256 tokenId_) external view returns (Position memory position_) {
        position_ = _positionOf[tokenId_];
    }

    function relock(
        uint256 tokenId_,
        uint256 lockAmount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_, uint256 newTokenId_) {
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

    function withdrawableOf(uint256 tokenId_) public view returns (uint256 withdrawableXDEFI_) {
        Position storage position = _positionOf[tokenId_];
        withdrawableXDEFI_ = _withdrawableGiven(position.units, position.depositedXDEFI, position.pointsCorrection);
    }

    /****************************/
    /* Batch Position Functions */
    /****************************/

    function relockBatch(
        uint256[] calldata tokenIds_,
        uint256 lockAmount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) external noReenter updatePointsPerUnitAtStart updateDistributableAtEnd returns (uint256 amountUnlocked_, uint256 newTokenId_) {
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

    function attributesOf(uint256 tokenId_)
        external
        view
        returns (
            uint256 tier_,
            uint256 credits_,
            uint256 withdrawable_,
            uint256 expiry_
        )
    {
        // Revert if the token does not exist.
        if (!_exists(tokenId_)) revert TokenDoesNotExist();

        credits_ = creditsOf[tokenId_];
        tier_ = getTier(credits_);
        withdrawable_ = withdrawableOf(tokenId_);
        expiry_ = _positionOf[tokenId_].expiry;
    }

    function consume(uint256 tokenId_, uint256 amount_) external returns (uint256 remainingCredits_) {
        // Revert if the caller is not the token's owner, not approved for all the owner's token, and not approved for this specific token.
        if (!_isApprovedOrOwner(msg.sender, tokenId_)) revert InvalidConsumePermit();

        // Consume some of the token's credits.
        remainingCredits_ = _consume(tokenId_, amount_, msg.sender);
    }

    function consumeWithPermit(
        uint256 tokenId_,
        uint256 amount_,
        uint256 limit_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external returns (uint256 remainingCredits_) {
        // Revert if the permit's deadline has been elapsed.
        if (block.timestamp >= deadline_) revert ConsumePermitExpired();

        // Revert if the amount being consumed is greater than the permit's defined limit.
        if (amount_ > limit_) revert BeyondConsumeLimit();

        // Hash the data as per keccak256("PermitConsume(uint256 tokenId,address consumer,uint256 limit,uint256 nonce,uint256 deadline)");
        bytes32 digest = keccak256(abi.encode(CONSUME_PERMIT_SIGNATURE_HASH, tokenId_, msg.sender, limit_, consumePermitNonce[tokenId_]++, deadline_));

        // Get the digest that was to be signed signed.
        digest = keccak256(abi.encodePacked(EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA, DOMAIN_SEPARATOR, digest));

        address recoveredAddress = ecrecover(digest, v_, r_, s_);

        // Revert if the account that signed the permit is not the token's owner, not approved for all the owner's token, and not approved for this specific token.
        if (!_isApprovedOrOwner(recoveredAddress, tokenId_)) revert InvalidConsumePermit();

        // Consume some of the token's credits.
        remainingCredits_ = _consume(tokenId_, amount_, msg.sender);
    }

    function contractURI() external view returns (string memory contractURI_) {
        contractURI_ = string(abi.encodePacked(baseURI, "info"));
    }

    function getCredits(uint256 amount_, uint256 duration_) public pure returns (uint256 credits_) {
        // Credits is implicitly capped at max supply of XDEFI for 10 years locked (less than 2**116).
        unchecked {
            credits_ = amount_ * duration_;
        }
    }

    function getTier(uint256 credits_) public pure returns (uint256 tier_) {
        if (credits_ < TIER_2_THRESHOLD) return TIER_1;

        if (credits_ < TIER_3_THRESHOLD) return TIER_2;

        if (credits_ < TIER_4_THRESHOLD) return TIER_3;

        if (credits_ < TIER_5_THRESHOLD) return TIER_4;

        if (credits_ < TIER_6_THRESHOLD) return TIER_5;

        if (credits_ < TIER_7_THRESHOLD) return TIER_6;

        if (credits_ < TIER_8_THRESHOLD) return TIER_7;

        if (credits_ < TIER_9_THRESHOLD) return TIER_8;

        if (credits_ < TIER_10_THRESHOLD) return TIER_9;

        if (credits_ < TIER_11_THRESHOLD) return TIER_10;

        if (credits_ < TIER_12_THRESHOLD) return TIER_11;

        if (credits_ < TIER_13_THRESHOLD) return TIER_12;

        return TIER_13;
    }

    function merge(uint256[] calldata tokenIds_) external returns (uint256 tokenId_, uint256 credits_) {
        // Revert if trying to merge 0 or 1 tokens, which cannot be done.
        if (tokenIds_.length <= ONE_UINT256) revert MustMergeMultiple();

        uint256 iterator = tokenIds_.length - 1;

        // For each NFT from last to second, check that it belongs to the caller, burn it, and accumulate the credits.
        while (iterator > ZERO_UINT256) {
            tokenId_ = tokenIds_[iterator];

            // Revert if the caller is not the token's owner, not approved for all the owner's token, and not approved for this specific token.
            if (!_isApprovedOrOwner(msg.sender, tokenId_)) revert NotApprovedOrOwnerOfToken();

            // Revert if position has an expiry property, which means it still exists.
            if (_positionOf[tokenId_].expiry != ZERO_UINT256) revert PositionStillLocked();

            unchecked {
                // Max credits of a previously locked position is `type(uint128).max`, so `credits_` is reasonably not going to overflow.
                credits_ += creditsOf[tokenId_];

                --iterator;
            }

            // Clear the credits for this token, and burn the token.
            delete creditsOf[tokenId_];
            _burn(tokenId_);
        }

        // The resulting token id is the first token.
        tokenId_ = tokenIds_[0];

        // The total credits merged into the first token is the sum of the first's plus the accumulation of the credits from burned tokens.
        credits_ = (creditsOf[tokenId_] += credits_);

        emit TokensMerged(tokenIds_, tokenId_, credits_);
    }

    function tokenURI(uint256 tokenId_) public view override(IXDEFIDistribution, ERC721) returns (string memory tokenURI_) {
        // Revert if the token does not exist.
        if (!_exists(tokenId_)) revert TokenDoesNotExist();

        tokenURI_ = string(abi.encodePacked(baseURI, Strings.toString(tokenId_)));
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    function _consume(
        uint256 tokenId_,
        uint256 amount_,
        address consumer_
    ) internal returns (uint256 remainingCredits_) {
        remainingCredits_ = creditsOf[tokenId_];

        // Revert if credits to decrement is greater than credits of nft.
        if (amount_ > remainingCredits_) revert InsufficientCredits();

        unchecked {
            // Can be unchecked due to check done above.
            creditsOf[tokenId_] = (remainingCredits_ -= amount_);
        }

        emit CreditsConsumed(tokenId_, consumer_, amount_);
    }

    function _createLockedPosition(
        uint256 amount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) internal returns (uint256 tokenId_) {
        // Revert is locking has been disabled.
        if (inEmergencyMode) revert LockingIsDisabled();

        uint256 bonusMultiplier = bonusMultiplierOf[duration_];

        // Revert if the bonus multiplier is zero.
        if (bonusMultiplier == ZERO_UINT256) revert InvalidDuration();

        // Revert if the bonus multiplier is not at least what was expected.
        if (bonusMultiplier < bonusMultiplier_) revert IncorrectBonusMultiplier();

        unchecked {
            // Generate a token id.
            tokenId_ = ++_tokensMinted;

            // Store credits.
            creditsOf[tokenId_] = getCredits(amount_, duration_);

            // Track deposits.
            totalDepositedXDEFI += amount_;

            // The rest creates the locked position.
            uint256 units = (amount_ * bonusMultiplier) / ONE_HUNDRED_UINT256;

            // Revert if position will end up with less than define minimum lockable units.
            if (units < MINIMUM_UNITS) revert LockResultsInTooFewUnits();

            totalUnits += units;

            _positionOf[tokenId_] = Position({
                units: uint96(units), // 240M * 1e18 * 255 can never be larger than a `uint96`.
                depositedXDEFI: uint88(amount_), // There are only 240M (18 decimals) XDEFI tokens so can never be larger than a `uint88`.
                expiry: uint32(block.timestamp + duration_), // For many years, block.timestamp + duration_ will never be larger than a `uint32`.
                created: uint32(block.timestamp), // For many years, block.timestamp will never be larger than a `uint32`.
                pointsCorrection: _pointsPerUnit * units // _pointsPerUnit * units cannot be greater than a `uint256`.
            });
        }

        emit LockPositionCreated(tokenId_, destination_, amount_, duration_);

        // Mint a locked staked position NFT to the destination.
        _safeMint(destination_, tokenId_);
    }

    function _destroyLockedPosition(address account_, uint256 tokenId_) internal returns (uint256 amountUnlocked_) {
        // Revert if account_ is not the token's owner, not approved for all the owner's token, and not approved for this specific token.
        if (!_isApprovedOrOwner(account_, tokenId_)) revert NotApprovedOrOwnerOfToken();

        // Fetch position.
        Position storage position = _positionOf[tokenId_];
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

        delete _positionOf[tokenId_];

        emit LockPositionWithdrawn(tokenId_, account_, amountUnlocked_);
    }

    function _lock(
        uint256 amount_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) internal returns (uint256 tokenId_) {
        // Lock the XDEFI in the contract. (Don't need SafeERC20 since XDEFI is standard ERC20).
        IERC20(xdefi).transferFrom(msg.sender, address(this), amount_);

        // Handle the lock position creation and get the tokenId of the locked position.
        tokenId_ = _createLockedPosition(amount_, duration_, bonusMultiplier_, destination_);
    }

    function _relock(
        uint256 lockAmount_,
        uint256 amountUnlocked_,
        uint256 duration_,
        uint256 bonusMultiplier_,
        address destination_
    ) internal returns (uint256 tokenId_) {
        // Throw convenient error if trying to re-lock more than was unlocked. `amountUnlocked_ - lockAmount_` cannot revert below now.
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
        for (uint256 i; i < tokenIds_.length; ) {
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

    function _withdrawableGiven(
        uint256 units_,
        uint256 depositedXDEFI_,
        uint256 pointsCorrection_
    ) internal view returns (uint256 withdrawableXDEFI_) {
        // NOTE: In a worst case (120k XDEFI locked at 2.55x bonus, 120k XDEFI reward, cycled 1 million times) `_pointsPerUnit * units_` is smaller than 2**248.
        //       Since `pointsCorrection_` is always less than `_pointsPerUnit * units_`, (because `_pointsPerUnit` only grows) there is no underflow on the subtraction.
        //       Finally, `depositedXDEFI_` is at most 88 bits, so after the division by a very large `POINTS_MULTIPLIER`, this doesn't need to be checked.
        unchecked {
            withdrawableXDEFI_ = (((_pointsPerUnit * units_) - pointsCorrection_) >> POINTS_MULTIPLIER_BITS) + depositedXDEFI_;
        }
    }
}
