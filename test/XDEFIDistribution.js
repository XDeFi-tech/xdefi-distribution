const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = '240000000000000000000000000';

const toUnits = (value, add = 0, sub = 0) => (BigInt(value) * 1000000000000000000n + BigInt(add) - BigInt(sub)).toString();

describe("XDEFIDistribution", () => {
    let XDEFI;
    let XDEFIDistribution;
    let god;
    let account1;
    let account2;
    let account3;

    beforeEach(async () => {
        [god, account1, account2, account3] = await ethers.getSigners();

        XDEFI = await (await (await ethers.getContractFactory("XDEFI")).deploy("XDEFI", "XDEFI", totalSupply)).deployed();
        XDEFIDistribution = await (await (await ethers.getContractFactory("XDEFIDistribution")).deploy(XDEFI.address)).deployed();

        // Setup some bonus multipliers (0 days with 1x, 1 day with 1.2x, 2 days with 1.5x)
        await (await XDEFIDistribution.addLockPeriods([0, 86400, 172800], [100, 120, 150])).wait();

        // Give each account 100 XDEFI
        await (await XDEFI.transfer(account1.address, toUnits(1000))).wait();
        await (await XDEFI.transfer(account2.address, toUnits(1000))).wait();
        await (await XDEFI.transfer(account3.address, toUnits(1000))).wait();
    });

    it("Can enter and exit with original amounts (no bonuses)", async () => {
        // Account 1 deposits
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account1).depositXDEFI(toUnits(1000), 0)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(1000));

        // Account 2 deposits
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account2).depositXDEFI(toUnits(1000), 0)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(1000));

        // Account 2 deposits
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account3).depositXDEFI(toUnits(1000), 0)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(1000));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(3000));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toUnits(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(3000));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1000));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1000));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1000));

        // Account 1 withdraws
        await (await XDEFIDistribution.connect(account1).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account2).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account3).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toUnits(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(0));
    });

    it("Can enter and exit with original amounts (varied bonuses)", async () => {
        // Account 1 deposits (no bonus)
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account1).depositXDEFI(toUnits(1000), 0)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(1000));

        // Account 2 deposits (1.2x bonus)
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account2).depositXDEFI(toUnits(1000), 86400)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(1200));

        // Account 2 deposits (1.5x bonus)
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account3).depositXDEFI(toUnits(1000), 172800)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(0));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(1500));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(3000));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toUnits(3000));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(3700));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1000));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1000));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1000));

        // Account 1 withdraws
        await (await XDEFIDistribution.connect(account1).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account2).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account3).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(1000));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toUnits(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(0));

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(0));
    });

    it("Can enter and exit with original amounts and portions of distribution (no bonuses)", async () => {
        // Account 1 deposits
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account1).depositXDEFI(toUnits(1000), 0)).wait();

        // First distribution (should all be for account 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(200))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1200, 0, 1));

        // Account 2 deposits
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account2).depositXDEFI(toUnits(1000), 0)).wait();

        // Second distribution (should split between account 1 and account 2)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(300))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1350, 0, 1));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1150, 0, 1));

        // Account 1 withdraws
        await (await XDEFIDistribution.connect(account1).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(1350, 0, 1));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(0));

        // Account 3 deposits
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account3).depositXDEFI(toUnits(1000), 0)).wait();

        // Third distribution (should split between account 2 and account 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(500))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1400, 0, 1));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1250, 0, 0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account2).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(1400, 0, 1));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(0));

        // Fourth distribution (should all be for account 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(400))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1650, 0, 1));

        // Account 3 withdraws
        await (await XDEFIDistribution.connect(account3).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(1650, 0, 1));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(0, 3, 0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(0));
    });

    it("Can enter and exit with original amounts and portions of distribution (varied bonuses)", async () => {
        // Account 1 deposits (no bonus)
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account1).depositXDEFI(toUnits(1000), 0)).wait();

        // First distribution (should all be for account 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(200))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1200, 0, 1));

        // Account 2 deposits (1.2x bonus)
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account2).depositXDEFI(toUnits(1000), 86400)).wait();

        // Second distribution (should split between account 1 and account 2, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(300))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(1336, '363636363636363636', 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1163, '636363636363636363', 0));

        // Account 1 withdraws
        await (await XDEFIDistribution.connect(account1).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toUnits(1336, '363636363636363636', 0));
        expect((await XDEFIDistribution.positionOf(account1.address)).units.toString()).to.equal(toUnits(0));

        // Account 3 deposits (1.5x bonus)
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toUnits(1000))).wait();
        await (await XDEFIDistribution.connect(account3).depositXDEFI(toUnits(1000), 172800)).wait();

        // Third distribution (should split between account 2 and account 3, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(500))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(1385, '858585858585858585', 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1277, '777777777777777777', 0));

        // Account 2 withdraws
        await (await XDEFIDistribution.connect(account2).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toUnits(1385, '858585858585858585', 0));
        expect((await XDEFIDistribution.positionOf(account2.address)).units.toString()).to.equal(toUnits(0));

        // Fourth distribution (should all be for account 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toUnits(400))).wait();
        await (await XDEFIDistribution.updateFundsReceived()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account1.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account2.address)).to.equal(toUnits(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableXDEFIOf(account3.address)).to.equal(toUnits(1677, '777777777777777777', 0));

        // Account 3 withdraws
        await (await XDEFIDistribution.connect(account3).withdrawXDEFI()).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toUnits(1677, '777777777777777777', ));
        expect((await XDEFIDistribution.positionOf(account3.address)).units.toString()).to.equal(toUnits(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toUnits(0, 2, 0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toUnits(0));
    });
});
