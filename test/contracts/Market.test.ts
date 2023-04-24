/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { Wallet, Provider } from 'zksync-web3';
import * as hre from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import richWallets from '../../network/rich-wallets.json';
import { Market, MockERC20Dec18, MockERC20Dec18Permit } from '../../typechain';
import {
  structEqual,
  Offer,
  buildRandomOffer,
  randomId,
  createSupplierId,
  createPermitSignature,
} from './utils';

const eip712name = 'Market';
const eip712version = '1';
const minDeposit = BigNumber.from('1000000000000000000000');

const createWallets = (provider: Provider): Wallet[] =>
  richWallets.map((account) => new Wallet(account.privateKey, provider));

const deployErc20 = async (
  deployer: Deployer,
  owner: string,
  symbol: string,
): Promise<MockERC20Dec18> => {
  const artifact = await deployer.loadArtifact('MockERC20Dec18');
  const contract = (await deployer.deploy(artifact, [
    symbol,
    symbol,
    owner,
  ])) as MockERC20Dec18;
  return contract;
};

const deployErc20Permit = async (
  deployer: Deployer,
  owner: string,
  symbol: string,
): Promise<MockERC20Dec18Permit> => {
  const artifact = await deployer.loadArtifact('MockERC20Dec18Permit');
  const contract = (await deployer.deploy(artifact, [
    symbol,
    symbol,
    owner,
  ])) as MockERC20Dec18Permit;
  return contract;
};

const deployMarket = async (
  deployer: Deployer,
  owner: string,
  lif: MockERC20Dec18Permit,
): Promise<Market> => {
  const artifact = await deployer.loadArtifact('Market');
  const contract = (await deployer.deploy(artifact, [
    owner,
    eip712name,
    eip712version,
    lif.address,
    minDeposit,
  ])) as Market;
  return contract;
};

const registerSupplier = async (
  market: Market,
  supplierSalt: string,
  supplierOwnerWallet: Wallet,
  supplierSignerWallet: Wallet,
  lif?: MockERC20Dec18Permit,
  enable = true,
) => {
  await (
    await market
      .connect(supplierOwnerWallet)
      .register(supplierSalt, supplierSignerWallet.address)
  ).wait();
  const supplierId = createSupplierId(supplierOwnerWallet.address, supplierSalt);
  structEqual(await market.suppliers(supplierId), {
    id: supplierId,
    owner: supplierOwnerWallet.address,
    enabled: false,
    signer: supplierSignerWallet.address,
  });
  if (lif) {
    await (
      await lif.connect(supplierOwnerWallet).approve(market.address, minDeposit)
    ).wait();
    await (
      await market
        .connect(supplierOwnerWallet)
        ['addDeposit(bytes32,uint256)'](supplierId, minDeposit)
    ).wait();
  }
  if (enable) {
    await (await market.connect(supplierOwnerWallet).toggleSupplier(supplierId)).wait();
  }
};

describe('Market contract', () => {
  let provider: Provider;
  let deployerWallet: Wallet;
  let notOwnerWallet: Wallet;
  let buyerWallet: Wallet;
  let supplierOwnerWallet: Wallet;
  let supplierSignerWallet: Wallet;
  let deployer: Deployer;
  let market: Market;
  let erc20: MockERC20Dec18;
  let lif: MockERC20Dec18Permit;

  before(() => {
    provider = Provider.getDefaultProvider();
    [
      deployerWallet,
      notOwnerWallet,
      buyerWallet,
      supplierOwnerWallet,
      supplierSignerWallet,
    ] = createWallets(provider);
    deployer = new Deployer(hre, deployerWallet);
  });

  before(async () => {
    erc20 = await deployErc20(deployer, deployerWallet.address, 'STABLE');
    lif = await deployErc20Permit(deployer, deployerWallet.address, 'LIF');
    market = await deployMarket(deployer, deployerWallet.address, lif);
    await (await erc20.mint(buyerWallet.address, '1000000000000000000000000')).wait();
    await (
      await lif.mint(supplierOwnerWallet.address, '1000000000000000000000000')
    ).wait();
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

  describe('SuppliersRegistry', () => {
    let supplierSalt: string;
    let supplierId: string;

    beforeEach(async () => {
      supplierSalt = randomId();
      supplierId = createSupplierId(supplierOwnerWallet.address, supplierSalt);

      await registerSupplier(
        market,
        supplierSalt,
        supplierOwnerWallet,
        supplierSignerWallet,
        lif,
        false,
      );
    });

    describe('#toggleSupplier(bytes32); #isSupplierEnabled(bytes32)', () => {
      it('should throw if called not by a owner', async () => {
        await expect(
          (
            await market.connect(deployerWallet).toggleSupplier(supplierId, {
              gasLimit: 5000000,
            })
          ).wait(),
        ).to.rejected;
      });

      it('should toggle the supplier state', async () => {
        expect(await market.isSupplierEnabled(supplierId)).to.false;
        await (
          await market.connect(supplierOwnerWallet).toggleSupplier(supplierId)
        ).wait();
        expect(await market.isSupplierEnabled(supplierId)).to.true;
      });
    });

    describe('#changeSigner(bytes32,address)', () => {
      it('should throw if called not by a owner', async () => {
        await expect(
          (
            await market
              .connect(deployerWallet)
              .changeSigner(supplierId, deployerWallet.address, {
                gasLimit: 5000000,
              })
          ).wait(),
        ).to.rejected;
      });

      it('should change the supplier signer', async () => {
        let supplier = await market.suppliers(supplierId);
        expect(supplier.signer).to.eq(supplierSignerWallet.address);
        await (
          await market
            .connect(supplierOwnerWallet)
            .changeSigner(supplierId, deployerWallet.address)
        ).wait();
        supplier = await market.suppliers(supplierId);
        expect(supplier.signer).to.eq(deployerWallet.address);
      });
    });

    describe('#register(bytes32,address)', () => {
      it('should register the supplier', async () => {
        const supplier = await market.suppliers(supplierId);
        expect(supplier.id).to.eq(supplierId);
      });

      it('should be initially disabled', async () => {
        expect(await market.isSupplierEnabled(supplierId)).to.false;
      });

      it('should throw on attempt to register twice', async () => {
        await expect(
          (
            await market
              .connect(supplierOwnerWallet)
              .register(supplierSalt, supplierSignerWallet.address, {
                gasLimit: 5000000,
              })
          ).wait(),
        ).to.rejected; //revertedWithCustomError(market, 'SupplierRegistered');
      });
    });

    describe('#addDeposit(bytes32,uit256,bytes); #balanceOfSupplier(bytes32)', () => {
      it('should throw if deposit value to small', async () => {
        const supplierSalt = randomId();
        const supplierId = createSupplierId(supplierOwnerWallet.address, supplierSalt);

        await registerSupplier(
          market,
          supplierSalt,
          supplierOwnerWallet,
          supplierSignerWallet,
          undefined,
          false,
        );

        const notEnoughValue = minDeposit.sub(BigNumber.from('1'));

        await (
          await lif.connect(supplierOwnerWallet).approve(market.address, notEnoughValue)
        ).wait();
        await expect(
          (
            await market
              .connect(supplierOwnerWallet)
              ['addDeposit(bytes32,uint256)'](supplierId, notEnoughValue, {
                gasLimit: 5000000,
              })
          ).wait(),
        ).to.rejected;
      });

      it('should throw if tokens not approved', async () => {
        await expect(
          (
            await market
              .connect(supplierOwnerWallet)
              ['addDeposit(bytes32,uint256)'](supplierId, '1', {
                gasLimit: 5000000,
              })
          ).wait(),
        ).to.rejected;
      });

      it('should add deposit', async () => {
        expect(await market.balanceOfSupplier(supplierId)).to.eq(minDeposit);
        const value = BigNumber.from('1');
        await (
          await lif.connect(supplierOwnerWallet).approve(market.address, value)
        ).wait();
        await (
          await market
            .connect(supplierOwnerWallet)
            ['addDeposit(bytes32,uint256)'](supplierId, value)
        ).wait();
        expect(await market.balanceOfSupplier(supplierId)).to.eq(minDeposit.add(value));
      });

      it.skip('should throw if invalid permit signature provided', async () => {
        //
      });

      it.skip('should add deposit using permit', async () => {
        const value = BigNumber.from('1');
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        const signature = await createPermitSignature(
          supplierOwnerWallet,
          lif,
          supplierOwnerWallet.address,
          market.address,
          value,
          deadline,
        );

        expect(await market.balanceOfSupplier(supplierId)).to.eq(minDeposit);
        await (
          await market
            .connect(supplierOwnerWallet)
            ['addDeposit(bytes32,uint256,uint256,bytes)'](
              supplierId,
              value,
              deadline,
              signature,
              {
                gasLimit: 5000000,
              },
            )
        ).wait();
        expect(await market.balanceOfSupplier(supplierId)).to.eq(minDeposit.add(value));
      });
    });

    describe('#withdrawDeposit(bytes32,uit256,bytes)', () => {
      it('should throw if balance not enough', async () => {
        const balance = await market.balanceOfSupplier(supplierId);
        await expect(
          (
            await market
              .connect(supplierOwnerWallet)
              .withdrawDeposit(supplierId, balance.add(BigNumber.from('1')), {
                gasLimit: 5000000,
              })
          ).wait(),
        ).to.rejected;
      });

      it('should withdraw deposit', async () => {
        expect(await market.balanceOfSupplier(supplierId)).to.eq(minDeposit);
        await (
          await market
            .connect(supplierOwnerWallet)
            .withdrawDeposit(supplierId, minDeposit)
        ).wait();
        expect(await market.balanceOfSupplier(supplierId)).to.eq(constants.Zero);
      });
    });
  });

  describe('DealsRegistry', () => {
    let supplierId: string;
    let offer: Offer;
    let offerNotRegistered: Offer;

    before(async () => {
      const supplierSalt = randomId();
      supplierId = createSupplierId(supplierOwnerWallet.address, supplierSalt);

      await registerSupplier(
        market,
        supplierSalt,
        supplierOwnerWallet,
        supplierSignerWallet,
        lif,
      );

      offer = await buildRandomOffer(
        supplierId,
        supplierSignerWallet,
        'Market',
        '1',
        (
          await market.provider.getNetwork()
        ).chainId,
        market.address,
        erc20.address,
      );

      offerNotRegistered = await buildRandomOffer(
        randomId(),
        supplierSignerWallet,
        'Market',
        '1',
        (
          await market.provider.getNetwork()
        ).chainId,
        market.address,
        erc20.address,
      );
    });

    describe('#deal(**)', () => {
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
          buyer,
          price,
          asset,
          status,
        } = await market.deals(offer.payload.id);
        expect(buyer).to.eq(buyerWallet.address);
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
              .deal(
                offer.payload,
                offer.payment,
                offer.payment[0].id,
                [offer.signature],
                {
                  gasLimit: 5000000,
                },
              )
          ).wait(),
        ).to.rejected; //revertedWithCustomError(market, 'DealExists');
      });

      it('should throw if supplier of the offer is not registered', async () => {
        await expect(
          (
            await market
              .connect(buyerWallet)
              .deal(
                offerNotRegistered.payload,
                offerNotRegistered.payment,
                offerNotRegistered.payment[0].id,
                [offerNotRegistered.signature],
                {
                  gasLimit: 5000000,
                },
              )
          ).wait(),
        ).to.rejected; //revertedWithCustomError(market, 'InvalidSupplier');
      });

      it('should throw if invalid signature provided', async () => {
        await expect(
          (
            await market.connect(buyerWallet).deal(
              offer.payload,
              offer.payment,
              offer.payment[0].id,
              [offerNotRegistered.signature], // Invalid
              {
                gasLimit: 5000000,
              },
            )
          ).wait(),
        ).to.rejected; //revertedWithCustomError(market, 'InvalidOfferSignature');
      });

      it('should throw if supplier of the offer is disabled', async () => {
        await (
          await market
            .connect(supplierOwnerWallet)
            .toggleSupplier(offer.payload.supplierId)
        ).wait();
        expect(await market.isSupplierEnabled(offer.payload.supplierId)).to.false;
        await expect(
          (
            await market
              .connect(buyerWallet)
              .deal(
                offer.payload,
                offer.payment,
                offer.payment[0].id,
                [offer.signature],
                {
                  gasLimit: 5000000,
                },
              )
          ).wait(),
        ).to.rejected; //revertedWithCustomError(market, 'DisabledSupplier');
      });
    });
  });
});
