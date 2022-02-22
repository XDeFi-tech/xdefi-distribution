const hre = require('hardhat');

async function main() {
    const secrets = require('../.secrets.json')[hre.network.name];
    const [deployer] = await ethers.getSigners();
    const balance = BigInt((await deployer.getBalance()).toString());

    console.log('Deploying contracts with the account:', deployer.address);
    console.log('Account XDEFI balance:', balance);

    if (!balance) return;

    const XDEFI =
        secrets.xdefi ??
        (await (await (await ethers.getContractFactory('XDEFI')).deploy('XDEFI', 'XDEFI', '240000000000000000000000000')).deployed())
            .address;

    console.log('XDEFI address:', XDEFI);

    const XDEFIDistribution = await (
        await (await ethers.getContractFactory('XDEFIDistribution')).deploy(XDEFI, secrets.baseURI)
    ).deployed();

    console.log('XDEFIDistribution address:', XDEFIDistribution.address);

    const XDEFIDistributionHelper = await (await (await ethers.getContractFactory('XDEFIDistributionHelper')).deploy()).deployed();

    console.log('XDEFIDistributionHelper address:', XDEFIDistributionHelper.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
