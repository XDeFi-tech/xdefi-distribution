const { expect } = require('chai');
const { ethers } = require('hardhat');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_UINT256 = 2n ** 256n - 1n;

const totalSupply = '240000000000000000000000000';

const EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = '\x19\x01';
const PERMIT_SIGNATURE_HASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9';

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1_000_000_000_000_000_000n + BigInt(add) - BigInt(sub)).toString();

describe('XDEFIDistribution', () => {
    const maxDeadline = MAX_UINT256.toString();

    const durations = [1, 86400, 172800];
    const bonusMultipliers = [100, 120, 150];

    const privateKey = '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5';
    const wallet = new ethers.Wallet(privateKey, ethers.provider);
    wallet.privateKey = privateKey;

    let XDEFI;
    let XDEFIDistribution;
    let god;
    let account1;
    let account2;
    let account3;
    let domainSeparator;

    const createPermitSignature = (owner, spender, amount, nonce, deadline) => {
        const subData = ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_SIGNATURE_HASH, owner.address, spender, amount, nonce, deadline]
        );

        const subDataDigest = ethers.utils.keccak256(subData);

        const dataDigest = ethers.utils.solidityKeccak256(
            ['string', 'bytes32', 'bytes32'],
            [EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA, domainSeparator, subDataDigest]
        );

        const signingKey = new ethers.utils.SigningKey(owner.privateKey);

        return signingKey.signDigest(dataDigest);
    };

    const getMostRecentNFT = async (account) => {
        const balance = BigInt(await XDEFIDistribution.balanceOf(account.address));

        return (await XDEFIDistribution.tokenOfOwnerByIndex(account.address, (balance - 1n).toString())).toString();
    };

    const lock = async (account, amount, duration, bonusMultiplier, destination = account) => {
        await (await XDEFI.connect(account).approve(XDEFIDistribution.address, amount)).wait();
        await (await XDEFIDistribution.connect(account).lock(amount, duration, bonusMultiplier, destination.address)).wait();

        return getMostRecentNFT(destination);
    };

    const lockWithPermit = async (wallet, amount, duration, bonusMultiplier, destination = wallet, nonce, deadline) => {
        const { v, r, s } = createPermitSignature(wallet, XDEFIDistribution.address, amount, nonce, deadline);

        await (await XDEFI.connect(wallet).approve(XDEFIDistribution.address, amount)).wait();
        await (
            await XDEFIDistribution.connect(wallet).lockWithPermit(
                amount,
                duration,
                bonusMultiplier,
                destination.address,
                deadline,
                v,
                r,
                s
            )
        ).wait();

        return getMostRecentNFT(destination);
    };

    const relock = async (account, nft, amount, duration, bonusMultiplier, destination = account) => {
        await (await XDEFIDistribution.connect(account).relock(nft, amount, duration, bonusMultiplier, destination.address)).wait();

        return getMostRecentNFT(destination);
    };

    const batchRelock = async (account, nfts, amount, duration, bonusMultiplier, destination = account) => {
        await (await XDEFIDistribution.connect(account1).relockBatch(nfts, amount, duration, bonusMultiplier, destination.address)).wait();

        return getMostRecentNFT(destination);
    };

    beforeEach(async () => {
        [god, account1, account2, account3] = await ethers.getSigners();

        XDEFI = await (await (await ethers.getContractFactory('XDEFI')).deploy('XDEFI', 'XDEFI', totalSupply)).deployed();
        XDEFIDistribution = await (
            await (await ethers.getContractFactory('XDEFIDistribution')).deploy(XDEFI.address, 'https://www.xdefi.io/nfts/')
        ).deployed();

        // Setup some bonus multipliers (0 days with 1x, 1 day with 1.2x, 2 days with 1.5x)
        await (await XDEFIDistribution.setLockPeriods(durations, bonusMultipliers)).wait();

        // Give each account 100 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
        await (await XDEFI.transfer(wallet.address, toWei(1000))).wait();

        // Give 100 Ether to `accountWithPrivateKey`
        await god.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther('100') });

        // Get Domain Separator from contract
        domainSeparator = await XDEFI.DOMAIN_SEPARATOR();
    });

    it('Can enter and exit deposited amounts with no distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(1000));

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(1000));

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(1000));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(3000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1000));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 2 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
    });

    it('Can enter and exit deposited amounts with no distributions (varied bonuses)', async () => {
        // Position 1 locks (no bonus)
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(1000));

        // Position 2 locks (1.2x bonus)
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(1200));

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(1500));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(3000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3700));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1000));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 2 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[1]]);
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2] - durations[1]]);
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
    });

    it('Can enter and exit staggered portions of distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Second distribution (should split between position 1 and position 2)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1350, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1150, 0, 1));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1350, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);

        // Third distribution (should split between position 2 and position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(500))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1400, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1250, 0, 0));

        // Position 2 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1400, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Fourth distribution (should all be for position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1650, 0, 1));

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1650, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });

    it('Can enter and exit staggered portions of distributions (no bonuses, never calling updateDistribution)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Second distribution (should split between position 1 and position 2)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1350, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);

        // Third distribution (should split between position 2 and position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(500))).wait();

        // Position 2 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1400, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Fourth distribution (should all be for position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1650, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });

    it('Can enter and exit portions of distributions consecutively (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(900))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1300, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1300, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1300, 0, 1));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1300, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1300, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1300, 0, 1));

        // Position 2 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1300, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1300, 0, 1));

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1300, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });

    it('Can enter and exit staggered of distributions (varied bonuses)', async () => {
        // Position 1 locks (no bonus)
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Position 2 locks (1.2x bonus)
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);

        // Second distribution (should split between position 1 and position 2, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1336, '363636363636363636', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1163, '636363636363636363', 0));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1336, '363636363636363636', 0));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 3 locks (1.5x bonus)
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);

        // Third distribution (should split between position 2 and position 3, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(500))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1385, '858585858585858585', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1277, '777777777777777777', 0));

        // Position 2 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[1]]);
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1385, '858585858585858585', 0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Fourth distribution (should all be for position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1677, '777777777777777777', 0));

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2] - durations[1]]);
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1677, '777777777777777777', 0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });

    it('Can enter and exit staggered of distributions (varied bonuses, never calling updateDistribution)', async () => {
        // Position 1 locks (no bonus)
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();

        // Position 2 locks (1.2x bonus)
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);

        // Second distribution (should split between position 1 and position 2, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1336, '363636363636363636', 0));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 3 locks (1.5x bonus)
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);

        // Third distribution (should split between position 2 and position 3, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(500))).wait();

        // Position 2 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[1]]);
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1385, '858585858585858585', 0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Fourth distribution (should all be for position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2] - durations[1]]);
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1677, '777777777777777777', 0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });

    it('Can enter and re-lock deposited amounts with no distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 1 re-locks 500
        const nft4 = await relock(account1, nft1, toWei(500), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(500));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(500));

        // Position 2 re-locks 250
        const nft5 = await relock(account2, nft2, toWei(250), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(750));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft5)).units).to.equal(toWei(250));

        // Position 3 re-locks all
        const nft6 = await relock(account3, nft3, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft6)).units).to.equal(toWei(1000));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(1750));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(1750));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(1750));
        expect(await XDEFIDistribution.totalSupply()).to.equal(6);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(500));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(250));
        expect(await XDEFIDistribution.withdrawableOf(nft6)).to.equal(toWei(1000));

        // Position 4 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft4, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Position 5 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft5, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Position 6 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft6, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft6)).units).to.equal(toWei(0));
    });

    it('Can enter and re-lock deposited amounts with no distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);

        // Position 3 locks
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);

        // Position 1 re-locks 500
        const nft4 = await relock(account1, nft1, toWei(500), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(500));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(500));

        // Position 2 re-locks 250
        await hre.ethers.provider.send('evm_increaseTime', [durations[1]]);
        const nft5 = await relock(account2, nft2, toWei(250), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(750));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft5)).units).to.equal(toWei(250));

        // Position 3 re-locks 1000
        await hre.ethers.provider.send('evm_increaseTime', [durations[2] - durations[1]]);
        const nft6 = await relock(account3, nft3, toWei(1000), durations[0], bonusMultipliers[0]);
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('2');
        expect((await XDEFIDistribution.positionOf(nft6)).units).to.equal(toWei(1000));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(1750));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(1750));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(1750));
        expect(await XDEFIDistribution.totalSupply()).to.equal(6);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(500));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(250));
        expect(await XDEFIDistribution.withdrawableOf(nft6)).to.equal(toWei(1000));
    });

    it('Can enter and re-lock staggered portions of distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Second distribution (should split between position 1 and position 2)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1350, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1150, 0, 1));

        // Position 1 re-locks 500 into Position 3
        const nft3 = await relock(account1, nft1, toWei(500), durations[0], bonusMultipliers[0]);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1150, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(500, 0, 0));

        // Position 4 locks
        const nft4 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1150, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(500, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1000, 0, 0));

        // Third distribution (should split between position 2, 3, and 4)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(600))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1390, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(620, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1240, 0, 1));

        // Position 2 re-locks 1000 into Position 5
        const nft5 = await relock(account2, nft2, toWei(1000), durations[0], bonusMultipliers[0]);

        // Fourth distribution (should split between position 3, 4, and 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(700, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1400, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1160, 0, 1));

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft3, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1550, 0, 2));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Fifth distribution (should split between position 4 and 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1550, 0, 1));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1310, 0, 1));

        // Position 4 unlocks
        await (await XDEFIDistribution.connect(account3).unlock(nft4, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1550, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Sixth distribution (should all be for position 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1610, 0, 1));

        // Position 5 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft5, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(2000, 0, 2));
        expect((await XDEFIDistribution.positionOf(nft5)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 5, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 5, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(5);
    });

    it('Can enter and re-lock staggered portions of distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);

        // Second distribution (should split between position 1 and position 2)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1336, '363636363636363636', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1163, '636363636363636363', 0));

        // Position 1 re-locks 500 into Position 3
        const nft3 = await relock(account1, nft1, toWei(500), durations[1], bonusMultipliers[1]);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1163, '636363636363636363', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(500, 0, 0));

        // Position 4 locks
        const nft4 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1163, '636363636363636363', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(500, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1000, 0, 0));

        // Third distribution (should split between position 2, 3, and 4)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(600))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1381, '818181818181818181', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(609, '090909090909090909', 1));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1272, '727272727272727272', 0));

        // Position 2 re-locks 1000 into Position 5
        await hre.ethers.provider.send('evm_increaseTime', [durations[1]]);
        const nft5 = await relock(account2, nft2, toWei(1000), durations[1], bonusMultipliers[1]);

        // Fourth distribution (should split between position 3, 4, and 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(681, '818181818181818181', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1454, '545454545454545454', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1145, '454545454545454545', 0));

        // Position 3 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft3, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1518, '181818181818181818', 1));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Fifth distribution (should split between position 4 and 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(1621, '212121212121212121', 1));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1278, '787878787878787878', 0));

        // Position 4 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2] - durations[1]]);
        await (await XDEFIDistribution.connect(account3).unlock(nft4, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1621, '212121212121212121', 1));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Sixth distribution (should all be for position 5)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(300))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft5)).to.equal(toWei(1578, '787878787878787878', 0));

        // Position 5 unlocks
        await (await XDEFIDistribution.connect(account2).unlock(nft5, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1960, '606060606060606060', 1));
        expect((await XDEFIDistribution.positionOf(nft5)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 4, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 4, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(5);
    });

    it('Can enter and batch exit deposited amounts with no distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[0], bonusMultipliers[0]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[0], bonusMultipliers[0]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(3000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1000));

        // Position 1, 2, and 3 unlock
        await (await XDEFIDistribution.connect(account1).unlockBatch([nft1, nft2, nft3], account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(3000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
    });

    it('Can enter and batch exit deposited amounts with no distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(3000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3700));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1000));

        // Position 1, 2, and 3 unlock
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlockBatch([nft1, nft2, nft3], account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(3000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
    });

    it('Can enter and batch exit with distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // Distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(4000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(1000));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3700));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1270, '270270270270270270', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1324, '324324324324324324', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1405, '405405405405405405', 0));

        // Position 1, 2, and 3 unlock
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlockBatch([nft1, nft2, nft3], account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(4000, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 1, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 1, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
    });

    it('Can enter and batch relock with distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // First distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(4000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(1000));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3700));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1270, '270270270270270270', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1324, '324324324324324324', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1405, '405405405405405405', 0));

        // Position 1, 2, and 3 relock
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        const nft4 = await batchRelock(account1, [nft1, nft2, nft3], toWei(3000), durations[2], bonusMultipliers[2]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000, 0, 1));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(4500));

        // Second distribution (should all for position 4)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(4000, 0, 1));

        // Position 4 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlock(nft4, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(5000, 0, 2));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(4);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(0));
    });

    it('Can enter and batch relock all with distributions (varied bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // First distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(4000));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(1000));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(3700));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1270, '270270270270270270', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1324, '324324324324324324', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1405, '405405405405405405', 0));

        // Position 1, 2, and 3 relock all
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        const nft4 = await batchRelock(account1, [nft1, nft2, nft3], toWei(4000, 0, 1), durations[2], bonusMultipliers[2]);
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft3)).units).to.equal(toWei(0));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(6000, 0, 2));

        // Second distribution (should all for position 4)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(5000, 0, 3));

        // Position 4 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlock(nft4, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(5000, 0, 3));
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 3, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(4);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(0));
    });

    it('Can merge and transfer unlocked positions', async () => {
        // Position 1 locks
        const scoreOfPosition1 = (await XDEFIDistribution.getScore(toWei(1000), durations[0])).toString();
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);
        expect((await XDEFIDistribution.attributesOf(nft1)).score_).to.equal(scoreOfPosition1);

        // Position 2 locks and is transferred to account 1
        const scoreOfPosition2 = (await XDEFIDistribution.getScore(toWei(1000), durations[1])).toString();
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        expect((await XDEFIDistribution.attributesOf(nft2)).score_).to.equal(scoreOfPosition2);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const scoreOfPosition3 = (await XDEFIDistribution.getScore(toWei(1000), durations[2])).toString();
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        expect((await XDEFIDistribution.attributesOf(nft3)).score_).to.equal(scoreOfPosition3);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // First distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Position 1, 2, and 3 unlock
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlockBatch([nft1, nft2, nft3], account1.address)).wait();

        // Unlocked positions 1, 2, and 3 are merged into unlocked position 4
        await (await XDEFIDistribution.connect(account1).merge([nft1, nft2, nft3], account1.address)).wait();
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('1');
        const nft4 = (await XDEFIDistribution.tokenOfOwnerByIndex(account1.address, 0)).toString();
        expect((await XDEFIDistribution.positionOf(nft4)).units).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft4)).to.equal(toWei(0));
        expect((await XDEFIDistribution.attributesOf(nft4)).score_).to.equal(
            BigInt(scoreOfPosition1) + BigInt(scoreOfPosition2) + BigInt(scoreOfPosition3)
        );

        // Unlocked position 4 transferred
        await (await XDEFIDistribution.connect(account1).transferFrom(account1.address, account2.address, nft4)).wait();
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('0');
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('1');

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 1, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 1, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(1);
    });

    it('Cannot merge unlocked positions', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // Attempted to merge locked positions 1, 2, and 3 into unlocked position 4
        await expect(XDEFIDistribution.connect(account1).merge([nft1, nft2, nft3], account1.address)).to.be.revertedWith(
            'PositionStillLocked()'
        );

        // Attempted to merge locked positions 1, 2, and 3 into unlocked position 4, even after elapsed time
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await expect(XDEFIDistribution.connect(account1).merge([nft1, nft2, nft3], account1.address)).to.be.revertedWith(
            'PositionStillLocked()'
        );
    });

    it('Can transfer ownership', async () => {
        await (await XDEFIDistribution.proposeOwnership(account1.address)).wait();

        expect(await XDEFIDistribution.pendingOwner()).to.equal(account1.address);
        expect(await XDEFIDistribution.owner()).to.equal(god.address);

        await (await XDEFIDistribution.connect(account1).acceptOwnership()).wait();

        expect(await XDEFIDistribution.pendingOwner()).to.equal(ZERO_ADDRESS);
        expect(await XDEFIDistribution.owner()).to.equal(account1.address);

        await (await XDEFIDistribution.connect(account1).proposeOwnership(god.address)).wait();

        expect(await XDEFIDistribution.pendingOwner()).to.equal(god.address);
        expect(await XDEFIDistribution.owner()).to.equal(account1.address);

        await (await XDEFIDistribution.acceptOwnership()).wait();

        expect(await XDEFIDistribution.pendingOwner()).to.equal(ZERO_ADDRESS);
        expect(await XDEFIDistribution.owner()).to.equal(god.address);
    });

    it('Can enter and exit deposited amount, with permits, with no distributions (no bonuses)', async () => {
        // Position 1 locks
        const nft1 = await lockWithPermit(wallet, toWei(1000), durations[0], bonusMultipliers[0], wallet, 0, maxDeadline);
        expect(await XDEFI.balanceOf(wallet.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(wallet.address)).to.equal('1');
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(1000));

        expect(await XDEFI.nonces(wallet.address)).to.equal('1');
        expect(await XDEFI.allowance(wallet.address, XDEFIDistribution.address)).to.equal('0');

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(wallet).unlock(nft1, wallet.address)).wait();
        expect(await XDEFI.balanceOf(wallet.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(1);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
    });

    it('Can unlock immediately, and cannot lock, once disabled', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[1], bonusMultipliers[1]);

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[2], bonusMultipliers[2]);

        // Distribution
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();

        // Put contract into emergency mode
        await (await XDEFIDistribution.activateEmergencyMode()).wait();

        // Position 3 should fail to lock
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await expect(
            XDEFIDistribution.connect(account3).lock(toWei(1000), durations[0], bonusMultipliers[0], account3.address)
        ).to.be.revertedWith('LockingIsDisabled()');

        // Position 1 unlocks despite insufficient elapsed time
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1177, '777777777777777777', 0));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 2 unlocks despite insufficient elapsed time
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1222, '222222222222222222', 0));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(1);
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(1);
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(2);
    });

    it('Can unlock immediately with emergencyUnlock, once disabled', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[1], bonusMultipliers[1]);

        // Position 2 locks
        const nft2 = await lock(account2, toWei(1000), durations[2], bonusMultipliers[2]);

        // Distribution
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();

        // Put contract into emergency mode
        await (await XDEFIDistribution.activateEmergencyMode()).wait();

        // Position 1 emergency unlocks despite insufficient elapsed time
        await (await XDEFIDistribution.connect(account1).emergencyUnlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // Position 2 emergency unlocks despite insufficient elapsed time
        await (await XDEFIDistribution.connect(account2).emergencyUnlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(400));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(400));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(2);
    });

    it('Can consume from unlocked positions', async () => {
        // Position 1 locks
        const scoreOfPosition1 = (await XDEFIDistribution.getScore(toWei(1000), durations[0])).toString();
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);
        const [tier1, score1, sequence1] = await XDEFIDistribution.attributesOf(nft1);
        expect(tier1).to.equal(1);
        expect(score1).to.equal(scoreOfPosition1);
        expect(sequence1).to.equal(0);

        // Position 2 locks and is transferred to account 1
        const scoreOfPosition2 = (await XDEFIDistribution.getScore(toWei(1000), durations[1])).toString();
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1]);
        const [tier2, score2, sequence2] = await XDEFIDistribution.attributesOf(nft2);
        expect(tier2).to.equal(1);
        expect(score2).to.equal(scoreOfPosition2);
        expect(sequence2).to.equal(1);
        await (await XDEFIDistribution.connect(account2).transferFrom(account2.address, account1.address, nft2)).wait();

        // Position 3 locks and is transferred to account 1
        const scoreOfPosition3 = (await XDEFIDistribution.getScore(toWei(1000), durations[2])).toString();
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2]);
        const [tier3, score3, sequence3] = await XDEFIDistribution.attributesOf(nft3);
        expect(tier3).to.equal(1);
        expect(score3).to.equal(scoreOfPosition3);
        expect(sequence3).to.equal(2);
        await (await XDEFIDistribution.connect(account3).transferFrom(account3.address, account1.address, nft3)).wait();

        // Position 1, 2, and 3 unlock
        await hre.ethers.provider.send('evm_increaseTime', [durations[2]]);
        await (await XDEFIDistribution.connect(account1).unlockBatch([nft1, nft2, nft3], account1.address)).wait();

        // Unlocked position 1 is consumed from by the owner
        await (await XDEFIDistribution.connect(account1).consume(nft1, 10, account1.address)).wait();
        const nft4 = await getMostRecentNFT(account1);
        const [tier4, score4, sequence4] = await XDEFIDistribution.attributesOf(nft4);
        expect(tier4).to.equal(1);
        expect(score4).to.equal(BigInt(scoreOfPosition1) - 10n);
        expect(sequence4).to.equal(3);

        // Unlocked position 2 is consumed from by account approved on token.
        await (await XDEFIDistribution.connect(account1).approve(account2.address, nft2)).wait();
        await (await XDEFIDistribution.connect(account2).consume(nft2, 20, account1.address)).wait();
        const nft5 = await getMostRecentNFT(account1);
        const [tier5, score5, sequence5] = await XDEFIDistribution.attributesOf(nft5);
        expect(tier5).to.equal(1);
        expect(score5).to.equal(BigInt(scoreOfPosition2) - 20n);
        expect(sequence5).to.equal(4);

        // Unlocked position 3 is consumed from by account approved for all account1's tokens.
        await (await XDEFIDistribution.connect(account1).setApprovalForAll(account3.address, true)).wait();
        await (await XDEFIDistribution.connect(account3).consume(nft3, 30, account1.address)).wait();
        const nft6 = await getMostRecentNFT(account1);
        const [tier6, score6, sequence6] = await XDEFIDistribution.attributesOf(nft6);
        expect(tier6).to.equal(1);
        expect(score6).to.equal(BigInt(scoreOfPosition3) - 30n);
        expect(sequence6).to.equal(5);
    });

    it('Cannot consume from locked positions', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        await expect(XDEFIDistribution.connect(account1).consume(nft1, 10, account1.address)).to.be.revertedWith('PositionStillLocked()');
    });
});
