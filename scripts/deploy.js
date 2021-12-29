const hre = require('hardhat');

async function main() {
    const { xdefi, baseURI } = require('../.secrets.json')[hre.network.name];
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
    console.log("Token address:", xdefi);

    const XDEFIDistribution = await (await (await ethers.getContractFactory("XDEFIDistribution")).deploy(xdefi, baseURI)).deployed();

    console.log("XDEFIDistribution address:", XDEFIDistribution.address);

    const XDEFIDistributionHelper = await (await (await ethers.getContractFactory("XDEFIDistributionHelper")).deploy()).deployed();

    console.log("XDEFIDistributionHelper address:", XDEFIDistributionHelper.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
