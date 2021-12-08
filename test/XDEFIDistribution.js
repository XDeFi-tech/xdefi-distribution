const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = '240000000000000000000000000';

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1000000000000000000n + BigInt(add) - BigInt(sub)).toString();

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
        XDEFIDistribution = await (await (await ethers.getContractFactory("XDEFIDistribution")).deploy(XDEFI.address, "https://www.xdefi.io/nfts/")).deployed();

        // Setup some bonus multipliers (0 days with 1x, 1 day with 1.2x, 2 days with 1.5x)
        await (await XDEFIDistribution.addLockPeriods([0, 86400, 172800], [100, 120, 150])).wait();

        // Give each account 100 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
    });

    it("Can enter and exit with original amounts (no bonuses)", async () => {
        // Account 1 locks
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account1).lock(toWei(1000), 0, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('1');
        const nft1 = (await XDEFIDistribution.tokenOfOwnerByIndex(account1.address, 0)).toString();
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(1000));

        // Account 2 locks
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account2).lock(toWei(1000), 0, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('1');
        const nft2 = (await XDEFIDistribution.tokenOfOwnerByIndex(account2.address, 0)).toString();
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(1000));

        // Account 3 locks
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account3).lock(toWei(1000), 0, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('1');
        const nft3 = (await XDEFIDistribution.tokenOfOwnerByIndex(account3.address, 0)).toString();
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

    it("Can enter and exit with original amounts (varied bonuses)", async () => {
        // Account 1 locks (no bonus)
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account1).lock(toWei(1000), 0, account1.address)).wait();
        expect(await XDEFI.balanceOf(account1.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal('1');
        const nft1 = (await XDEFIDistribution.tokenOfOwnerByIndex(account1.address, 0)).toString();
        expect((await XDEFIDistribution.positionOf(nft1)).units).to.equal(toWei(1000));

        // Account 2 locks (1.2x bonus)
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account2).lock(toWei(1000), 86400, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account2.address)).to.equal('1');
        const nft2 = (await XDEFIDistribution.tokenOfOwnerByIndex(account2.address, 0)).toString();
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(1200));

        // Account 3 locks (1.5x bonus)
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account3).lock(toWei(1000), 172800, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(0));
        expect(await XDEFIDistribution.balanceOf(account3.address)).to.equal('1');
        const nft3 = (await XDEFIDistribution.tokenOfOwnerByIndex(account3.address, 0)).toString();
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
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1000));
        expect((await XDEFIDistribution.positionOf(nft2)).units).to.equal(toWei(0));

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
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

    it("Can enter and exit with original amounts and portions of distribution (no bonuses)", async () => {
        // Account 1 locks
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account1).lock(toWei(1000), 0, account1.address)).wait();
        const nft1 = (await XDEFIDistribution.tokenOfOwnerByIndex(account1.address, 0)).toString();

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Account 2 locks
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account2).lock(toWei(1000), 0, account2.address)).wait();
        const nft2 = (await XDEFIDistribution.tokenOfOwnerByIndex(account2.address, 0)).toString();

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

        // Account 3 locks
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account3).lock(toWei(1000), 0, account3.address)).wait();
        const nft3 = (await XDEFIDistribution.tokenOfOwnerByIndex(account3.address, 0)).toString();

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

    it("Can enter and exit with original amounts and portions of distribution (varied bonuses)", async () => {
        // Account 1 locks (no bonus)
        await (await XDEFI.connect(account1).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account1).lock(toWei(1000), 0, account1.address)).wait();
        const nft1 = (await XDEFIDistribution.tokenOfOwnerByIndex(account1.address, 0)).toString();

        // First distribution (should all be for position 1)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(200))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(1200, 0, 1));

        // Account 2 locks (1.2x bonus)
        await (await XDEFI.connect(account2).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account2).lock(toWei(1000), 86400, account2.address)).wait();
        const nft2 = (await XDEFIDistribution.tokenOfOwnerByIndex(account2.address, 0)).toString();

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

        // Account 3 locks (1.5x bonus)
        await (await XDEFI.connect(account3).approve(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.connect(account3).lock(toWei(1000), 172800, account3.address)).wait();
        const nft3 = (await XDEFIDistribution.tokenOfOwnerByIndex(account3.address, 0)).toString();

        // Third distribution (should split between position 2 and position 3, taking bonus into account)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(500))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(1385, '858585858585858585', 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1277, '777777777777777777', 0));

        // Position 2 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
        await (await XDEFIDistribution.connect(account2).unlock(nft2, account2.address)).wait();
        expect(await XDEFI.balanceOf(account2.address)).to.equal(toWei(1385, '858585858585858585', 0));
        expect((await XDEFIDistribution.positionOf(account2.address)).units).to.equal(toWei(0));

        // Fourth distribution (should all be for position 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(400))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Check withdrawable
        expect(await XDEFIDistribution.withdrawableOf(nft1)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft2)).to.equal(toWei(0, 0, 0));
        expect(await XDEFIDistribution.withdrawableOf(nft3)).to.equal(toWei(1677, '777777777777777777', 0));

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
        await (await XDEFIDistribution.connect(account3).unlock(nft3, account3.address)).wait();
        expect(await XDEFI.balanceOf(account3.address)).to.equal(toWei(1677, '777777777777777777', ));
        expect((await XDEFIDistribution.positionOf(account3.address)).units).to.equal(toWei(0));

        // Check contract values
        expect(await XDEFI.balanceOf(XDEFIDistribution.address)).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.distributableXDEFI()).to.equal(toWei(0, 2, 0));
        expect(await XDEFIDistribution.totalDepositedXDEFI()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalUnits()).to.equal(toWei(0));
        expect(await XDEFIDistribution.totalSupply()).to.equal(3);
    });
});
