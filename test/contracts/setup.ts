import { expect } from 'chai';
import {
  MockERC20Dec18,
  MockERC20Dec18Permit,
  Market,
  Config,
  EntitiesRegistry,
} from '../../typechain';
import { ethers, deployments, getNamedAccounts } from 'hardhat';
import { BigNumber, Contract, VoidSigner } from 'ethers';
import { protocolFee, retailerFee, minDeposit } from '../../utils/constants';
import { structEqual, createSupplierId } from './utils';

export interface Contracts {
  erc20: MockERC20Dec18;
  lif: MockERC20Dec18Permit;
  config: Config;
  entities: EntitiesRegistry;
  market: Market;
}

export type User = {
  address: string;
  signer: VoidSigner;
} & Contracts;

export type Users = Record<string, User>;

export const setupUser = async (
  address: string,
  contracts: Record<string, Contract>,
): Promise<User> => {
  const signer = await ethers.getSigner(address);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = { address, signer };

  for (const key of Object.keys(contracts)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    user[key] = contracts[key].connect(signer);
  }

  return user as User;
};

export const setupUsers = async (
  namedUsers: Record<string, string>, // name => address
  contracts: Record<string, Contract>, // contractName => Contract
): Promise<Users> => {
  const users: Users = {};

  for (const [name, address] of Object.entries(namedUsers)) {
    users[name] = await setupUser(address, contracts);
  }

  return users;
};

export const setup = deployments.createFixture(async () => {
  await deployments.fixture('Market');

  const contracts = {
    erc20: <MockERC20Dec18>await ethers.getContract('MockERC20Dec18'),
    lif: <MockERC20Dec18Permit>await ethers.getContract('MockERC20Dec18Permit'),
    config: <Config>await ethers.getContract('Config'),
    entities: <EntitiesRegistry>await ethers.getContract('EntitiesRegistry'),
    market: <Market>await ethers.getContract('Market'),
  };

  const users = await setupUsers(await getNamedAccounts(), contracts);

  return {
    ...contracts,
    users,
  };
});

export const registerEntity = async (
  owner: User,
  signer: User,
  kind: string,
  salt: string,
  lif?: MockERC20Dec18Permit,
  enable = true,
) => {
  const supplierId = createSupplierId(owner.address, salt);
  const tx = await owner.entities.register(kind, salt, signer.address);
  await expect(tx)
    .to.emit(owner.entities, 'EntityRegistered')
    .withArgs(owner.address, supplierId);
  structEqual(
    await owner.entities.getEntity(supplierId),
    {
      id: supplierId,
      owner: owner.address,
      enabled: false,
      signer: signer.address,
    },
    'Entity',
  );
  if (lif) {
    await lif.approve(owner.entities.address, minDeposit);
    await owner.entities['addDeposit(bytes32,uint256)'](supplierId, minDeposit);
  }
  if (enable) {
    await owner.entities.toggleEntity(supplierId);
  }
};

export const calcFees = (value: BigNumber) => {
  const percentage = (val: BigNumber, perc: BigNumber) =>
    val.mul(1000).mul(perc).div(100).div(1000);
  const protocolFeeValue = percentage(value, protocolFee);
  const retailerFeeValue = percentage(value, retailerFee);
  const supplierValue = value.sub(protocolFee).sub(retailerFee);

  return { protocolFeeValue, retailerFeeValue, supplierValue };
};
