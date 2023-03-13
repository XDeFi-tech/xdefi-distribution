// SPDX-License-Identifier: MIT

pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title XDEFI Vault - for vote-escrowed XDEFI (veXDEFI)
 * @author David P. (dp@xdefi.io)
 * @notice Unaudited experimental code. Do not use in production.
 */
contract XDEFIVault is ERC20, IERC4626, Ownable {
    using Math for uint256;

    IERC20 private immutable _asset;
    uint8 private immutable _underlyingDecimals;

    /**
     * @notice Emergency mode is a state where the contract is paused (can't mint/deposit) and the user can withdraw their funds.
     * The value is the timestamp at which the emergency mode was enabled.
     */
    uint256 public _emergencyModeTimestamp;

    modifier onlyNotEmergencyMode() {
        require(_emergencyModeTimestamp == 0, "XDEFIVault: in emergency mode");
        _;
    }

    /**
     * @dev This is a mapping of address to their respective unlock times.
     * The unlock time is the timestamp at which the user can withdraw their funds. (their veXDEFI are unlocked)
     * It is calculated by adding the lockup time to the current block timestamp.
     * The uint256 value is the unlock time timestamp in seconds.
     */
    mapping(address => uint256) public _addressUnlockTimesMap;

    /**
     * @dev This is a mapping of lockup time to the ratio of veXDEFI to XDEFI.
     * This can be used to calculate the amount of veXDEFI the user can get from their XDEFI.
     * As a key you can use any lockup time (in seconds) that is in the lockupTimesArray.
     * As a value uint256, it is the ratio of veXDEFI to XDEFI in basis points (1/100th of a percent).
     */
    mapping(uint256 => uint256) public _lockupTimesRatiosMap;
    uint256[] public _lockupTimesArray;
    /**
     * @dev This is the default lockup time (in seconds) that is used when the user does not specify a lockup time.
     */
    uint256 public defaultLockupTime;

    constructor(IERC20 asset_, uint256[] memory lockupTimes_, uint256[] memory lockupTimesRatios_) ERC20("vote-escrowed XDEFI", "veXDEFI") {
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(asset_);
        _underlyingDecimals = success ? assetDecimals : 18;
        _asset = asset_;

        _setLockupTimesRatios(lockupTimes_, lockupTimesRatios_);
    }

    /**
     * @dev Attempts to fetch the asset decimals. A return value of false indicates that the attempt failed in some way.
     */
    function _tryGetAssetDecimals(IERC20 asset_) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_).staticcall(abi.encodeWithSelector(IERC20Metadata.decimals.selector));
        if (success && encodedDecimals.length >= 32) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            if (returnedDecimals <= type(uint8).max) {
                return (true, uint8(returnedDecimals));
            }
        }
        return (false, 0);
    }

    /**
     * @dev Decimals are computed by adding the decimal offset on top of the underlying asset's decimals. This
     * "original" value is cached during construction of the vault contract. If this read operation fails (e.g., the
     * asset has not been created yet), a default of 18 is used to represent the underlying asset's decimals.
     *
     * See {IERC20Metadata-decimals}.
     */
    function decimals() public view virtual override(IERC20Metadata, ERC20) returns (uint8) {
        return _underlyingDecimals + _decimalsOffset();
    }

    /** @dev See {IERC4626-asset}. */
    function asset() public view virtual override returns (address) {
        return address(_asset);
    }

    /** @dev See {IERC4626-totalAssets}. */
    function totalAssets() public view virtual override returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    /** @dev See {IERC4626-convertToShares}. */
    function convertToShares(uint256 assets) public view virtual override returns (uint256) {
        return _convertToShares(assets, defaultLockupTime, Math.Rounding.Down);
    }

    /** @dev See {IERC4626-convertToAssets}. */
    function convertToAssets(uint256 shares) public view virtual override returns (uint256) {
        return _convertToAssets(shares, defaultLockupTime, Math.Rounding.Down);
    }

    /** @dev See {IERC4626-maxDeposit}. */
    function maxDeposit(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        return _convertToAssets(balanceOf(owner), defaultLockupTime, Math.Rounding.Down);
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(address owner) public view virtual override returns (uint256) {
        return balanceOf(owner);
    }

    /** @dev See {IERC4626-previewDeposit}. */
    function previewDeposit(uint256 assets) public view virtual override returns (uint256) {
        return _convertToShares(assets, defaultLockupTime, Math.Rounding.Down);
    }

    /** @dev See {IERC4626-previewMint}. */
    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        return _convertToAssets(shares, defaultLockupTime, Math.Rounding.Up);
    }

    /** @dev See {IERC4626-previewWithdraw}. */
    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        return _convertToShares(assets, defaultLockupTime, Math.Rounding.Up);
    }

    /** @dev See {IERC4626-previewRedeem}. */
    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        return _convertToAssets(shares, defaultLockupTime, Math.Rounding.Down);
    }

    /** @dev See {IERC4626-deposit}. */
    function deposit(uint256 assets, address receiver) public virtual override onlyNotEmergencyMode returns (uint256) {
        require(assets <= maxDeposit(receiver), "ERC4626: deposit more than max");

        uint256 shares = previewDeposit(assets);

        uint256 receiverDefaultTime = _addressUnlockTimesMap[receiver];

        // if the receiver has no lockup time, set it to now + default lockup time
        if (receiverDefaultTime == 0) {
            _addressUnlockTimesMap[receiver] = block.timestamp + defaultLockupTime;
        } else {
            // else he has a lockup time (existing position); extend the lockup time
            _addressUnlockTimesMap[receiver] = Math.max(receiverDefaultTime + defaultLockupTime, block.timestamp + defaultLockupTime);
        }
        _deposit(_msgSender(), receiver, assets, shares);
        return shares;
    }

    /** @dev See {IERC4626-mint}.
     *
     * As opposed to {deposit}, minting is allowed even if the vault is in a state where the price of a share is zero.
     * In this case, the shares will be minted without requiring any assets to be deposited.
     */
    function mint(uint256 shares, address receiver) public virtual override onlyNotEmergencyMode returns (uint256) {
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");

        uint256 assets = previewMint(shares);

        uint256 receiverDefaultTime = _addressUnlockTimesMap[receiver];
        // if the receiver has no lockup time, set it to now + default lockup time
        if (receiverDefaultTime == 0) {
            _addressUnlockTimesMap[receiver] = block.timestamp + defaultLockupTime;
        } else {
            // else he has a lockup time (existing position); extend the lockup time
            _addressUnlockTimesMap[receiver] = Math.max(receiverDefaultTime + defaultLockupTime, block.timestamp + defaultLockupTime);
        }
        _deposit(_msgSender(), receiver, assets, shares);

        return assets;
    }

    /** @dev See {IERC4626-withdraw}. */
    function withdraw(uint256 assets, address receiver, address owner) public virtual override returns (uint256) {
        require(assets <= maxWithdraw(owner), "ERC4626: withdraw more than max");

        uint256 shares = previewWithdraw(assets);

        require(_addressUnlockTimesMap[owner] <= block.timestamp, "XDEFIVault: lockup period not expired");
        _withdraw(_msgSender(), receiver, owner, assets, shares);
        // remove lockup period
        _addressUnlockTimesMap[owner] = 0;

        return shares;
    }

    /** @dev See {IERC4626-redeem}. */
    function redeem(uint256 shares, address receiver, address owner) public virtual override returns (uint256) {
        require(shares <= maxRedeem(owner), "ERC4626: redeem more than max");

        uint256 assets = previewRedeem(shares);

        require(_addressUnlockTimesMap[owner] <= block.timestamp, "XDEFIVault: lockup period not expired");
        _withdraw(_msgSender(), receiver, owner, assets, shares);

        // remove lockup period
        _addressUnlockTimesMap[owner] = 0;

        return assets;
    }

    /**
     * @dev Internal conversion function (from assets to shares) with support for rounding direction.
     */
    function _convertToShares(uint256 assets, uint256 lockupTime, Math.Rounding rounding) internal view virtual returns (uint256) {
        require(_lockupTimesRatiosMap[lockupTime] != 0, "XDEFIVault: invalid lockup time");
        uint256 ratio = _lockupTimesRatiosMap[lockupTime];
        return assets.mulDiv(ratio, 10000, rounding).mulDiv(totalSupply() + 10 ** _decimalsOffset(), totalAssets() + 1, rounding);
    }

    /**
     * @dev Internal conversion function (from shares to assets) with support for rounding direction.
     */
    function _convertToAssets(uint256 shares, uint256 lockupTime, Math.Rounding rounding) internal view virtual returns (uint256) {
        require(_lockupTimesRatiosMap[lockupTime] != 0, "XDEFIVault: invalid lockup time");
        uint256 ratio = _lockupTimesRatiosMap[lockupTime];
        return shares.mulDiv(10000, ratio, rounding).mulDiv(totalAssets() + 1, totalSupply() + 10 ** _decimalsOffset(), rounding);
    }

    /**
     * @dev Deposit/mint common workflow.
     */
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal virtual {
        // If _asset is ERC777, `transferFrom` can trigger a reentrancy BEFORE the transfer happens through the
        // `tokensToSend` hook. On the other hand, the `tokenReceived` hook, that is triggered after the transfer,
        // calls the vault, which is assumed not malicious.
        //
        // Conclusion: we need to do the transfer before we mint so that any reentrancy would happen before the
        // assets are transferred and before the shares are minted, which is a valid state.
        // slither-disable-next-line reentrancy-no-eth
        SafeERC20.safeTransferFrom(_asset, caller, address(this), assets);
        _mint(receiver, shares);

        emit Deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Withdraw/redeem common workflow.
     */
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal virtual {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        // If _asset is ERC777, `transfer` can trigger a reentrancy AFTER the transfer happens through the
        // `tokensReceived` hook. On the other hand, the `tokensToSend` hook, that is triggered before the transfer,
        // calls the vault, which is assumed not malicious.
        //
        // Conclusion: we need to do the transfer after the burn so that any reentrancy would happen after the
        // shares are burned and after the assets are transferred, which is a valid state.
        _burn(owner, shares);
        SafeERC20.safeTransfer(_asset, receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function _decimalsOffset() internal view virtual returns (uint8) {
        return 0;
    }

    /** @dev See {depositWithLockupTime}. */
    function depositWithLockupTime(uint256 assets, address receiver, uint256 lockupTime) public virtual onlyNotEmergencyMode returns (uint256) {
        require(assets <= maxDeposit(receiver), "ERC4626: deposit more than max");

        uint256 shares = previewDepositWithLockupTime(assets, lockupTime);

        uint256 receiverDefaultTime = _addressUnlockTimesMap[receiver];
        // if the receiver has no lockup time, set it to now + default lockup time
        if (receiverDefaultTime == 0) {
            _addressUnlockTimesMap[receiver] = block.timestamp + defaultLockupTime;
        } else {
            // else he has a lockup time (existing position); extend the lockup time
            _addressUnlockTimesMap[receiver] = Math.max(receiverDefaultTime + defaultLockupTime, block.timestamp + defaultLockupTime);
        }

        _deposit(_msgSender(), receiver, assets, shares);
        return shares;
    }

    /** @dev See {mintWithLockupTime}.
     *
     * As opposed to {deposit}, minting is allowed even if the vault is in a state where the price of a share is zero.
     * In this case, the shares will be minted without requiring any assets to be deposited.
     */
    function mintWithLockupTime(uint256 shares, address receiver, uint256 lockupTime) public virtual onlyNotEmergencyMode returns (uint256) {
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");

        uint256 assets = previewMintWithLockupTime(shares, lockupTime);

        uint256 receiverDefaultTime = _addressUnlockTimesMap[receiver];
        // if the receiver has no lockup time, set it to now + default lockup time
        if (receiverDefaultTime == 0) {
            _addressUnlockTimesMap[receiver] = block.timestamp + defaultLockupTime;
        } else {
            // else he has a lockup time (existing position); extend the lockup time
            _addressUnlockTimesMap[receiver] = Math.max(receiverDefaultTime + defaultLockupTime, block.timestamp + defaultLockupTime);
        }
        _deposit(_msgSender(), receiver, assets, shares);
        return assets;
    }

    /**
     * @dev Internal function to set lockup times
     */
    function _setLockupTimesRatios(uint256[] memory lockupTimes_, uint256[] memory lockupTimesRatios_) internal virtual {
        require(lockupTimes_.length == lockupTimesRatios_.length, "XDEFIVault: lockupTimes_ and lockupTimesRatios_ must be the same length");
        require(lockupTimes_.length > 0, "XDEFIVault: lockupTimes_ must be greater than 0");
        // Set the default lockup time to 0 year (in seconds).
        defaultLockupTime = lockupTimes_[0];
        for (uint256 i = 0; i < lockupTimes_.length; i++) {
            require(lockupTimes_[i] >= 0, "XDEFIVault: lockupTimes_ must be greater or equal to 0");
            require(lockupTimesRatios_[i] > 0, "XDEFIVault: lockupTimesRatios_ must be greater than 0");
            _lockupTimesArray.push(lockupTimes_[i]);
            _lockupTimesRatiosMap[lockupTimes_[i]] = lockupTimesRatios_[i];
        }
    }

    /**
     * @dev Sets the lockup times and ratios.
     * only the owner can call this function.
     */
    function setLockupTimesAndRatios(uint256[] memory lockupTimes_, uint256[] memory lockupTimesRatios_) public virtual onlyOwner {
        // Remove the old lockup times.
        for (uint256 i = 0; i < _lockupTimesArray.length; i++) {
            delete _lockupTimesRatiosMap[_lockupTimesArray[i]];
        }
        delete _lockupTimesArray;

        _setLockupTimesRatios(lockupTimes_, lockupTimesRatios_);
    }

    /**
     * @dev Sets the default lockup time.
     * only the owner can call this function.
     */
    function setDefaultLockupPeriod(uint256 lockupPeriod) public virtual onlyOwner {
        require(_lockupTimesRatiosMap[lockupPeriod] != 0, "XDEFIVault: invalid lockup time");
        defaultLockupTime = lockupPeriod;
    }

    /** @dev See {previewDepositWithLockupTime}. */
    function previewDepositWithLockupTime(uint256 assets, uint256 lockupTime) public view virtual returns (uint256) {
        return _convertToShares(assets, lockupTime, Math.Rounding.Down);
    }

    /** @dev See {previewDepositWithLockupTime}. */
    function previewMintWithLockupTime(uint256 shares, uint256 lockupTime) public view virtual returns (uint256) {
        return _convertToAssets(shares, lockupTime, Math.Rounding.Down);
    }

    /**
     * Set emergency mode, only the owner can call this function.
     * @param emergencyMode 0 = normal mode, >0 = emergency mode (timestamp given client-side)
     */
    function setEmergencyModeTimestamp(uint256 emergencyMode) public virtual onlyOwner {
        _emergencyModeTimestamp = emergencyMode;
    }
}
