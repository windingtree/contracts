import { Config as WagmiConfig, ContractConfig } from '@wagmi/cli';
import { Abi } from 'abitype';
// import { react } from '@wagmi/cli/plugins';
// import { actions } from '@wagmi/cli/plugins'

import Config from './artifacts/contracts/Config.sol/Config.json';
import EntitiesRegistry from './artifacts/contracts/EntitiesRegistry.sol/EntitiesRegistry.json';
import Market from './artifacts/contracts/Market.sol/Market.json';
import ERC20_18_Permit from './artifacts/contracts/test/MockERC20Dec18Permit.sol/MockERC20Dec18Permit.json';
import ERC20_18 from './artifacts/contracts/test/MockERC20Dec18.sol/MockERC20Dec18.json';
import ERC20_6_Permit from './artifacts/contracts/test/MockERC20Dec6Permit.sol/MockERC20Dec6Permit.json';
import ERC20_6 from './artifacts/contracts/test/MockERC20Dec6.sol/MockERC20Dec6.json';

type Artifacts = Record<string, any>;

const artifacts: Artifacts = {
  Config,
  EntitiesRegistry,
  Market,
  ERC20_18_Permit,
  ERC20_18,
  ERC20_6_Permit,
  ERC20_6,
};

const createContractConfig = (artifacts: Artifacts): ContractConfig[] =>
  Object.entries(artifacts).map((a) => ({
    name: a[0],
    abi: a[1].abi as Abi,
  }));

const config: WagmiConfig = {
  out: './wagmi/index.ts',
  contracts: createContractConfig(artifacts),
  plugins: [
    // actions({
    //   getContract: true,
    //   readContract: true,
    //   prepareWriteContract: true,
    //   writeContract: true,
    //   watchContractEvent: true,
    // }),
    // react({
    //   useContractRead: true,
    //   useContractFunctionRead: true,
    //   usePrepareContractFunctionWrite: true,
    // }),
  ],
};

export default config;
