// SPDX-License-Identifier: MIT

pragma solidity =0.8.10;

import { IXDEFIDistribution } from "../interfaces/IXDEFIDistribution.sol";

interface IERC721Receiver {

    function onERC721Received(address operator_, address from_, uint256 tokenId_, bytes calldata data_) external returns (bytes4 selector_);

}

contract ReceiverCallingUpdateDistribution is IERC721Receiver {

    function onERC721Received(address, address, uint256, bytes memory) public returns (bytes4 selector_) {
        IXDEFIDistribution(msg.sender).updateDistribution();

        return this.onERC721Received.selector;
    }

    function unlock(address xdefiDistribution_, uint256 tokenId_, address destination_) external {
        IXDEFIDistribution(xdefiDistribution_).unlock(tokenId_, destination_);
    }

}
