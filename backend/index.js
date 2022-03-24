const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const host = 'localhost';
const port = 8000;
const contract = '0x0000000000000000000000000000000000000000';

const CREATURES = {
    1: { name: 'Ikalgo', file: 'ikalgo', threshold: (0n * 30n * 86_400n).toString() },
    2: { name: 'Oxtopus', file: 'oxtopus', threshold: (150n * 30n * 86_400n).toString() },
    3: { name: 'Nautilus', file: 'nautilus', threshold: (300n * 30n * 86_400n).toString() },
    4: { name: 'Kaurna', file: 'kaurna', threshold: (750n * 30n * 86_400n).toString() },
    5: { name: 'Haliphron', file: 'haliphron', threshold: (1_500n * 30n * 86_400n).toString() },
    6: { name: 'Kanaloa', file: 'kanaloa', threshold: (3_000n * 30n * 86_400n).toString() },
    7: { name: 'Taniwha', file: 'taniwha', threshold: (7_000n * 30n * 86_400n).toString() },
    8: { name: 'Cthulhu', file: 'cthulhu', threshold: (15_000n * 30n * 86_400n).toString() },
    9: { name: 'Yacumama', file: 'yacumama', threshold: (30_000n * 30n * 86_400n).toString() },
    10: { name: 'Hafgufa', file: 'hafgufa', threshold: (60_000n * 30n * 86_400n).toString() },
    11: { name: 'Akkorokamui', file: 'akkorokamui', threshold: (120_000n * 30n * 86_400n).toString() },
    12: { name: 'Nessie', file: 'nessie', threshold: (250_000n * 30n * 86_400n).toString() },
    13: { name: 'The Kraken', file: 'thekraken', threshold: (500_000n * 30n * 86_400n).toString() },
};

const toDecimal = (value, decimalsIn, decimalsOut) => {
    return Number((Number(value / 10n ** BigInt(decimalsIn - decimalsOut)) / 10 ** decimalsOut).toFixed(decimalsOut));
};

const errorResponse = (res, error = '') => {
    res.writeHead(400);
    res.end(error);
};

const infoResponse = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const metadata = JSON.stringify({
        name: 'XDEFI Badges',
        description: 'XDEFI Badges are tiered NFTs born from the creation of XDEFI Distribution Positions.',
        image: 'http://localhost:8000/media/xdefi.png',
        external_link: 'https://www.xdefi.io/',
        seller_fee_basis_points: 100, // 1% in basis points
        fee_recipient: '0x0000000000000000000000000000000000000000',
        tiers: CREATURES,
    });

    res.end(metadata);
};

const getAttributes = async (tokenId) => {
    const {
        data: { result },
    } = await axios.post(
        'http://127.0.0.1:7545',
        {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [
                {
                    to: contract,
                    data: `0x09363c44${BigInt(tokenId).toString(16).padStart(64, '0')}`,
                },
                'latest',
            ],
            id: 1,
        },
        {
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    return {
        tier: Number(BigInt('0x' + result.slice(2, 66))),
        credits: BigInt('0x' + result.slice(66, 130)),
        withdrawable: BigInt('0x' + result.slice(130, 194)),
        expiry: Number(BigInt('0x' + result.slice(194, 258))),
    };
};

const metadataResponse = async (tokenIdParam, res) => {
    if (!tokenIdParam || !/^[0-9]+$/.test(tokenIdParam)) return errorResponse(res, 'INVALID TOKEN ID');

    const tokenId = BigInt(tokenIdParam);

    if (tokenId >= 2n ** 256n) return errorResponse(res, 'INVALID TOKEN ID');

    const fetchedAttributes = await getAttributes(tokenId).catch(() => errorResponse(res, 'FETCH FAIL'));

    if (!fetchedAttributes) return;

    const { tier, credits, withdrawable, expiry } = fetchedAttributes;

    const creature = CREATURES[tier];

    if (!creature) return errorResponse(res, 'INVALID TIER');

    const { name, file } = creature;

    const attributes = [
        { display_type: 'number', trait_type: 'Tier', value: tier, max_value: 13 },
        { display_type: 'number', trait_type: 'Credits', value: toDecimal(credits, 18, 0) },
        { trait_type: 'Has Locked Position', value: expiry ? 'yes' : 'no' },
    ];

    if (expiry) {
        attributes.push({ display_type: 'number', trait_type: 'Withdrawable XDEFI', value: toDecimal(withdrawable, 18, 0) });
        attributes.push({ display_type: 'date', trait_type: 'Lock Expiry', value: expiry });
    }

    const data = JSON.stringify({
        attributes,
        description: `${name} is a tier ${tier} XDEFI Badge`,
        name,
        background_color: '2040DF',
        image: `http://localhost:8000/media/${file}.png`,
        animation_url: `http://localhost:8000/media/${file}.mp4`,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
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
