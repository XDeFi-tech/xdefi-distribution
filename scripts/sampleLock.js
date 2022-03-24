const hre = require('hardhat');

const amount = '100000000000000000000';
const duration = 86400;

async function main() {
    const { xdefi, xdefiDistribution } = require('../.secrets.json')[hre.network.name];
    const [account] = await ethers.getSigners();
    const balance = BigInt((await account.getBalance()).toString());

    if (!xdefi) return;

    if (!xdefiDistribution) return;

    console.log(`Using account: ${account.address}`);
    console.log(`Account ETH balance: ${balance / 10n ** 18n} ETH`);
    console.log(`XDEFI address: ${xdefi}`);
    console.log(`XDEFIDistribution address: ${xdefiDistribution}`);

    const XDEFI = (await ethers.getContractFactory('XDEFI', account)).attach(xdefi);
    const XDEFIDistribution = (await ethers.getContractFactory('XDEFIDistribution', account)).attach(xdefiDistribution);

    const xdefiBalance = BigInt((await XDEFI.balanceOf(account.address)).toString());

    console.log(`Account XDEFI balance: ${xdefiBalance / 10n ** 18n} XDEFI`);

    const multiplier = (await XDEFIDistribution.bonusMultiplierOf(duration)).toString();

    await (await XDEFI.approve(xdefiDistribution, amount)).wait();
    await (await XDEFIDistribution.lock(amount, duration, multiplier, account.address)).wait();

    const nftBalance = BigInt(await XDEFIDistribution.balanceOf(account.address));
    const tokenId = await XDEFIDistribution.tokenOfOwnerByIndex(account.address, (nftBalance - 1n).toString());
    const attributes = await XDEFIDistribution.attributesOf(tokenId);

    console.log(`TokenID: ${tokenId}`);
    console.log(
        `Attributes: ${attributes.tier_} (tier), ${attributes.credits_} (credits), ${attributes.withdrawable_} (withdrawable), ${attributes.expiry_} (expiry)`
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
