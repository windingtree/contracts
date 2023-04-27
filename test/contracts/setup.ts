import { MockERC20Dec18, MockERC20Dec18Permit, Market } from '../../typechain';
import { ethers, deployments, getNamedAccounts } from 'hardhat';
import { BigNumber, Contract, VoidSigner } from 'ethers';

export interface Contracts {
  erc20: MockERC20Dec18;
  lif: MockERC20Dec18Permit;
  market: Market;
}

export type User = {
  address: string;
  signer: VoidSigner;
} & Contracts;

export type Users = Record<string, User>;

export const eip712name = 'Market';
export const eip712version = '1';
export const minDeposit = BigNumber.from('1000000000000000000000');

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
    market: <Market>await ethers.getContract('Market'),
  };

  const users = await setupUsers(await getNamedAccounts(), contracts);

  return {
    ...contracts,
    users,
  };
});
