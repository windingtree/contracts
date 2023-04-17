import { expect } from 'chai';
import { Wallet, Provider } from 'zksync-web3';
import * as hre from 'hardhat';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import { Market } from '../../typechain';

const TEST_PK = '0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110';
const NOT_OWNER_PK = '0xac1e735be8536c6534bb4f17f06f6afc73b2b5ba84ac2cfb12f7461b20c0bbe3';

const deployMarket = async (deployer: Deployer, owner: string): Promise<Market> => {
  const artifact = await deployer.loadArtifact('Market');
  const contract = (await deployer.deploy(artifact, [owner])) as Market;
  return contract;
};

describe('Market contract', () => {
  let provider: Provider;
  let wallet: Wallet;
  let notOwnerWallet: Wallet;
  let deployer: Deployer;
  let market: Market;

  before(() => {
    provider = Provider.getDefaultProvider();
    wallet = new Wallet(TEST_PK, provider);
    notOwnerWallet = new Wallet(NOT_OWNER_PK, provider);
    deployer = new Deployer(hre, wallet);
  });

  before(async () => {
    market = await deployMarket(deployer, wallet.address);
  });

  describe('Pausable', () => {
    after(async () => {
      if (await market.paused()) {
        await (await market.unpause()).wait();
      }
    });

    describe('#pause()', () => {
      beforeEach(async () => {
        if (await market.paused()) {
          await (await market.unpause()).wait();
        }
      });

      it('should throw if called by not an owner', async () => {
        await expect(market.connect(notOwnerWallet).pause()).to.rejectedWith(
          'Ownable: caller is not the owner',
        );
      });

      it('should pause the contract', async () => {
        expect(await market.paused()).to.be.false;
        await (await market.pause()).wait();
        expect(await market.paused()).to.be.true;
      });

      it('should throw if already paused', async () => {
        await (await market.pause()).wait();
        await expect(market.pause()).to.rejectedWith('Pausable: paused');
      });
    });

    describe('#unpause()', () => {
      beforeEach(async () => {
        if (!(await market.paused())) {
          await (await market.pause()).wait();
        }
      });

      it('should throw if called by not an owner', async () => {
        await expect(market.connect(notOwnerWallet).unpause()).to.rejectedWith(
          'Ownable: caller is not the owner',
        );
      });

      it('should unpause the contract', async () => {
        expect(await market.paused()).to.be.true;
        await (await market.unpause()).wait();
        expect(await market.paused()).to.be.false;
      });

      it('should throw if not paused', async () => {
        await (await market.unpause()).wait();
        await expect(market.unpause()).to.rejectedWith('Pausable: not paused');
      });
    });
  });
});
