import { HardhatUserConfig } from 'hardhat/config.js';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-solc';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-solhint';
import '@typechain/hardhat';

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
    zkSyncTestnet: {
      url: 'https://zksync2-testnet.zksync.dev',
      ethNetwork: 'goerli', // Can also be the RPC URL of the network (e.g. `https://goerli.infura.io/v3/<API_KEY>`)
      zksync: true,
    },
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
