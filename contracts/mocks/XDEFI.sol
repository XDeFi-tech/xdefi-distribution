// SPDX-License-Identifier: MIT

pragma solidity =0.8.18;

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint256 value);

    event Transfer(address indexed from, address indexed to, uint256 value);

    function allowance(address owner_, address spender_) external view returns (uint256 allowance_);

    function approve(address spender_, uint256 amount_) external returns (bool success_);

    function balanceOf(address account_) external view returns (uint256 balance_);

    function decimals() external view returns (uint8 decimals_);

    function name() external view returns (string memory name_);

    function permit(
        address owner_,
        address spender_,
        uint256 value_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external;

    function symbol() external view returns (string memory symbol_);

    function totalSupply() external view returns (uint256 totalSupply_);
}

abstract contract Context {
    function _msgData() internal view virtual returns (bytes memory msgData_) {
        this;
        msgData_ = msg.data;
    }

    function _msgSender() internal view virtual returns (address payable msgSender_) {
        msgSender_ = payable(msg.sender);
    }
}

contract ERC20 is IERC20, Context {
    bytes32 public DOMAIN_SEPARATOR;

    mapping(address => uint256) private _balances;
    mapping(address => uint256) public nonces;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;
    uint8 private _decimals;
    bool private _initialized;

    string private constant EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = "\x19\x01";
    bytes32 private constant PERMIT_SIGNATURE_HASH = bytes32(0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9);

    function _initERC20(string memory name_, string memory symbol_) internal {
        require(!_initialized, "ERC20: token has already been initialized!");

        _name = name_;
        _symbol = symbol_;
        _decimals = uint8(18);

        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), chainId, address(this)));

        _initialized = true;
    }

    function name() public view returns (string memory name_) {
        name_ = _name;
    }

    function symbol() public view returns (string memory symbol_) {
        symbol_ = _symbol;
    }

    function decimals() public view returns (uint8 decimals_) {
        decimals_ = _decimals;
    }

    function totalSupply() public view returns (uint256 totalSupply_) {
        totalSupply_ = _totalSupply;
    }

    function balanceOf(address account_) public view returns (uint256 balance_) {
        balance_ = _balances[account_];
    }

    function transfer(address recipient_, uint256 amount_) public virtual returns (bool success_) {
        _transfer(_msgSender(), recipient_, amount_);
        success_ = true;
    }

    function allowance(address owner_, address spender_) public view virtual returns (uint256 allowance_) {
        allowance_ = _allowances[owner_][spender_];
    }

    function approve(address spender_, uint256 amount_) public virtual returns (bool success_) {
        _approve(_msgSender(), spender_, amount_);
        success_ = true;
    }

    function permit(
        address owner_,
        address spender_,
        uint256 value_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external {
        require(owner_ != address(0), "ERC20: Owner cannot be 0");
        require(block.timestamp < deadline_, "ERC20: Expired");

        bytes32 digest = keccak256(abi.encodePacked(EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA, DOMAIN_SEPARATOR, keccak256(abi.encode(PERMIT_SIGNATURE_HASH, owner_, spender_, value_, nonces[owner_]++, deadline_))));

        address recoveredAddress = ecrecover(digest, v_, r_, s_);
        require(recoveredAddress == owner_, "ERC20: Invalid Signature");

        _approve(owner_, spender_, value_);
    }

    function transferFrom(
        address sender_,
        address recipient_,
        uint256 amount_
    ) public virtual returns (bool success_) {
        _transfer(sender_, recipient_, amount_);
        _approve(sender_, _msgSender(), _allowances[sender_][_msgSender()] - amount_);
        success_ = true;
    }

    function increaseAllowance(address spender_, uint256 addedValue_) public virtual returns (bool success_) {
        _approve(_msgSender(), spender_, _allowances[_msgSender()][spender_] + addedValue_);
        success_ = true;
    }

    function decreaseAllowance(address spender_, uint256 subtractedValue_) public virtual returns (bool success_) {
        _approve(_msgSender(), spender_, _allowances[_msgSender()][spender_] - subtractedValue_);
        success_ = true;
    }

    function _transfer(
        address sender_,
        address recipient_,
        uint256 amount_
    ) internal virtual {
        require(sender_ != address(0), "ERC20: transfer from the zero address");
        require(recipient_ != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender_, recipient_, amount_);

        _balances[sender_] -= amount_;
        _balances[recipient_] += amount_;

        emit Transfer(sender_, recipient_, amount_);
    }

    function _mint(address account_, uint256 amount_) internal virtual {
        require(account_ != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account_, amount_);

        _totalSupply += amount_;
        _balances[account_] += amount_;

        emit Transfer(address(0), account_, amount_);
    }

    function _burn(address account_, uint256 amount_) internal virtual {
        require(account_ != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account_, address(0), amount_);

        _balances[account_] -= amount_;
        _totalSupply -= amount_;

        emit Transfer(account_, address(0), amount_);
    }

    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal virtual {
        require(owner_ != address(0), "ERC20: approve from the zero address");
        require(spender_ != address(0), "ERC20: approve to the zero address");

        emit Approval(owner_, spender_, _allowances[owner_][spender_] = amount_);
    }

    function _setupDecimals(uint8 decimals_) internal {
        _decimals = decimals_;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}
}

contract XDEFI is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_
    ) {
        _initERC20(name_, symbol_);
        _mint(msg.sender, initialSupply_);
    }
}
