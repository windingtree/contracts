/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  DeployFunction,
  DeployOptions,
  DeployResult,
} from "hardhat-deploy/types";
import {
  kindsArr,
  eip712name,
  eip712version,
  claimPeriod,
  protocolFee,
  retailerFee,
  minDeposit,
} from "../utils/constants";

const setupToken = async (
  proxySettings: { owner: string; proxyContract: string },
  owner: string,
  deploy: (name: string, options: DeployOptions) => Promise<DeployResult>,
  name: string,
  contractName: string,
  tokenName: string,
  tokenSymbol: string
): Promise<DeployResult> => {
  const options: DeployOptions = {
    contract: contractName,
    proxy: {
      ...proxySettings,
      execute: {
        methodName: "initialize",
        args: [tokenName, tokenSymbol, owner],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  };
  const token = await deploy(name, options);

  if (token.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${tokenSymbol} token deployed at ${token.address} using ${token.receipt?.gasUsed} gas`
    );
  }

  return token;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;

  if (!["polzktest"].includes(network.name)) {
    return;
  }

  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();

  console.log(`Deployer: ${owner}`);

  const PROXY_SETTINGS_WITH_UPGRADE = {
    owner,
    proxyContract: "OpenZeppelinTransparentProxy",
  };

  // Setup testing stable coins

  // STABLE Decimals 6 no permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE6",
    "MockERC20Dec6",
    "Stable6NoPermit",
    "STABLE6"
  );

  // STABLE Decimals 6 with permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE6PERMIT",
    "MockERC20Dec6Permit",
    "Stable6Permit",
    "STABLE6PERMIT"
  );

  // STABLE Decimals 18 no permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE18",
    "MockERC20Dec18",
    "Stable18NoPermit",
    "STABLE18"
  );

  // STABLE Decimals 18 with permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE18PERMIT",
    "MockERC20Dec18Permit",
    "Stable18Permit",
    "STABLE18PERMIT"
  );

  // Setup LIF
  const lif = await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "LIF",
    "MockERC20Dec18Permit",
    "LifToken",
    "LIF"
  );

  // Protocol Config
  const protocolConfig = await deploy("Config", {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: "initialize",
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
      `Config was deployed at: ${protocolConfig.address} using ${protocolConfig.receipt?.gasUsed} gas`
    );
  }

  // EntitiesRegistry
  const entities = await deploy("EntitiesRegistry", {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: "initialize",
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
      `EntitiesRegistry was deployed at: ${entities.address} using ${entities.receipt?.gasUsed} gas`
    );
  }

  // Market
  const market = await deploy("Market", {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: "initialize",
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
      `Market was deployed at: ${market.address} using ${market.receipt?.gasUsed} gas`
    );
  }
};

export default func;
func.tags = ["MockERC20Dec18Permit", "Market"];
