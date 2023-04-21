import { expect } from 'chai';
import { Wallet, Provider } from 'zksync-web3';
import * as hre from 'hardhat';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import { Market, MockERC20Dec18 } from '../../typechain';
import { structEqual, Offer, buildRandomOffer } from './utils';
import { constants } from 'ethers';

const eip712name = 'Market';
const eip712version = '1';
const TEST_PK = '0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110';
const NOT_OWNER_PK = '0xac1e735be8536c6534bb4f17f06f6afc73b2b5ba84ac2cfb12f7461b20c0bbe3';
const BUYER_PK = '0xac1e735be8536c6534bb4f17f06f6afc73b2b5ba84ac2cfb12f7461b20c0bbe3';
const SUPPLIER_PK = '0xd293c684d884d56f8d6abd64fc76757d3664904e309a0645baf8522ab6366d9e';

const deployErc20 = async (
  deployer: Deployer,
  owner: string,
): Promise<MockERC20Dec18> => {
  const artifact = await deployer.loadArtifact('MockERC20Dec18');
  const contract = (await deployer.deploy(artifact, [
    'STABLE',
    'STABLE',
    owner,
  ])) as MockERC20Dec18;
  return contract;
};

const deployMarket = async (deployer: Deployer, owner: string): Promise<Market> => {
  const artifact = await deployer.loadArtifact('Market');
  const contract = (await deployer.deploy(artifact, [
    owner,
    eip712name,
    eip712version,
  ])) as Market;
  return contract;
};

describe('Market contract', () => {
  let provider: Provider;
  let wallet: Wallet;
  let notOwnerWallet: Wallet;
  let buyerWallet: Wallet;
  let supplierWallet: Wallet;
  let deployer: Deployer;
  let market: Market;
  let erc20: MockERC20Dec18;

  before(() => {
    provider = Provider.getDefaultProvider();
    wallet = new Wallet(TEST_PK, provider);
    notOwnerWallet = new Wallet(NOT_OWNER_PK, provider);
    buyerWallet = new Wallet(BUYER_PK, provider);
    supplierWallet = new Wallet(SUPPLIER_PK, provider);
    deployer = new Deployer(hre, wallet);
  });

  before(async () => {
    market = await deployMarket(deployer, wallet.address);
    erc20 = await deployErc20(deployer, wallet.address);
    await (await erc20.mint(buyerWallet.address, '1000000000000000000000000')).wait();
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

  describe('DealsRegistry', () => {
    let offer: Offer;

    before(async () => {
      offer = await buildRandomOffer(
        supplierWallet,
        'Market',
        '1',
        (
          await market.provider.getNetwork()
        ).chainId,
        market.address,
        erc20.address,
      );
    });

    it('should throw if invalid payment options provided', async () => {
      await expect(
        (
          await market
            .connect(buyerWallet)
            .deal(offer.payload, [], offer.payment[0].id, [offer.signature], {
              gasLimit: 5000000,
            })
        ).wait(),
      ).to.rejected; //revertedWithCustomError(market, 'InvalidPaymentOptions');
    });

    it('should throw if invalid payment option Id provided', async () => {
      await expect(
        (
          await market
            .connect(buyerWallet)
            .deal(offer.payload, offer.payment, constants.HashZero, [offer.signature], {
              gasLimit: 5000000,
            })
        ).wait(),
      ).to.rejected; //revertedWithCustomError(market, 'InvalidPaymentId');
    });

    it('should create a deal', async () => {
      await (
        await erc20.connect(buyerWallet).approve(market.address, offer.payment[0].price)
      ).wait();
      const balanceOfBuyer = await erc20.balanceOf(buyerWallet.address);
      const balanceOfMarket = await erc20.balanceOf(market.address);

      const tx = await market
        .connect(buyerWallet)
        .deal(offer.payload, offer.payment, offer.payment[0].id, [offer.signature]);
      await tx.wait();
      await expect(tx)
        .to.emit(market, 'DealCreated')
        .withArgs(offer.payload.id, buyerWallet.address);

      const {
        offer: contractOffer,
        price,
        asset,
        status,
      } = await market.deals(offer.payload.id);
      structEqual(contractOffer, offer.payload);
      expect(price).to.eq(offer.payment[0].price);
      expect(asset).to.eq(offer.payment[0].asset);
      expect(status).to.eq(0);

      expect(await erc20.balanceOf(buyerWallet.address)).to.eq(
        balanceOfBuyer.sub(offer.payment[0].price),
      );
      expect(await erc20.balanceOf(market.address)).to.eq(
        balanceOfMarket.add(offer.payment[0].price),
      );
    });

    it('should throw if attempting to create the same deal', async () => {
      await expect(
        (
          await market
            .connect(buyerWallet)
            .deal(offer.payload, offer.payment, offer.payment[0].id, [offer.signature], {
              gasLimit: 5000000,
            })
        ).wait(),
      ).to.rejected; //revertedWithCustomError(market, 'DealExists');
    });
  });
});
