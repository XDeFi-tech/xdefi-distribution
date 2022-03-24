const hre = require('hardhat');

async function main() {
    const secrets = require('../.secrets.json')[hre.network.name];
    const [deployer] = await ethers.getSigners();
    const balance = BigInt((await deployer.getBalance()).toString());

    console.log(`Deploying contracts with the account: ${deployer.address}`);
    console.log(`Account ETH balance: ${balance / 10n ** 18n} ETH`);

    if (!balance) return;

    const xdefiFactory = await ethers.getContractFactory('XDEFI', deployer);

    const XDEFI = secrets.xdefi
        ? xdefiFactory.attach(secrets.xdefi)
        : await (await xdefiFactory.deploy('XDEFI', 'XDEFI', '240000000000000000000000000')).deployed();

    console.log(`XDEFI address: ${XDEFI.address}`);

    const xdefiBalance = BigInt((await XDEFI.balanceOf(deployer.address)).toString());

    console.log(`Account XDEFI balance: ${xdefiBalance / 10n ** 18n} XDEFI`);

    const xdefiDistributionFactory = await ethers.getContractFactory('XDEFIDistribution', deployer);

    const XDEFIDistribution = secrets.xdefiDistribution
        ? xdefiDistributionFactory.attach(secrets.xdefiDistribution)
        : await (await xdefiDistributionFactory.deploy(XDEFI.address, secrets.baseURI ?? '')).deployed();

    console.log(`XDEFIDistribution address: ${XDEFIDistribution.address}`);

    if (secrets.lockPeriods) {
        const durations = secrets.lockPeriods.map(({ duration }) => duration);
        const multipliers = secrets.lockPeriods.map(({ multiplier }) => multiplier);
        await (await XDEFIDistribution.setLockPeriods(durations, multipliers)).wait();

        for (let i = 0; i < secrets.lockPeriods.length; ++i) {
            const duration = secrets.lockPeriods[i].duration;
            const multiplier = (await XDEFIDistribution.bonusMultiplierOf(duration)).toString();
            console.log(`Bonus multiplier for ${duration} seconds set to ${multiplier / 100} times`);
        }
    }

    const xdefiDistributionHelperFactory = await ethers.getContractFactory('XDEFIDistributionHelper', deployer);

    const XDEFIDistributionHelper = secrets.xdefiDistributionHelper
        ? xdefiDistributionHelperFactory.attach(secrets.xdefiDistributionHelper)
        : await (await xdefiDistributionHelperFactory.deploy()).deployed();

    console.log(`XDEFIDistributionHelper address: ${XDEFIDistributionHelper.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
