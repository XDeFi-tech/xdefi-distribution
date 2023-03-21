// SPDX-License-Identifier: MIT

pragma solidity =0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title XDEFI Vault - for vote-escrowed XDEFI (veXDEFI)
 * @author David P. (dp@xdefi.io)
 * @notice Unaudited experimental code. Do not use in production.
 */
contract XDEFIVault is ERC4626, ERC20Permit {
    constructor(address underlying) ERC20("vXDEFI", "vXDEFI") ERC4626(IERC20(underlying)) ERC20Permit("vXDEFI") {}

    function decimals() public view virtual override(ERC20, ERC4626) returns (uint8) {
        return ERC4626.decimals();
    }

    /**
     * @dev See {EIP-5267}.
     */
    function eip712Domain() public view virtual returns (bytes1 fields, string memory name, string memory version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] memory extensions) {
        return (
            hex"0f", // 01111
            "vXDEFI",
            "1",
            block.chainid,
            address(this),
            bytes32(0),
            new uint256[](0)
        );
    }
}
