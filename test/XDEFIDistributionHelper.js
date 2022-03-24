const { expect } = require('chai');
const { ethers } = require('hardhat');

const totalSupply = '240000000000000000000000000';

const toWei = (value, add = 0, sub = 0) => (BigInt(value) * 1_000_000_000_000_000_000n + BigInt(add) - BigInt(sub)).toString();

describe('XDEFIDistributionHelper', () => {
    const durations = [1, 86400, 172800];
    const bonusMultipliers = [100, 120, 150];

    let XDEFI;
    let XDEFIDistribution;
    let XDEFIDistributionHelper;
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

        XDEFI = await (await (await ethers.getContractFactory('XDEFI')).deploy('XDEFI', 'XDEFI', totalSupply)).deployed();
        XDEFIDistribution = await (
            await (await ethers.getContractFactory('XDEFIDistribution')).deploy(XDEFI.address, 'https://www.xdefi.io/nfts/')
        ).deployed();
        XDEFIDistributionHelper = await (await (await ethers.getContractFactory('XDEFIDistributionHelper')).deploy()).deployed();

        // Setup some bonus multipliers (0 days with 1x, 1 day with 1.2x, 2 days with 1.5x)
        await (await XDEFIDistribution.setLockPeriods(durations, bonusMultipliers)).wait();

        // Give each account 1000 XDEFI
        await (await XDEFI.transfer(account1.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account2.address, toWei(1000))).wait();
        await (await XDEFI.transfer(account3.address, toWei(1000))).wait();
    });

    it('Can fetch all XDEFIDistribution data for an account', async () => {
        // Position 1 locks
        const nft1 = await lock(account1, toWei(1000), durations[0], bonusMultipliers[0]);

        // Position 2 locks and is transferred to account 1
        const nft2 = await lock(account2, toWei(1000), durations[1], bonusMultipliers[1], account1);

        // Position 3 locks and is transferred to account 1
        const nft3 = await lock(account3, toWei(1000), durations[2], bonusMultipliers[2], account1);

        // Distribution (should split between position 1, 2, and 3)
        await (await XDEFI.transfer(XDEFIDistribution.address, toWei(1000))).wait();
        await (await XDEFIDistribution.updateDistribution()).wait();

        // Get all data for account 1's positions.
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal(3);

        await XDEFIDistributionHelper.getAllTokensForAccount(XDEFIDistribution.address, account1.address).then((tokenIds) => {
            expect(tokenIds.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);
        });

        await XDEFIDistributionHelper.getAllTokensAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            ({ tokenIds_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(credits_.map((c) => c.toString())).to.deep.equal([
                    '1000000000000000000000',
                    '86400000000000000000000000',
                    '172800000000000000000000000',
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(positions_.length).to.equal(3);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('1'));
                expect(positions_[1]).to.deep.equal(await XDEFIDistribution.positionOf('2'));
                expect(positions_[2]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([
                    toWei(1270, '270270270270270270', 0),
                    toWei(1324, '324324324324324324', 0),
                    toWei(1405, '405405405405405405', 0),
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(positions_.length).to.equal(3);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('1'));
                expect(positions_[1]).to.deep.equal(await XDEFIDistribution.positionOf('2'));
                expect(positions_[2]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([
                    toWei(1270, '270270270270270270', 0),
                    toWei(1324, '324324324324324324', 0),
                    toWei(1405, '405405405405405405', 0),
                ]);

                expect(credits_.map((c) => c.toString())).to.deep.equal([
                    '1000000000000000000000',
                    '86400000000000000000000000',
                    '172800000000000000000000000',
                ]);
            }
        );

        // Position 1 unlocks
        await (await XDEFIDistribution.connect(account1).unlock(nft1, account1.address)).wait();

        // Get all data for account 1's positions.
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal(3);

        await XDEFIDistributionHelper.getAllTokensForAccount(XDEFIDistribution.address, account1.address).then((tokenIds) => {
            expect(tokenIds.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);
        });

        await XDEFIDistributionHelper.getAllTokensAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            ({ tokenIds_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(credits_.map((c) => c.toString())).to.deep.equal([
                    '1000000000000000000000',
                    '86400000000000000000000000',
                    '172800000000000000000000000',
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['2', '3']);

                expect(positions_.length).to.equal(2);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('2'));
                expect(positions_[1]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([
                    toWei(1324, '324324324324324324', 0),
                    toWei(1405, '405405405405405405', 0),
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['2', '3']);

                expect(positions_.length).to.equal(2);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('2'));
                expect(positions_[1]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([
                    toWei(1324, '324324324324324324', 0),
                    toWei(1405, '405405405405405405', 0),
                ]);

                expect(credits_.map((c) => c.toString())).to.deep.equal(['86400000000000000000000000', '172800000000000000000000000']);
            }
        );

        // Position 2 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
        await (await XDEFIDistribution.connect(account1).unlock('2', account1.address)).wait();

        // Get all data for account 1's positions.
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal(3);

        await XDEFIDistributionHelper.getAllTokensForAccount(XDEFIDistribution.address, account1.address).then((tokenIds) => {
            expect(tokenIds.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);
        });

        await XDEFIDistributionHelper.getAllTokensAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            ({ tokenIds_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(credits_.map((c) => c.toString())).to.deep.equal([
                    '1000000000000000000000',
                    '86400000000000000000000000',
                    '172800000000000000000000000',
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['3']);

                expect(positions_.length).to.equal(1);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([toWei(1405, '405405405405405405', 0)]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['3']);

                expect(positions_.length).to.equal(1);
                expect(positions_[0]).to.deep.equal(await XDEFIDistribution.positionOf('3'));

                expect(withdrawables_.map((x) => x.toString())).to.deep.equal([toWei(1405, '405405405405405405', 0)]);

                expect(credits_.map((c) => c.toString())).to.deep.equal(['172800000000000000000000000']);
            }
        );

        // Position 3 unlocks
        await hre.ethers.provider.send('evm_increaseTime', [86400]);
        await (await XDEFIDistribution.connect(account1).unlock('3', account1.address)).wait();

        // Get all data for account 1's positions.
        expect(await XDEFIDistribution.balanceOf(account1.address)).to.equal(3);

        await XDEFIDistributionHelper.getAllTokensForAccount(XDEFIDistribution.address, account1.address).then((tokenIds) => {
            expect(tokenIds.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);
        });

        await XDEFIDistributionHelper.getAllTokensAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            ({ tokenIds_, credits_ }) => {
                expect(tokenIds_.map((t) => t.toString())).to.deep.equal(['1', '2', '3']);

                expect(credits_.map((c) => c.toString())).to.deep.equal([
                    '1000000000000000000000',
                    '86400000000000000000000000',
                    '172800000000000000000000000',
                ]);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_ }) => {
                expect(tokenIds_.length).to.equal(0);
                expect(positions_.length).to.equal(0);
                expect(withdrawables_.length).to.equal(0);
            }
        );

        await XDEFIDistributionHelper.getAllLockedPositionsAndCreditsForAccount(XDEFIDistribution.address, account1.address).then(
            async ({ tokenIds_, positions_, withdrawables_, credits_ }) => {
                expect(tokenIds_.length).to.equal(0);
                expect(positions_.length).to.equal(0);
                expect(withdrawables_.length).to.equal(0);
                expect(credits_.length).to.equal(0);
            }
        );
    });
});
