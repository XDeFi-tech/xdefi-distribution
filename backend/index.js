const http = require("http");
const url = require('url');
const fs = require('fs');
const path = require('path');

// TODO: add trait/attribute indicating if the NFT is backed by withdrawable XDEFI, and how much
// TODO: env for `fee_recipient` and chain read api key

const host = 'localhost';
const port = 8000;

const CREATURES = {
    '1': { name: 'Ikalgo', file: 'ikalgo' },
    '2': { name: 'Oxtopus', file: 'oxtopus' },
    '3': { name: 'Nautilus', file: 'nautilus' },
    '4': { name: 'Kaurna', file: 'kaurna' },
    '5': { name: 'Haliphron', file: 'haliphron' },
    '6': { name: 'Kanaloa', file: 'kanaloa' },
    '7': { name: 'Taniwha', file: 'taniwha' },
    '8': { name: 'Cthulhu', file: 'cthulhu' },
    '9': { name: 'Yacumama', file: 'yacumama' },
    '10': { name: 'Hafgufa', file: 'hafgufa' },
    '11': { name: 'Akkorokamui', file: 'akkorokamui' },
    '12': { name: 'Nessie', file: 'nessie' },
    '13': { name: 'The Kraken', file: 'thekraken' },
};

const errorResponse = (res, error = '') => {
    res.writeHead(400);
    res.end(error)
};

const infoResponse = (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });

    const metadata = JSON.stringify({
        name: "XDEFI Badges",
        description: "XDEFI Badges are tiered NFTs born from the creation of XDEFI Distribution Positions.",
        image: "http://localhost:8000/media/xdefi.png",
        external_link: "https://www.xdefi.io/",
        seller_fee_basis_points: 100,  // 1% in basis points
        fee_recipient: "0x0000000000000000000000000000000000000000",
    });

    res.end(metadata);
};

const metadataResponse = (tokenIdParam, res) => {
    if (!tokenIdParam || !/^[0-9]+$/.test(tokenIdParam)) return errorResponse(res);

    const tokenId = BigInt(tokenIdParam);

    if (tokenId >= (2n ** 256n)) return errorResponse(res, 'INVALID TOKEN ID');

    const mintSequence = (tokenId & ((2n ** 128n) - 1n)).toString();
    const score = ((tokenId >> 128n) & ((2n ** 124n) - 1n)).toString();
    const tier = (tokenId >> 252n).toString();
    const creature = CREATURES[tier];

    if (!creature) return errorResponse(res, 'INVALID TIER');

    const { name, file } = creature;

    const data = JSON.stringify({
        attributes: [
            { display_type: 'number', trait_type: 'score', value: score },
            { display_type: 'number', trait_type: 'tier', value: tier },
            { display_type: 'number', trait_type: 'sequence', value: mintSequence },
        ],
        description: `${name} is a tier ${tier} XDEFI Badge.`,
        name,
        background_color: "2040DF",
        image: `http://localhost:8000/media/${file}.png`,
        animation_url: `http://localhost:8000/media/${file}.mp4`,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(data);
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
