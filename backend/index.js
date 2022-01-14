const http = require("http");
const url = require('url');
const fs = require('fs');
const path = require('path');

const host = 'localhost';
const port = 8000;

const errorResponse = (res) => {
    res.writeHead(400);
    res.end()
};

const getMedia = (tier) => {
    if (tier == 1) return 'IKALGO';

    if (tier == 2) return 'OXTOPUS';

    if (tier == 3) return 'NAUTILUS';

    if (tier == 4) return 'KAURNA';

    if (tier == 5) return 'HALIPHRON';

    if (tier == 6) return 'KANALOA';

    if (tier == 7) return 'TANIWHA';

    if (tier == 8) return 'CTHULHU';

    if (tier == 9) return 'YAKUMAMA';

    if (tier == 10) return 'HAFGUFA';

    if (tier == 11) return 'AKKOROKAMUI';

    if (tier == 12) return 'NESSIE';

    if (tier == 13) return 'THE_KRAKEN';

    throw Error('Invalid Tier');
};

const getScore = (xdefi, days) => {
    return 1_000_000_000_000_000_000n * BigInt(xdefi) * 86_400n * BigInt(days);
}

const getTier = (score) => {
    if (score <= getScore(50, 30)) return 1;

    if (score <= getScore(100, 30)) return 2;

    if (score <= getScore(200, 30)) return 3;

    if (score <= getScore(400, 30)) return 4;

    if (score <= getScore(800, 30)) return 5;

    if (score <= getScore(1_600, 30)) return 6;

    if (score <= getScore(3_200, 30)) return 7;

    if (score <= getScore(6_400, 30)) return 8;

    if (score <= getScore(12_800, 30)) return 9;

    if (score <= getScore(25_600, 30)) return 10;

    if (score <= getScore(51_200, 30)) return 11;

    if (score <= getScore(102_400, 30)) return 12;

    return 13;
};

const getMetadata = (tokenId) => {
    const mintSequence = tokenId & ((2n ** 128n) - 1n);
    const score = tokenId >> 128n;
    const tier = getTier(score);

    return JSON.stringify({
        attributes: [
            { display_type: 'number', trait_type: 'score', value: score.toString() },
            { display_type: 'number', trait_type: 'tier', value: tier },
            { display_type: 'number', trait_type: 'sequence', value: mintSequence.toString() },
        ],
        description: "XDEFIDistribution Position",
        name: "XDEFIDistribution Position",
        animation_url: `http://localhost:8000/media/${getMedia(tier)}.mp4`,
    });
};

const metadataResponse = (tokenIdParam, res) => {
    if (!tokenIdParam || !/^[0-9]+$/.test(tokenIdParam)) return errorResponse(res);

    const tokenId = BigInt(tokenIdParam);

    if (tokenId >= (2n ** 256n)) return errorResponse(res);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(getMetadata(tokenId));
};

const imageResponse = (imageName, res) => {
    const filePath = path.join(__dirname, `media/${imageName}`);

    fs.readFile(filePath, (err, content) => {
        if (err) return errorResponse(res);

        res.writeHead(200, { 'Content-type': 'video/mp4' });
        res.end(content);
    });
};

const requestListener = function (req, res) {
    const urlParts = url.parse(req.url, false).path.split('/');

    if (urlParts.length <= 1) return errorResponse(res);

    if (urlParts[1] === 'media' && urlParts.length === 3) return imageResponse(urlParts[2], res);

    if (urlParts.length === 2) return metadataResponse(urlParts[1], res);

    return errorResponse(res);
};

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
