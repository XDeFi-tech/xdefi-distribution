const hre = require('hardhat');

async function main() {
    const { xdefi, xdefiDistribution } = require('../.secrets.json')[hre.network.name];
    const [account] = await ethers.getSigners();

    console.log('Using account:', account.address);
    console.log('ETH balance:', BigInt(await account.getBalance()));
    console.log('XDEFI address:', xdefi);
    console.log('XDEFIDistribution address:', xdefiDistribution);

    const XDEFI = await (await ethers.getContractFactory('XDEFI')).attach(xdefi);
    const XDEFIDistribution = await (await ethers.getContractFactory('XDEFIDistribution')).attach(xdefiDistribution);

    console.log('XDEFI balance:', BigInt(await XDEFI.balanceOf(account.address)));
    console.log('XDEFIDistribution balance:', BigInt(await XDEFIDistribution.balanceOf(account.address)));

    await (await XDEFIDistribution.connect(account).setLockPeriods(['86400'], ['100'])).wait();
    await (await XDEFI.connect(account).approve(xdefiDistribution, '100000000000000000000')).wait();
    await (await XDEFIDistribution.connect(account).lock('100000000000000000000', '86400', '100', account.address)).wait();

    const nftBalance = BigInt(await XDEFIDistribution.balanceOf(account.address));

    console.log('TokenID:', await XDEFIDistribution.tokenOfOwnerByIndex(account.address, (nftBalance - 1n).toString()));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
