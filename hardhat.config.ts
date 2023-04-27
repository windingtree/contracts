import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-solhint';
import '@nomicfoundation/hardhat-chai-matchers';
import '@openzeppelin/hardhat-upgrades';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import './tasks';
import { nodeUrl, accounts, addForkConfiguration } from './utils/network';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.19',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
    ],
  },
  namedAccounts: {
    owner: 0,
    notOwner: 1,
    buyer: 2,
    supplierOwner: 3,
    supplierSigner: 4,
  },
  networks: addForkConfiguration({
    hardhat: {
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: nodeUrl('localhost'),
      accounts: accounts(),
    },
  }),
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
    enabled: process.env.REPORT_GAS ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    maxMethodDiff: 10,
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  mocha: {
    timeout: 0,
  },
  external: process.env.HARDHAT_FORK
    ? {
        deployments: {
          hardhat: ['deployments/' + process.env.HARDHAT_FORK],
          localhost: ['deployments/' + process.env.HARDHAT_FORK],
        },
      }
    : undefined,
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
    },
  },
};

export default config;
