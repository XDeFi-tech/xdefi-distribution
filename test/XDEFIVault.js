const { expect } = require('chai');
const { fromRpcSig } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1_000_000_000_000_000_000n + BigInt(add) - BigInt(sub)).toString();

const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
];

function domainType(domain) {
    return EIP712Domain.filter(({ name }) => domain[name] !== undefined);
}

async function getDomain(contract) {
    const { fields, name, version, chainId, verifyingContract, salt, extensions } = await contract.eip712Domain();

    if (extensions.length > 0) {
        throw Error('Extensions not implemented');
    }

    const domain = { name, version, chainId, verifyingContract, salt };
    for (const [i, { name }] of EIP712Domain.entries()) {
        if (!(fields & (1 << i))) {
            delete domain[name];
        }
    }

    return domain;
}

const Permit = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
];

describe('XDEFIVault', function () {
    let XDEFI;
    let XDEFIVault;
    let xdefiVault;
    let owner;
    let alice;
    let account1;
    let account2;
    let account3;
    let xdefiDomainSeparator;
    const totalSupply = toWei(100000000);

    const maxDeadline = Number.MAX_SAFE_INTEGER;
    const EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = '\x19\x01';
    const ERC20_PERMIT_SIGNATURE_HASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9';
    const CONSUME_PERMIT_SIGNATURE_HASH = '0xa0a7128942405265cd830695cb06df90c6bfdbbe22677cc592c3d36c3180b079';
    const privateKey = '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5';
    const wallet = new ethers.Wallet(privateKey, ethers.provider);
    wallet.privateKey = privateKey;

    const createErc20PermitSignature = async (owner, spender, amount, nonce, deadline) => {
        const buildData = async (contract, deadline = maxDeadline) => {
            const domain = await getDomain(contract);
            return {
                primaryType: 'Permit',
                types: { EIP712Domain: domainType(domain), Permit },
                domain: {
                    ...domain,
                    chainId: domain.chainId.toNumber(),
                },
                message: { owner: owner.address, spender, value: amount.toString(), nonce: nonce.toNumber(), deadline },
            };
        };

        const data = await buildData(xdefiVault, deadline);
        const sigRpc = ethSigUtil.signTypedMessage(Uint8Array.from(Buffer.from(owner.privateKey.substring(2), 'hex')), { data });
        const { v, r, s } = fromRpcSig(sigRpc);

        return { v, r, s };
    };

    beforeEach(async function () {
        [owner, alice, account1, account2, account3] = await ethers.getSigners();
        XDEFI = await (await (await ethers.getContractFactory('XDEFI')).deploy('XDEFI', 'XDEFI', totalSupply)).deployed();
        XDEFIVault = await ethers.getContractFactory('XDEFIVault');
        xdefiVault = await XDEFIVault.connect(owner).deploy(XDEFI.address);
        XDEFIVault = await xdefiVault.deployed();
        xdefiVaultAlice = await XDEFIVault.connect(alice);
        xdefiDomainSeparator = await XDEFI.DOMAIN_SEPARATOR();

        // Give each account 1000 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
        await (await XDEFI.transfer(wallet.address, toWei(1000))).wait();
        await (await XDEFI.transfer(alice.address, toWei(1000))).wait();

        await XDEFI.connect(owner).approve(xdefiVault.address, totalSupply);
        await xdefiVault.connect(owner).deposit(toWei(2000), owner.address);

        expect(await xdefiVault.balanceOf(owner.address)).to.equal(toWei(2000));

        // Give 100 Ether to `accountWithPrivateKey`
        await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther('100') });
    });

    it('should have correct name and symbol', async function () {
        expect(await xdefiVault.name()).to.equal('vXDEFI');
        expect(await xdefiVault.symbol()).to.equal('vXDEFI');
    });

    it('should have correct decimals', async function () {
        expect(await xdefiVault.decimals()).to.equal(18);
    });

    it('should return correct EIP-712 domain', async function () {
        const [fields, name, version, chainId, verifyingContract, salt, extensions] = await xdefiVault.eip712Domain();

        expect(fields).to.equal('0x0f');
        expect(name).to.equal('vXDEFI');
        expect(version).to.equal('1');
        expect(chainId).to.equal(await owner.getChainId());
        expect(verifyingContract).to.equal(xdefiVault.address);
        expect(salt).to.not.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
        expect(extensions.length).to.equal(0);
    });

    it('should allow xdefiVault holders to approve a transfer using permit', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now()) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await (await XDEFIVault.connect(account3)).permit(wallet.address, xdefiVault.address, amount, deadline, v, r, s);
        const nonce1 = await xdefiVault.nonces(wallet.address);
        expect(nonce1).to.equal(nonce.add(1));
        expect(await xdefiVault.allowance(wallet.address, xdefiVault.address)).to.equal(amount);
    });
    it('should reject other signatures', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now()) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await expect(xdefiVault.permit(account3.address, xdefiVault.address, amount, deadline, v, r, s)).to.be.revertedWith(
            'ERC20Permit: invalid signature'
        );
    });
    it('should reject revert used signatures', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now()) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await (await XDEFIVault.connect(account3)).permit(wallet.address, xdefiVault.address, amount, deadline, v, r, s);
        const nonce1 = await xdefiVault.nonces(wallet.address);
        expect(nonce1).to.equal(nonce.add(1));
        expect(await xdefiVault.allowance(wallet.address, xdefiVault.address)).to.equal(amount);

        // re-use signature attempt...

        await expect(xdefiVault.permit(wallet.address, xdefiVault.address, amount, deadline, v, r, s)).to.be.revertedWith(
            'ERC20Permit: invalid signature'
        );
    });
    it('should reject expired permit', async function () {
        const deadline = 123;
        const nonce = await xdefiVault.nonces(wallet.address);
        const value = ethers.utils.parseUnits('50', 18);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, value, nonce, deadline);

        await expect(xdefiVault.permit(wallet.address, xdefiVault.address, value, deadline, v, r, s)).to.be.revertedWith(
            'ERC20Permit: expired deadline'
        );
    });
    it('should increase nonce after permit', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now()) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await (await XDEFIVault.connect(account3)).permit(wallet.address, xdefiVault.address, amount, deadline, v, r, s);
        const nonce1 = await xdefiVault.nonces(wallet.address);
        expect(nonce1).to.equal(nonce.add(1));
        const amount2 = 1000;
        const { v: v1, r: r1, s: s1 } = await createErc20PermitSignature(wallet, xdefiVault.address, amount2, nonce1, deadline);
        await (await XDEFIVault.connect(account3)).permit(wallet.address, xdefiVault.address, amount2, deadline, v1, r1, s1);
        const nonce2 = await xdefiVault.nonces(wallet.address);
        expect(nonce2).to.equal(nonce1.add(1));
        expect(await xdefiVault.allowance(wallet.address, xdefiVault.address)).to.equal(amount2);
    });

    it('should allow increaseAllowance', async function () {
        const amount = 100;
        await (await xdefiVault.increaseAllowance(wallet.address, amount)).wait();
        expect(await xdefiVault.allowance(owner.address, wallet.address)).to.equal(amount);
        await (await xdefiVault.increaseAllowance(wallet.address, amount)).wait();
        expect(await xdefiVault.allowance(owner.address, wallet.address)).to.equal(2 * amount);
    });

    it('should allow decreaseAllowance', async function () {
        const amount = 100;
        await (await xdefiVault.increaseAllowance(wallet.address, amount)).wait();
        expect(await xdefiVault.allowance(owner.address, wallet.address)).to.equal(amount);
        await (await xdefiVault.decreaseAllowance(wallet.address, amount)).wait();
        expect(await xdefiVault.allowance(owner.address, wallet.address)).to.equal(0);
    });

    it('should get correct underlying asset address', async function () {
        expect(await xdefiVault.asset()).to.equal(XDEFI.address);
    });

    it('should deposit and receive shares', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        // Check the balance of account1 in the ERC4626 contract
        const shareBalance = await xdefiVault.balanceOf(account1.address);
        expect(shareBalance).to.not.equal(0);
    });

    it('should withdraw underlying assets and burn shares', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        // Get the share balance of account1 in the ERC4626 contract
        const initialShareBalance = await xdefiVault.balanceOf(account1.address);

        // Withdraw underlying assets and burn shares
        const withdrawAmount = ethers.utils.parseUnits('50', 18);
        await xdefiVault.connect(account1).withdraw(withdrawAmount, account1.address, account1.address);

        // Check the updated balance of account1 in the ERC4626 contract
        const finalShareBalance = await xdefiVault.balanceOf(account1.address);
        expect(finalShareBalance).to.be.lt(initialShareBalance);
    });

    it('mint', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Mint 100 shares for account1
        const mintAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).mint(mintAmount, account1.address);

        // Check the balance of account1 in the ERC4626 contract
        const shareBalance = await xdefiVault.balanceOf(account1.address);
        expect(shareBalance).to.equal(mintAmount);
    });

    it('deposit', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        // Check the balance of account1 in the ERC4626 contract
        const shareBalance = await xdefiVault.balanceOf(account1.address);
        expect(shareBalance).to.not.equal(0);
    });

    it('withdraw', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        // Get the share balance of account1 in the ERC4626 contract
        const initialShareBalance = await xdefiVault.balanceOf(account1.address);

        // Withdraw underlying assets and burn shares
        const withdrawAmount = ethers.utils.parseUnits('50', 18);
        await xdefiVault.connect(account1).withdraw(withdrawAmount, account1.address, account1.address);

        // Check the updated balance of account1 in the ERC4626 contract
        const finalShareBalance = await xdefiVault.balanceOf(account1.address);
        expect(finalShareBalance).to.be.lt(initialShareBalance);
    });

    it('redeem', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        // Get the initial share balance of account1 in the ERC4626 contract
        const initialShareBalance = await xdefiVault.balanceOf(account1.address);

        // Redeem 50 shares for account1
        const redeemAmount = ethers.utils.parseUnits('50', 18);
        await xdefiVault.connect(account1).redeem(redeemAmount, account1.address, account1.address);

        // Check the updated balance of account1 in the ERC4626 contract
        const finalShareBalance = await xdefiVault.balanceOf(account1.address);
        expect(finalShareBalance).to.be.lt(initialShareBalance);
    });

    it('transfer', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);

        //start
        const sender = account1;
        const receiver = account2;

        const initialSenderBalance = await xdefiVault.balanceOf(sender.address);
        const initialReceiverBalance = await xdefiVault.balanceOf(receiver.address);
        const transferAmount = ethers.utils.parseEther('1');

        // Transfer tokens from the sender to the receiver using transfer
        await xdefiVault.connect(sender).transfer(receiver.address, transferAmount);

        const finalSenderBalance = await xdefiVault.balanceOf(sender.address);
        const finalReceiverBalance = await xdefiVault.balanceOf(receiver.address);

        expect(finalSenderBalance).to.equal(initialSenderBalance.sub(transferAmount));
        expect(finalReceiverBalance).to.equal(initialReceiverBalance.add(transferAmount));
    });
    it('transferFrom', async function () {
        // Transfer 1000 underlying tokens to account1
        await XDEFI.transfer(account1.address, ethers.utils.parseUnits('1000', 18));

        // Approve the ERC4626 contract to spend underlying tokens on behalf of account1
        await XDEFI.connect(account1).approve(xdefiVault.address, ethers.utils.parseUnits('1000', 18));

        // Deposit 100 underlying tokens and receive shares
        const depositAmount = ethers.utils.parseUnits('100', 18);
        await xdefiVault.connect(account1).deposit(depositAmount, account1.address);
        const sender = account1;
        const receiver = account2;
        const spender = account3;
        const transferAmount = ethers.utils.parseEther('2');
        const initialSenderBalance = await xdefiVault.balanceOf(sender.address);
        const initialReceiverBalance = await xdefiVault.balanceOf(receiver.address);

        // Approve the spender to transfer tokens from the sender
        await xdefiVault.connect(sender).approve(spender.address, transferAmount);

        // Transfer tokens from the sender to the receiver using transferFrom
        await xdefiVault.connect(spender).transferFrom(sender.address, receiver.address, transferAmount);

        const finalSenderBalance = await xdefiVault.balanceOf(sender.address);
        const finalReceiverBalance = await xdefiVault.balanceOf(receiver.address);

        expect(finalSenderBalance).to.equal(initialSenderBalance.sub(transferAmount));
        expect(finalReceiverBalance).to.equal(initialReceiverBalance.add(transferAmount));
    });

    it('withdraw with approval', async function () {
        const sender = account1;
        const receiver = account2;
        const spender = account3;

        const depositAmount = ethers.utils.parseEther('10');
        await XDEFI.connect(sender).approve(xdefiVault.address, depositAmount);
        await xdefiVault.connect(sender).deposit(depositAmount, sender.address);

        const initialSenderShares = await xdefiVault.balanceOf(sender.address);
        const initialReceiverAssets = await XDEFI.balanceOf(receiver.address);

        // Approve the spender to redeem tokens from the sender
        await xdefiVault.connect(sender).approve(spender.address, initialSenderShares);

        // Withdraw assets using withdraw function with approval
        const assetsToWithdraw = await xdefiVault.previewRedeem(initialSenderShares);
        await xdefiVault.connect(spender).withdraw(assetsToWithdraw, receiver.address, sender.address);

        const finalSenderShares = await xdefiVault.balanceOf(sender.address);
        const finalReceiverAssets = await XDEFI.balanceOf(receiver.address);

        expect(finalSenderShares).to.equal(0);
        expect(finalReceiverAssets).to.equal(initialReceiverAssets.add(assetsToWithdraw));
    });
});
