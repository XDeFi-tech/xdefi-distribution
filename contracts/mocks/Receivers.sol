// SPDX-License-Identifier: MIT

pragma solidity =0.8.10;

import { IXDEFIDistribution } from "../interfaces/IXDEFIDistribution.sol";

interface IERC721Receiver {

    function onERC721Received(address operator_, address from_, uint256 tokenId_, bytes calldata data_) external returns (bytes4 selector_);

}

