import { MockERC20Dec18, MockERC20Dec18Permit, Market } from '../../typechain';
import { ethers, deployments, getNamedAccounts } from 'hardhat';
import { BigNumber, Contract, VoidSigner } from 'ethers';
import { structEqual, createSupplierId } from './utils';

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
export const claimPeriod = BigNumber.from('60');
export const protocolFee = BigNumber.from('1');
export const retailerFee = BigNumber.from('1');

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

export const registerSupplier = async (
  market: Market,
  supplierSalt: string,
  supplierOwner: User,
  supplierSigner: User,
  lif?: MockERC20Dec18Permit,
  enable = true,
) => {
  await market.register(supplierSalt, supplierSigner.address);
  const supplierId = createSupplierId(supplierOwner.address, supplierSalt);
  structEqual(await market.suppliers(supplierId), {
    id: supplierId,
    owner: supplierOwner.address,
    enabled: false,
    signer: supplierSigner.address,
  });
  if (lif) {
    await lif.approve(market.address, minDeposit);
    await market['addDeposit(bytes32,uint256)'](supplierId, minDeposit);
  }
  if (enable) {
    await market.toggleSupplier(supplierId);
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
