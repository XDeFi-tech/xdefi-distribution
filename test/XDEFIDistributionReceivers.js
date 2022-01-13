const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = '240000000000000000000000000';

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1_000_000_000_000_000_000n + BigInt(add) - BigInt(sub)).toString();

describe("XDEFIDistributionReceivers", () => {
    let XDEFI;
    let XDEFIDistribution;
    let god;
    let account1;
    let account2;
    let account3;

    const getMostRecentNFT = async (account) => {
        const balance = BigInt(await XDEFIDistribution.balanceOf(account.address));

        return (await XDEFIDistribution.tokenOfOwnerByIndex(account.address, (balance - 1n).toString())).toString();
    };

    const lock = async (account, amount, duration, bonusMultiplier, destination = account) => {
        await (await XDEFI.connect(account).approve(XDEFIDistribution.address, amount)).wait();
        await (await XDEFIDistribution.connect(account).lock(amount, duration, bonusMultiplier, destination.address)).wait();

        return getMostRecentNFT(destination);
    };

    beforeEach(async () => {
        [god, account1, account2, account3] = await ethers.getSigners();

        XDEFI = await (await (await ethers.getContractFactory("XDEFI")).deploy("XDEFI", "XDEFI", totalSupply)).deployed();
        XDEFIDistribution = await (await (await ethers.getContractFactory("XDEFIDistribution")).deploy(XDEFI.address, "https://www.xdefi.io/nfts/")).deployed();

        // Setup some bonus multipliers (0 days with 1x, 1 day with 1.2x, 2 days with 1.5x)
        await (await XDEFIDistribution.setLockPeriods([1, 86400, 172800], [100, 120, 150])).wait();

        // Give each account (and receiver) 1000 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
    });

    it("Receiver calls updateDistribution on token receipt (no bonuses)", async () => {
        const receiver = await (await (await ethers.getContractFactory("ReceiverCallingUpdateDistribution")).deploy()).deployed();

        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), 1, 100);

        // Position 2 locks for a receiver
        const nft2 = await lock(account2, toWei(1000), 1, 100, receiver);

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1000));

        // Position 2 unlocks via receiver
        await (await receiver.connect(account2).unlock(XDEFIDistribution.address, nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1000));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(0));

        // // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(2);
    });

});
