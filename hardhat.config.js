require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require('solidity-coverage');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        version: "0.8.10",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
                details: {
                    peephole: true,
                    inliner: true,
                    jumpdestRemover: true,
                    orderLiterals: true,
                    deduplicate: true,
                    cse: true,
                    constantOptimizer: true,
                    yul: true,
                    yulDetails: {
                        stackAllocation: true
                    }
                }
            }
        }
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {},
        ropsten: {
        url: require('./.secrets.json').ropsten.rpc,
            accounts: {
                mnemonic: require('./.secrets.json').ropsten.mnemonic,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 1,
            },
        }
    },
};
