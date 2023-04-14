import { expect } from 'chai';
import { Wallet, Provider } from 'zksync-web3';
import * as hre from 'hardhat';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import { Market } from '../../typechain';

const TEST_PK = '0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110';

const deployMarket = async (deployer: Deployer): Promise<Market> => {
  const artifact = await deployer.loadArtifact('Market');
  const contract = await deployer.deploy(artifact);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return contract as Market;
};

describe('Market contract', () => {
  let provider: Provider;
  let wallet: Wallet;
  let deployer: Deployer;
  let market: Market;

  // eslint-disable-next-line @typescript-eslint/require-await
  before(async () => {
    provider = Provider.getDefaultProvider();
    wallet = new Wallet(TEST_PK, provider);
    deployer = new Deployer(hre, wallet);
  });

  beforeEach(async () => {
    market = await deployMarket(deployer);
  });

  describe('Pausable', () => {
    describe('#pause()', () => {
      it('should pause the contract', async () => {
        expect(await market.paused()).to.be.false;
        await market.pause();
        expect(await market.paused()).to.be.true;
      });
    });
  });
});
