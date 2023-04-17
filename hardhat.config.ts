import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config.js';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-solc';
import '@matterlabs/hardhat-zksync-chai-matchers';
import '@matterlabs/hardhat-zksync-verify';
import '@nomiclabs/hardhat-solhint';
import '@typechain/hardhat';

if (!process.env.INFURA_API_KEY) {
  throw new Error('INFURA_API_KEY must be provided with .env');
}

const zkSyncTestnet =
  process.env.NODE_ENV === 'test'
    ? {
        url: 'http://localhost:3050',
        ethNetwork: 'http://localhost:8545',
        zksync: true,
      }
    : {
        url: 'https://zksync2-testnet.zksync.dev',
        ethNetwork: 'goerli',
        zksync: true,
      };

const config: HardhatUserConfig = {
  zksolc: {
    version: '1.3.8',
    compilerSource: 'binary',
    settings: {
      isSystem: true,
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      zksync: true,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      zksync: false,
    },
    zkSyncTestnet,
  },
  solidity: {
    version: '0.8.19',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
};

export default config;
