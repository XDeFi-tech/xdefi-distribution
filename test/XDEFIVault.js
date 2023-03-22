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
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await (await XDEFIVault.connect(account3)).permit(wallet.address, xdefiVault.address, amount, deadline, v, r, s);
        const nonce1 = await xdefiVault.nonces(wallet.address);
        expect(nonce1).to.equal(nonce.add(1));
        expect(await xdefiVault.allowance(wallet.address, xdefiVault.address)).to.equal(amount);
    });
    it('should reject other signatures', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await xdefiVault.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, amount, nonce, deadline);
        await expect(xdefiVault.permit(account3.address, xdefiVault.address, amount, deadline, v, r, s)).to.be.revertedWith(
            'ERC20Permit: invalid signature'
        );
    });
    it('should reject revert used signatures', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
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
        const deadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
        const nonce = await xdefiVault.nonces(wallet.address);
        const value = ethers.utils.parseUnits('50', 18);
        const { v, r, s } = await createErc20PermitSignature(wallet, xdefiVault.address, value, nonce, deadline);

        await expect(xdefiVault.permit(wallet.address, xdefiVault.address, value, deadline, v, r, s)).to.be.revertedWith(
            'ERC20Permit: expired deadline'
        );
    });
    it('should increase nonce after permit', async function () {
        const amount = 100;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
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

    it('mint', async function () {});
    it('deposit', async function () {});
    it('withdraw', async function () {});
    it('redeem', async function () {});
    it('transfer', async function () {});
    it('transferFrom', async function () {});
    it('withdraw with approval', async function () {});
});
