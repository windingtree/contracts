/* eslint-disable @typescript-eslint/unbound-method */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  kindsArr,
  eip712name,
  eip712version,
  claimPeriod,
  protocolFee,
  retailerFee,
  minDeposit,
} from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;

  if (!['hardhat', 'localhost'].includes(network.name)) {
    return;
  }

  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();

  const PROXY_SETTINGS_WITH_UPGRADE = {
    owner,
    proxyContract: 'OpenZeppelinTransparentProxy',
  };

  // Simple ERC20 token
  const erc20 = await deploy('MockERC20Dec18', {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: 'initialize',
        args: ['STABLE', 'STABLE', owner],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (erc20.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `MockERC20Dec18 (erc20) was deployed at: ${erc20.address} using ${erc20.receipt?.gasUsed} gas`,
    );
  }

  // ERC20 token with permit
  const lif = await deploy('MockERC20Dec18Permit', {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: 'initialize',
        args: ['LifToken', 'LIF', owner],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (lif.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `MockERC20Dec18Permit (lif) was deployed at: ${lif.address} using ${lif.receipt?.gasUsed} gas`,
    );
  }

  // Protocol Config
  const protocolConfig = await deploy('Config', {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: 'initialize',
        args: [
          owner,
          lif.address,
          claimPeriod,
          protocolFee,
          retailerFee,
          owner,
          kindsArr,
          kindsArr.map(() => minDeposit), // same limit for all
        ],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (protocolConfig.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Config was deployed at: ${protocolConfig.address} using ${protocolConfig.receipt?.gasUsed} gas`,
    );
  }

  // EntitiesRegistry
  const entities = await deploy('EntitiesRegistry', {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: 'initialize',
        args: [owner, protocolConfig.address],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (entities.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `EntitiesRegistry was deployed at: ${entities.address} using ${entities.receipt?.gasUsed} gas`,
    );
  }

  // Market
  const market = await deploy('Market', {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: 'initialize',
        args: [
          owner,
          eip712name,
          eip712version,
          protocolConfig.address,
          entities.address,
        ],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (market.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Market was deployed at: ${market.address} using ${market.receipt?.gasUsed} gas`,
    );
  }
};

export default func;
func.tags = ['MockERC20Dec18', 'MockERC20Dec18Permit', 'Market'];
