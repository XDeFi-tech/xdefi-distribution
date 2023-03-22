// SPDX-License-Identifier: MIT

pragma solidity =0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import { IXDEFIDistributionHelper, IXDEFIDistributionLike } from "./interfaces/IXDEFIDistributionHelper.sol";

/// @dev Stateful helper contract for external clients to reduce web3 calls to gather XDEFIDistribution information related to individual accounts.
contract XDEFIDistributionHelper2 is Ownable {
    address public xdefiAddress;
    address public xdefiDistributionHelperAddress;

    constructor() {}

    function setConfig(address xdefiAddress_, address xdefiDistributionHelperAddress_) public onlyOwner {
        xdefiAddress = xdefiAddress_;
        xdefiDistributionHelperAddress = xdefiDistributionHelperAddress_;
    }

    function balanceOfStakedXDEFI(address account_) public view returns (uint256 totalStakedXDEFI) {
        IXDEFIDistributionLike.Position[] memory positions;

        (, positions, ) = IXDEFIDistributionHelper(xdefiDistributionHelperAddress).getAllLockedPositionsForAccount(xdefiAddress, account_);

        totalStakedXDEFI = 0;
        for (uint256 i; i < positions.length; ) {
            totalStakedXDEFI += uint256(positions[i].depositedXDEFI);

            unchecked {
                ++i;
            }
        }
    }
}
