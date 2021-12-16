# xdefi-distribution

Setup with `npm install` or `npm ci`.

Test with `npx hardhat test`.

Coverage with `npx hardhat coverage`.

Ensure a `./secrets.json` exists with:
```json
{
    "networkName1": {
        "mnemonic": "some mnemonic",
        "xdefi": "address of XDEFI token",
        "rpc": "HTTPS RPC URL",
        "baseURI": "Base URI for NFTs"
    },
    "networkName2": {...},
    "networkName3": {...}
}
```

Deploy with `npx hardhat run scripts/deploy.js --network networkName`.
