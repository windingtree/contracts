/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { MockERC20Dec18Permit, Market } from '../../typechain';
import { TransferEventObject } from '../../typechain/contracts/Market';
import {
  structEqual,
  Offer,
  buildRandomOffer,
  randomId,
  createSupplierId,
  createPermitSignature,
  getEventArgs,
} from './utils';
import { User, minDeposit, setup } from './setup';

const registerSupplier = async (
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

describe('Market contract', () => {
  let owner: User;
  let notOwner: User;
  let buyer: User;
  let supplierOwner: User;
  let supplierSigner: User;

  before(async () => {
    const { users } = await setup();
    owner = users.owner;
    notOwner = users.notOwner;
    buyer = users.buyer;
    supplierOwner = users.supplierOwner;
    supplierSigner = users.supplierSigner;

    await owner.erc20.mint(buyer.address, '1000000000000000000000000');
    await owner.lif.mint(supplierOwner.address, '1000000000000000000000000');
  });

  describe('Pausable', () => {
    after(async () => {
      if (await owner.market.paused()) {
        await owner.market.unpause();
      }
    });

    describe('#pause()', () => {
      beforeEach(async () => {
        if (await owner.market.paused()) {
          await owner.market.unpause();
        }
      });

      it('should throw if called by not an owner', async () => {
        await expect(notOwner.market.pause()).to.revertedWith(
          'Ownable: caller is not the owner',
        );
      });

      it('should pause the contract', async () => {
        expect(await owner.market.paused()).to.be.false;
        await owner.market.pause();
        expect(await owner.market.paused()).to.be.true;
      });

      it('should throw if already paused', async () => {
        await owner.market.pause();
        await expect(owner.market.pause()).to.revertedWith('Pausable: paused');
      });
    });

    describe('#unpause()', () => {
      beforeEach(async () => {
        if (!(await owner.market.paused())) {
          await owner.market.pause();
        }
      });

      it('should throw if called by not an owner', async () => {
        await expect(notOwner.market.unpause()).to.revertedWith(
          'Ownable: caller is not the owner',
        );
      });

      it('should unpause the contract', async () => {
        expect(await owner.market.paused()).to.be.true;
        await owner.market.unpause();
        expect(await owner.market.paused()).to.be.false;
      });

      it('should throw if not paused', async () => {
        await owner.market.unpause();
        await expect(owner.market.unpause()).to.revertedWith('Pausable: not paused');
      });
    });
  });

  describe('SuppliersRegistry', () => {
    let supplierSalt: string;
    let supplierId: string;

    beforeEach(async () => {
      supplierSalt = randomId();
      supplierId = createSupplierId(supplierOwner.address, supplierSalt);

      await registerSupplier(
        supplierOwner.market,
        supplierSalt,
        supplierOwner,
        supplierSigner,
        supplierOwner.lif,
        false,
      );
    });

    describe('#toggleSupplier(bytes32); #isSupplierEnabled(bytes32)', () => {
      it('should throw if called not by a owner', async () => {
        await expect(
          owner.market.toggleSupplier(supplierId, {
            gasLimit: 5000000,
          }),
        ).to.revertedWithCustomError(owner.market, 'NotSupplierOwner');
      });

      it('should toggle the supplier state', async () => {
        expect(await supplierOwner.market.isSupplierEnabled(supplierId)).to.false;
        await supplierOwner.market.toggleSupplier(supplierId);
        expect(await supplierOwner.market.isSupplierEnabled(supplierId)).to.true;
      });
    });

    describe('#changeSigner(bytes32,address)', () => {
      it('should throw if called not by a owner', async () => {
        await expect(
          owner.market.changeSigner(supplierId, owner.address, {
            gasLimit: 5000000,
          }),
        ).to.revertedWithCustomError(owner.market, 'NotSupplierOwner');
      });

      it('should change the supplier signer', async () => {
        let supplier = await supplierSigner.market.suppliers(supplierId);
        expect(supplier.signer).to.eq(supplierSigner.address);
        await supplierOwner.market.changeSigner(supplierId, owner.address);
        supplier = await supplierOwner.market.suppliers(supplierId);
        expect(supplier.signer).to.eq(owner.address);
      });
    });

    describe('#register(bytes32,address)', () => {
      it('should register the supplier', async () => {
        const supplier = await supplierOwner.market.suppliers(supplierId);
        expect(supplier.id).to.eq(supplierId);
      });

      it('should be initially disabled', async () => {
        expect(await supplierOwner.market.isSupplierEnabled(supplierId)).to.false;
      });

      it('should throw on attempt to register twice', async () => {
        await expect(
          supplierOwner.market.register(supplierSalt, supplierSigner.address, {
            gasLimit: 5000000,
          }),
        ).to.revertedWithCustomError(supplierOwner.market, 'SupplierExists');
      });
    });

    describe('#addDeposit(bytes32,uit256,bytes); #balanceOfSupplier(bytes32)', () => {
      const value = BigNumber.from('1');
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      it('should throw if deposit value to small', async () => {
        const supplierSalt = randomId();
        const supplierId = createSupplierId(supplierOwner.address, supplierSalt);

        await registerSupplier(
          supplierOwner.market,
          supplierSalt,
          supplierOwner,
          supplierSigner,
          undefined,
          false,
        );

        const notEnoughValue = minDeposit.sub(BigNumber.from('1'));

        await supplierOwner.lif.approve(supplierOwner.market.address, notEnoughValue);
        await expect(
          supplierOwner.market['addDeposit(bytes32,uint256)'](
            supplierId,
            notEnoughValue,
            {
              gasLimit: 5000000,
            },
          ),
        ).to.rejected;
      });

      it('should throw if tokens not approved', async () => {
        await expect(
          supplierOwner.market['addDeposit(bytes32,uint256)'](supplierId, '1', {
            gasLimit: 5000000,
          }),
        ).to.rejected;
      });

      it('should add deposit', async () => {
        const lifBefore = await supplierOwner.lif.balanceOf(supplierOwner.address);
        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          minDeposit,
        );
        const value = BigNumber.from('1');
        await supplierOwner.lif.approve(supplierOwner.market.address, value);
        await supplierOwner.market['addDeposit(bytes32,uint256)'](supplierId, value);
        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          minDeposit.add(value),
        );
        expect(await supplierOwner.lif.balanceOf(supplierOwner.address)).to.eq(
          lifBefore.sub(value),
        );
      });

      it('should throw if invalid permit signature provided', async () => {
        await expect(
          supplierOwner.market['addDeposit(bytes32,uint256,uint256,bytes)'](
            supplierId,
            value,
            deadline,
            constants.HashZero,
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(supplierOwner.market, 'InvalidSignature');
      });

      it('should add deposit using permit', async () => {
        const signature = await createPermitSignature(
          supplierOwner.signer,
          supplierOwner.lif,
          supplierOwner.address,
          supplierOwner.market.address,
          value,
          deadline,
        );

        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          minDeposit,
        );
        await supplierOwner.market['addDeposit(bytes32,uint256,uint256,bytes)'](
          supplierId,
          value,
          deadline,
          signature,
          {
            gasLimit: 5000000,
          },
        );
        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          minDeposit.add(value),
        );
      });
    });

    describe('#withdrawDeposit(bytes32,uit256,bytes)', () => {
      it('should throw if balance not enough', async () => {
        const balance = await supplierOwner.market.balanceOfSupplier(supplierId);
        await expect(
          supplierOwner.market.withdrawDeposit(
            supplierId,
            balance.add(BigNumber.from('1')),
            {
              gasLimit: 5000000,
            },
          ),
        ).to.rejected;
      });

      it('should withdraw deposit', async () => {
        const lifBefore = await supplierOwner.lif.balanceOf(supplierOwner.address);
        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          minDeposit,
        );
        await supplierOwner.market.withdrawDeposit(supplierId, minDeposit);
        expect(await supplierOwner.market.balanceOfSupplier(supplierId)).to.eq(
          constants.Zero,
        );
        expect(await supplierOwner.lif.balanceOf(supplierOwner.address)).to.eq(
          lifBefore.add(minDeposit),
        );
      });
    });
  });

  describe('DealsRegistry', () => {
    let supplierId: string;
    let offer: Offer;
    let offerNotRegistered: Offer;

    before(async () => {
      const supplierSalt = randomId();
      supplierId = createSupplierId(supplierOwner.address, supplierSalt);

      await registerSupplier(
        supplierOwner.market,
        supplierSalt,
        supplierOwner,
        supplierSigner,
        supplierOwner.lif,
      );

      offer = await buildRandomOffer(
        supplierId,
        supplierSigner.signer,
        'Market',
        '1',
        (
          await supplierSigner.market.provider.getNetwork()
        ).chainId,
        supplierSigner.market.address,
        supplierSigner.erc20.address,
      );

      offerNotRegistered = await buildRandomOffer(
        randomId(),
        supplierSigner.signer,
        'Market',
        '1',
        (
          await supplierSigner.market.provider.getNetwork()
        ).chainId,
        supplierSigner.market.address,
        supplierSigner.erc20.address,
      );
    });

    describe('#deal(Offer,PaymentOption[],bytes32,bytes[])', () => {
      it('should throw if invalid payment options provided', async () => {
        await expect(
          buyer.market.deal(offer.payload, [], offer.payment[0].id, [offer.signature], {
            gasLimit: 5000000,
          }),
        ).to.revertedWithCustomError(buyer.market, 'InvalidPaymentOptions');
      });

      it('should throw if invalid payment option Id provided', async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            constants.HashZero,
            [offer.signature],
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(buyer.market, 'InvalidPaymentId');
      });

      it('should create a deal', async () => {
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        const balanceOfBuyer = await buyer.erc20.balanceOf(buyer.address);
        const balanceOfMarket = await buyer.erc20.balanceOf(buyer.market.address);

        const tx = await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          [offer.signature],
        );
        await expect(tx)
          .to.emit(buyer.market, 'DealCreated')
          .withArgs(offer.payload.id, buyer.address);

        const {
          offer: contractOffer,
          buyer: buyerAddress,
          price,
          asset,
          status,
        } = await buyer.market.deals(offer.payload.id);
        expect(buyerAddress).to.eq(buyer.address);
        structEqual(contractOffer, offer.payload);
        expect(price).to.eq(offer.payment[0].price);
        expect(asset).to.eq(offer.payment[0].asset);
        expect(status).to.eq(0);

        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceOfBuyer.sub(offer.payment[0].price),
        );
        expect(await buyer.erc20.balanceOf(buyer.market.address)).to.eq(
          balanceOfMarket.add(offer.payment[0].price),
        );
      });

      it('should throw if attempting to create the same deal', async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            [offer.signature],
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(buyer.market, 'DealExists');
      });

      it('should throw if supplier of the offer is not registered', async () => {
        await expect(
          buyer.market.deal(
            offerNotRegistered.payload,
            offerNotRegistered.payment,
            offerNotRegistered.payment[0].id,
            [offerNotRegistered.signature],
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(buyer.market, 'InvalidSupplier');
      });

      it('should throw if invalid signature provided', async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            [offerNotRegistered.signature], // Invalid
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
      });

      it('should throw if supplier of the offer is disabled', async () => {
        await supplierOwner.market.toggleSupplier(offer.payload.supplierId);
        expect(await supplierOwner.market.isSupplierEnabled(offer.payload.supplierId)).to
          .false;
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            [offer.signature],
            {
              gasLimit: 5000000,
            },
          ),
        ).to.revertedWithCustomError(buyer.market, 'DisabledSupplier');
      });
    });

    describe('#claim(bytes32)', () => {
      before(async () => {
        if (!(await supplierOwner.market.isSupplierEnabled(supplierId))) {
          await supplierOwner.market.toggleSupplier(supplierId);
        }
      });

      describe('without deal', () => {
        it('should throw if deal not found', async () => {
          await expect(
            supplierSigner.market.claim(randomId(), {
              gasLimit: 5000000,
            }),
          ).to.rejected;
        });
      });

      describe('with deal', () => {
        let offer: Offer;

        beforeEach(async () => {
          offer = await buildRandomOffer(
            supplierId,
            supplierSigner.signer,
            'Market',
            '1',
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId,
            supplierSigner.market.address,
            supplierSigner.erc20.address,
          );
          await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
          await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
            offer.signature,
          ]);
        });

        it('should throw called not by signer', async () => {
          await expect(
            buyer.market.claim(offer.payload.id, {
              gasLimit: 5000000,
            }),
          ).to.revertedWithCustomError(buyer.market, 'NotAllowed');
        });

        it('should claim the deal', async () => {
          const tx = await supplierSigner.market.claim(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, 'DealClaimed')
            .withArgs(offer.payload.id, supplierSigner.address);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Transfer')
            .withArgs(constants.AddressZero, buyer.address, 0);
          expect(await supplierSigner.market.resolveTokenId(0)).to.eq(offer.payload.id);
          const {
            offer: contractOffer,
            buyer: buyerAddress,
            price,
            asset,
            status,
          } = await buyer.market.deals(offer.payload.id);
          expect(buyerAddress).to.eq(buyer.address);
          structEqual(contractOffer, offer.payload);
          expect(price).to.eq(offer.payment[0].price);
          expect(asset).to.eq(offer.payment[0].asset);
          expect(status).to.eq(1);
        });

        it('should throw id deal "not-created"', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            supplierSigner.market.claim(offer.payload.id, {
              gasLimit: 5000000,
            }),
          ).to.revertedWithCustomError(supplierSigner.market, 'DealNotCreated');
        });
      });
    });

    describe('#transferFrom(address,address,uint256)', () => {
      let offer: Offer;
      let tokenId: BigNumber;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          (
            await supplierSigner.market.provider.getNetwork()
          ).chainId,
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
        const tx = await supplierSigner.market.claim(offer.payload.id);
        const { tokenId: claimedToken } = await getEventArgs<TransferEventObject>(
          tx,
          'Transfer',
        );
        tokenId = claimedToken;
      });

      it('should transfer', async () => {
        expect(await buyer.market.ownerOf(tokenId)).to.eq(buyer.address);
        const { status } = await buyer.market.deals(offer.payload.id);
        expect(status).to.eq(1); // claimed
        const tx = await buyer.market.transferFrom(
          buyer.address,
          notOwner.address,
          tokenId,
        );
        await expect(tx)
          .to.emit(buyer.market, 'Transfer')
          .withArgs(buyer.address, notOwner.address, tokenId);
        expect(await buyer.market.ownerOf(tokenId)).to.eq(notOwner.address);
      });
    });
  });
});
