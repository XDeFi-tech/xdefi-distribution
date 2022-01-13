const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = '240000000000000000000000000';

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1_000_000_000_000_000_000n + BigInt(add) - BigInt(sub)).toString();

const getPointsCorrection = (old, newXdefi, totalUnits) => BigInt(old) + (BigInt(newXdefi) * (2n ** 128n)) / BigInt(totalUnits);

const randomIntInclusive = (min, max) => Math.floor(Math.random() * (max - min) + min);

describe("XDEFIDistributionEdgeCases", () => {
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
    });

    it("Maximal lock and minimal reward (cycles)", async () => {
        // Set 0-day lockup bonus multiplier to 2.55x
        await (await XDEFIDistribution.setLockPeriods([1], [255])).wait();

        let pointsPerUnit = 0n;

        for (let i = 1; i <= 10; ++i) {
            // Lock 1 XDEFI
            const nft = await lock(god, toWei(1), 1, 255);

            // Distribute 239M XDEFI
            await (await XDEFI.transfer(XDEFIDistribution.address, toWei(239_000_000))).wait();
            await (await XDEFIDistribution.updateDistribution()).wait();

            // pointsPerUnit = getPointsCorrection(pointsPerUnit, toWei(239_000_000), toWei(0, 1, 0));
            // const units = BigInt((await XDEFIDistribution.positionOf(nft)).units);
            // console.log(`pointsPerUnit: ${pointsPerUnit}`);
            // console.log(`pointsPerUnit*units: ${pointsPerUnit * units}`);

            // Check withdrawable
            expect(await XDEFIDistribution.withdrawableOf(nft)).to.equal(toWei(239_000_001, 0, 1));

            // Unlock
            await (await XDEFIDistribution.unlock(nft, god.address)).wait();
            expect(await XDEFI.balanceOf(god.address)).to.equal(toWei(240_000_000, 0, i));
            expect((await XDEFIDistribution.positionOf(god.address)).units).to.equal(toWei(0));

            // Check contract values
            expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(i);
            expect(await XDEFIDistribution.distributableXDEFI()).to.equal(i);
            expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalSupply()).to.equal(i);
        }
    });

    it("Minimal lock and maximal reward (cycles)", async () => {
        // Set 0-day lockup bonus multiplier to 2.55x
        await (await XDEFIDistribution.setLockPeriods([1], [255])).wait();

        let pointsPerUnit = 0n;

        for (let i = 1; i <= 10; ++i) {
            const startingBalance = BigInt(await XDEFI.balanceOf(god.address));
            const lockAmount = (startingBalance - 1n).toString();

            // Lock ~240M XDEFI (minus 1 "wei" of XDEFI)
            const nft = await lock(god, lockAmount, 1, 255);

            // Distribute 1 "wei" of XDEFI
            await (await XDEFI.transfer(XDEFIDistribution.address, 1)).wait();
            await (await XDEFIDistribution.updateDistribution()).wait();

            // pointsPerUnit = getPointsCorrection(pointsPerUnit, 1, lockAmount);
            // const units = BigInt((await XDEFIDistribution.positionOf(nft)).units);
            // console.log(`pointsPerUnit: ${pointsPerUnit}`);
            // console.log(`pointsPerUnit*units: ${pointsPerUnit * units}`);

            // Check withdrawable
            expect(await XDEFIDistribution.withdrawableOf(nft)).to.equal(lockAmount);

            // Unlock
            await (await XDEFIDistribution.unlock(nft, god.address)).wait();
            expect(await XDEFI.balanceOf(god.address)).to.equal(lockAmount);
            expect((await XDEFIDistribution.positionOf(god.address)).units).to.equal(toWei(0));

            // Check contract values
            expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(i);
            expect(await XDEFIDistribution.distributableXDEFI()).to.equal(i);
            expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalSupply()).to.equal(i);
        }
    });

    it("Half lock and half reward (cycles)", async () => {
        // Set 0-day lockup bonus multiplier to 2.55x
        await (await XDEFIDistribution.setLockPeriods([1], [255])).wait();

        let pointsPerUnit = 0n;

        for (let i = 1; i <= 10; ++i) {
            const startingBalance = BigInt(await XDEFI.balanceOf(god.address));
            const half = (startingBalance / 2n).toString();

            // Lock ~120M XDEFI
            const nft = await lock(god, half, 1, 255);

            // Distribute ~120M XDEFI
            await (await XDEFI.transfer(XDEFIDistribution.address, half)).wait();
            await (await XDEFIDistribution.updateDistribution()).wait();

            // pointsPerUnit = getPointsCorrection(pointsPerUnit, half, half);
            // const units = BigInt((await XDEFIDistribution.positionOf(nft)).units);
            // console.log(`pointsPerUnit: ${pointsPerUnit}`);
            // console.log(`pointsPerUnit*units: ${pointsPerUnit * units}`);

            // Unlock
            await (await XDEFIDistribution.unlock(nft, god.address)).wait();
            // expect(await XDEFI.balanceOf(god.address)).to.equal(startingBalance - 1n);
            expect((await XDEFIDistribution.positionOf(god.address)).units).to.equal(toWei(0));

            // Check contract values
            // expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(25411 * i);
            // expect(await XDEFIDistribution.distributableXDEFI()).to.equal(25411 * i);
            expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
            expect(await XDEFIDistribution.totalSupply()).to.equal(i);
        }
    });

    it.skip("Checking that pointsPerUnit * units > pointsCorrection", async () => {
        // Set 0-day lockup bonus multiplier to 2.55x
        await (await XDEFIDistribution.setLockPeriods([1], [255])).wait();

        for (let i = 1; i <= 200; ++i) {
            const startingBalance = BigInt(await XDEFI.balanceOf(god.address));
            const lockAmount = (BigInt(randomIntInclusive(1, 500)) * startingBalance) / 1000n;
            const rewardAmount = (BigInt(randomIntInclusive(1, 500)) * startingBalance) / 1000n;

            // Lock
            const nft = await lock(god, lockAmount.toString(), 1, 255);

            // Distribute
            await (await XDEFI.transfer(XDEFIDistribution.address, rewardAmount.toString())).wait();
            await (await XDEFIDistribution.updateDistribution()).wait();

            // `_pointsPerUnit` needs to be public in contract for this to work.
            // const pointsPerUnit = BigInt(await XDEFIDistribution._pointsPerUnit());
            // const position = await XDEFIDistribution.positionOf(nft);
            // const units = BigInt(position.units);
            // const pointsCorrection = BigInt(position.pointsCorrection);
            // console.log(`pointsPerUnit    : ${pointsPerUnit}`);
            // console.log(`units            : ${units}`);
            // console.log(`pointsCorrection : ${pointsCorrection}`);
            // console.log(`pointsPerUnit * units >= pointsCorrection : ${pointsPerUnit * units > pointsCorrection} (${lockAmount / 1_000_000_000_000_000_000n} and ${rewardAmount / 1_000_000_000_000_000_000n})`);

            // expect(pointsPerUnit * units > pointsCorrection).to.be.true;

            // Unlock
            await (await XDEFIDistribution.unlock(nft, god.address)).wait();

            // const division = pointsCorrection == 0n ? 'INF' : ((pointsPerUnit * units * 100n) / pointsCorrection).toString();
            // console.log(`(pointsPerUnit * units) / pointsCorrection : ${(parseInt(division) / 100).toFixed(2)} (${BigInt(await XDEFI.balanceOf(god.address))})`);
        }
    });
});
