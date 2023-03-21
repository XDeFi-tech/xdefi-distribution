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
    let vToken;
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

        const data = await buildData(vToken, deadline);
        const sigRpc = ethSigUtil.signTypedMessage(Uint8Array.from(Buffer.from(owner.privateKey.substring(2), 'hex')), { data });
        const { v, r, s } = fromRpcSig(sigRpc);

        return { v, r, s };
    };

    beforeEach(async function () {
        [owner, alice, account1, account2, account3] = await ethers.getSigners();
        XDEFI = await (await (await ethers.getContractFactory('XDEFI')).deploy('XDEFI', 'XDEFI', totalSupply)).deployed();
        XDEFIVault = await ethers.getContractFactory('XDEFIVault');
        vToken = await XDEFIVault.connect(owner).deploy(XDEFI.address);
        XDEFIVault = await vToken.deployed();
        vTokenAlice = await XDEFIVault.connect(alice);
        xdefiDomainSeparator = await XDEFI.DOMAIN_SEPARATOR();

        // Give each account 1000 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
        await (await XDEFI.transfer(wallet.address, toWei(1000))).wait();
        await (await XDEFI.transfer(alice.address, toWei(1000))).wait();

        await XDEFI.connect(owner).approve(vToken.address, totalSupply);
        await vToken.connect(owner).deposit(toWei(2000), owner.address);

        expect(await vToken.balanceOf(owner.address)).to.equal(toWei(2000));

        // Give 100 Ether to `accountWithPrivateKey`
        await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther('100') });
    });

    it('should have correct name and symbol', async function () {
        expect(await vToken.name()).to.equal('vXDEFI');
        expect(await vToken.symbol()).to.equal('vXDEFI');
    });

    it('should allow vToken holders to approve a transfer using permit', async function () {
        const amount = 100;
        await (await XDEFI.transfer(wallet.address, toWei(1000))).wait();
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await vToken.nonces(wallet.address);
        const { v, r, s } = await createErc20PermitSignature(wallet, vToken.address, amount, nonce, deadline);
        // console.log({ v, r, s });
        await (await XDEFIVault.connect(account3)).permit(wallet.address, vToken.address, amount, deadline, v, r, s);
        expect(await vToken.allowance(wallet.address, vToken.address)).to.equal(amount);
    });
});
