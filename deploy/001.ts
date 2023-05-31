/* eslint-disable @typescript-eslint/unbound-method */
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  DeployFunction,
  DeployOptions,
  DeployResult,
} from "hardhat-deploy/types";
import { MockERC20Dec18, EntitiesRegistry } from "../typechain";
import { ethers } from "hardhat";
import {
  kindsArr,
  eip712name,
  eip712version,
  claimPeriod,
  protocolFee,
  retailerFee,
  minDeposit,
  createSupplierId,
  kinds,
} from "../utils";

const setupToken = async (
  proxySettings: { owner: string; proxyContract: string },
  owner: string,
  deploy: (name: string, options: DeployOptions) => Promise<DeployResult>,
  name: string,
  contractName: string,
  tokenName: string,
  tokenSymbol: string,
  networkName: string
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

  if (networkName === "hardhat") {
    const tokenContract = <MockERC20Dec18>await ethers.getContract(name);
    const signer = await ethers.getSigner(owner);
    tokenContract.connect(signer);
    await Promise.all(
      ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"].map((addr) =>
        tokenContract.mint(addr, "1000000000000000000000000")
      )
    );
  }

  return token;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;

  if (!["hardhat", "localhost"].includes(network.name)) {
    return;
  }

  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();

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
    "STABLE6",
    network.name
  );

  // STABLE Decimals 6 with permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE6PERMIT",
    "MockERC20Dec6Permit",
    "Stable6Permit",
    "STABLE6PERMIT",
    network.name
  );

  // STABLE Decimals 18 no permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE18",
    "MockERC20Dec18",
    "Stable18NoPermit",
    "STABLE18",
    network.name
  );

  // STABLE Decimals 18 with permit
  await setupToken(
    PROXY_SETTINGS_WITH_UPGRADE,
    owner,
    deploy,
    "STABLE18PERMIT",
    "MockERC20Dec18Permit",
    "Stable18Permit",
    "STABLE18PERMIT",
    network.name
  );

  // Simple ERC20 token
  const erc20 = await deploy("MockERC20Dec18", {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: "initialize",
        args: ["STABLE", "STABLE", owner],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (erc20.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `MockERC20Dec18 (erc20) was deployed at: ${erc20.address} using ${erc20.receipt?.gasUsed} gas`
    );
  }

  // ERC20 token with permit
  const lif = await deploy("MockERC20Dec18Permit", {
    proxy: {
      ...PROXY_SETTINGS_WITH_UPGRADE,
      execute: {
        methodName: "initialize",
        args: ["LifToken", "LIF", owner],
      },
    },
    from: owner,
    log: true,
    autoMine: true,
  });

  if (lif.newlyDeployed) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `MockERC20Dec18Permit (lif) was deployed at: ${lif.address} using ${lif.receipt?.gasUsed} gas`
    );

    if (network.name === "hardhat") {
      const lifContract = <MockERC20Dec18>(
        await ethers.getContract("MockERC20Dec18Permit")
      );
      const signer = await ethers.getSigner(owner);
      lifContract.connect(signer);
      await Promise.all(
        ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"].map((addr) =>
          lifContract.mint(addr, "1000000000000000000000000")
        )
      );
    }
  }

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

    if (network.name === "hardhat") {
      const supplierOwner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const supplierSalt =
        "0x4c51462692236a1cc8dcde78386cb02a1a59828a92932336770a08cae542c2e8";
      const supplierId = createSupplierId(
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        supplierSalt
      );

      const entities = <EntitiesRegistry>(
        await ethers.getContract("EntitiesRegistry")
      );
      const signer = await ethers.getSigner(owner);
      entities.connect(signer);

      await entities.register(
        kinds.supplier,
        supplierSalt,
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
      );
      console.log(`Registered supplier #${supplierId}`);

      const supplierSigner = await ethers.getSigner(supplierOwner);
      entities.connect(supplierSigner);

      const lifContract = <MockERC20Dec18>(
        await ethers.getContract("MockERC20Dec18Permit")
      );
      lifContract.connect(supplierSigner);

      await lifContract.approve(entities.address, minDeposit);

      await entities["addDeposit(bytes32,uint256)"](supplierId, minDeposit);

      console.log(`LIF deposit added for supplier #${supplierId}`);

      await entities.toggleEntity(supplierId);

      console.log(`Enabled supplier #${supplierId}`);
    }
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
func.tags = ["MockERC20Dec18", "MockERC20Dec18Permit", "Market"];
