/* eslint-disable @typescript-eslint/unbound-method */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  eip712name,
  eip712version,
  claimPeriod,
  protocolFee,
  retailerFee,
  minDeposit,
} from '../test/contracts/setup';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;

  if (!['hardhat', 'localhost'].includes(network.name)) {
    return;
  }

  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();

  // Simple ERC20 token
  const erc20 = await deploy('MockERC20Dec18', {
    from: owner,
    args: ['STABLE', 'STABLE', owner],
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
    from: owner,
    args: ['LIF', 'LIF', owner],
    log: true,
    autoMine: true,
  });

  if (lif.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `MockERC20Dec18Permit (lif) was deployed at: ${lif.address} using ${lif.receipt?.gasUsed} gas`,
    );
  }

  // Market
  const market = await deploy('Market', {
    from: owner,
    args: [
      owner,
      eip712name,
      eip712version,
      claimPeriod,
      protocolFee,
      retailerFee,
      owner,
      lif.address,
      minDeposit,
    ],
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
