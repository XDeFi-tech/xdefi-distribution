const http = require("http");
const url = require('url');
const fs = require('fs');
const path = require('path');

// TODO: add trait/attribute indicating if the NFT is backed by withdrawable XDEFI, and how much
// TODO: env for `fee_recipient` and chain read api key

const host = 'localhost';
const port = 8000;

const errorResponse = (res) => {
    res.writeHead(400);
    res.end()
};

const infoResponse = (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });

    const metadata = JSON.stringify({
        name: "XDEFI Distribution Creatures",
        description: "XDEFI Distribution Creatures are tiered NFTs born from the creation of XDEFI Distribution Positions.",
        image: "https://s2.coinmarketcap.com/static/img/coins/64x64/13472.png",
        external_link: "https://www.xdefi.io/",
        seller_fee_basis_points: 100,  // 1% in basis points
        fee_recipient: "0x0000000000000000000000000000000000000000"
    });

    res.end(metadata);
};

const getCreature = (tier) => {
    if (tier === '1') return { name: 'Ikalgo', file: 'ikalgo' };

    if (tier === '2') return { name: 'Oxtopus', file: 'oxtopus' };

    if (tier === '3') return { name: 'Nautilus', file: 'nautilus' };

    if (tier === '4') return { name: 'Kaurna', file: 'kaurna' };

    if (tier === '5') return { name: 'Haliphron', file: 'haliphron' };

    if (tier === '6') return { name: 'Kanaloa', file: 'kanaloa' };

    if (tier === '7') return { name: 'Taniwha', file: 'taniwha' };

    if (tier === '8') return { name: 'Cthulhu', file: 'cthulhu' };

    if (tier === '9') return { name: 'Yacumama', file: 'yacumama' };

    if (tier === '10') return { name: 'Hafgufa', file: 'hafgufa' };

    if (tier === '11') return { name: 'Akkorokamui', file: 'akkorokamui' };

    if (tier === '12') return { name: 'Nessie', file: 'nessie' };

    if (tier === '13') return { name: 'The Kraken', file: 'thekraken' };

    throw Error('Invalid Tier');
};

const getMetadata = (tokenId) => {
    const mintSequence = (tokenId & ((2n ** 128n) - 1n)).toString();
    const score = ((tokenId >> 128n) & ((2n ** 124n) - 1n)).toString();
    const tier = (tokenId >> 252n).toString();
    const { name, file } = getCreature(tier);

    return JSON.stringify({
        attributes: [
            { display_type: 'number', trait_type: 'score', value: score },
            { display_type: 'number', trait_type: 'tier', value: tier },
            { display_type: 'number', trait_type: 'sequence', value: mintSequence },
        ],
        description: `${name} is a tier ${tier} XDEFI Distribution Creature.`,
        name,
        background_color: "2040DF",
        image: `http://localhost:8000/media/${file}.png`,
        animation_url: `http://localhost:8000/media/${file}.mp4`,
    });
};

const metadataResponse = (tokenIdParam, res) => {
    if (!tokenIdParam || !/^[0-9]+$/.test(tokenIdParam)) return errorResponse(res);

    const tokenId = BigInt(tokenIdParam);

    if (tokenId >= (2n ** 256n)) return errorResponse(res);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(getMetadata(tokenId));
};

const mediaResponse = (fileName, res) => {
    const filePath = path.join(__dirname, `media/${fileName}`);

    fs.readFile(filePath, (err, content) => {
        if (err) return errorResponse(res);

        res.writeHead(200, { 'Content-type': fileName.endsWith('.mp4') ? 'video/mp4' : 'image/png' });
        res.end(content);
    });
};

const requestListener = function (req, res) {
    const urlParts = url.parse(req.url, false).path.split('/');

    if (urlParts.length <= 1) return errorResponse(res);

    if (urlParts[1] === 'media' && urlParts.length === 3) return mediaResponse(urlParts[2], res);

    if (urlParts[1] === 'info' && urlParts.length === 2) return infoResponse(res);

    if (urlParts.length === 2) return metadataResponse(urlParts[1], res);

    return errorResponse(res);
};

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
