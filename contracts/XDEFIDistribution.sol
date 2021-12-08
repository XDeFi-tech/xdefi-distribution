//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract XDEFIDistribution {

    event XDEFIDistributed(address indexed caller, uint256 amount);
    event XDEFIWithdrawn(address indexed account, uint256 amount);
    event XDEFIDeposited(address indexed account, uint256 amount);

    struct Position {
        uint96 units;  // 240000000000000000000000000 XDEFI * 100x bonus (which fits in a uint96)
        int256 pointsCorrection;
        uint88 depositedXDEFI; // XDEFI cap is 240000000000000000000000000 (which fits in a uint88)
        uint32 expiry;  // block timestamps for the next 32 years (which fits in a uint32)
    }

    // optimize, see https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
    uint256 constant internal _pointsMultiplier = uint256(2**128);
    uint256 internal _pointsPerUnit;

    address public XDEFI;

    uint256 public distributableXDEFI;
    uint256 public totalDepositedXDEFI;
    uint256 public totalUnits;

    mapping(address => Position) public positionOf;

    mapping(uint256 => uint256) public bonusMultiplierOf;  // Scaled by 100, so 1.1 is 110.

    constructor (address XDEFI_) {
        require((XDEFI = XDEFI_) != address(0), "INVALID_FUNDS_TOKEN_ADDRESS");
    }

    function addLockPeriods(uint256[] memory durations_, uint256[] memory multipliers) external {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            bonusMultiplierOf[durations_[i]] = multipliers[i];
        }
    }

    function deleteLockPeriods(uint256[] memory durations_) external {
        uint256 count = durations_.length;

        for (uint256 i; i < count; ++i) {
            delete bonusMultiplierOf[durations_[i]];
        }
    }

    function withdrawableXDEFIOf(address account_) public view returns(uint256 withdrawableXDEFI_) {
        Position storage position = positionOf[account_];
        return _withdrawableXDEFIOf(position.units, position.pointsCorrection, position.depositedXDEFI);
    }

    function _withdrawableXDEFIOf(uint96 units_, int256 pointsCorrection_, uint88 depositedXDEFI_) internal view returns(uint256 withdrawableXDEFI_) {
        return
            (
                _toUint256Safe(
                    _toInt256Safe(_pointsPerUnit * uint256(units_)) +
                    pointsCorrection_
                ) / _pointsMultiplier
            ) + uint256(depositedXDEFI_);
    }

    function withdrawXDEFI() external {
        Position storage position = positionOf[msg.sender];
        uint96 units = position.units;
        uint88 depositedXDEFI = position.depositedXDEFI;

        uint256 withdrawableXDEFI = _withdrawableXDEFIOf(units, position.pointsCorrection, depositedXDEFI);

        emit XDEFIWithdrawn(msg.sender, withdrawableXDEFI);

        require(IERC20(XDEFI).transfer(msg.sender, withdrawableXDEFI), "TRANSFER_FAILED");

        // Track deposits
        totalDepositedXDEFI -= uint256(depositedXDEFI);

        // NOTE: This needs to be done after updating totalDepositedXDEFI
        _updateXDEFIBalance();

        // Burn FDT Position
        totalUnits -= units;
        delete positionOf[msg.sender];
    }

    function depositXDEFI(uint256 amount_, uint256 duration_) external {
        uint256 bonusMultiplier = bonusMultiplierOf[duration_];
        require(bonusMultiplier != uint256(0));

        emit XDEFIDeposited(msg.sender, amount_);

        require(IERC20(XDEFI).transferFrom(msg.sender, address(this), amount_), "TRANSFER_FROM_FAILED");

        uint96 units = uint96((amount_ * bonusMultiplier) / uint256(100));

        // Track deposits
        totalDepositedXDEFI += amount_;

        // Mint FDT Position
        totalUnits += units;
        positionOf[msg.sender] =
            Position({
                pointsCorrection: -_toInt256Safe(_pointsPerUnit * units),
                depositedXDEFI: uint88(amount_),
                units: units,
                expiry: uint32(0)
            });
    }

    function updateFundsReceived() external {
        uint256 newXDEFI = _toUint256Safe(_updateXDEFIBalance());

        // if (newXDEFI <= int256(0)) return;

        require(totalUnits > uint256(0), "NO_UNIT_SUPPLY");

        if (newXDEFI == uint256(0)) return;

        _pointsPerUnit += ((newXDEFI * _pointsMultiplier) / totalUnits);

        emit XDEFIDistributed(msg.sender, newXDEFI);
    }

    function _updateXDEFIBalance() internal returns (int256 newFundsTokenBalance_) {
        uint256 previousDistributableXDEFI = distributableXDEFI;
        distributableXDEFI = IERC20(XDEFI).balanceOf(address(this)) - totalDepositedXDEFI;

        return _toInt256Safe(distributableXDEFI) - _toInt256Safe(previousDistributableXDEFI);
    }

    function _toUint256Safe(int256 x_) internal pure returns (uint256 y_) {
        require(x_ >= int256(0));
        return uint256(x_);
    }

    function _toInt256Safe(uint256 x_) internal pure returns (int256 y_) {
        y_ = int256(x_);
        require(y_ >= int256(0));
    }

}
