/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { ethers } from 'hardhat';
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
  createCheckInOutSignature,
  getCancelPenalty,
} from './utils';
import { User, minDeposit, setup } from './setup';

enum DealStatus {
  Created, // Just created
  Claimed, // Claimed by the supplier
  Rejected, // Rejected by the supplier
  Refunded, // Refunded by the supplier
  Cancelled, // Cancelled by the buyer
  CheckedIn, // Checked In
  CheckedOut, // Checked Out
  Disputed, // Dispute started
}

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
        await expect(owner.market.toggleSupplier(supplierId)).to.revertedWithCustomError(
          owner.market,
          'NotSupplierOwner',
        );
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
          owner.market.changeSigner(supplierId, owner.address),
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
          supplierOwner.market.register(supplierSalt, supplierSigner.address),
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
          supplierOwner.market['addDeposit(bytes32,uint256)'](supplierId, notEnoughValue),
        ).to.rejected;
      });

      it('should throw if tokens not approved', async () => {
        await expect(supplierOwner.market['addDeposit(bytes32,uint256)'](supplierId, '1'))
          .to.rejected;
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
        BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
        supplierSigner.market.address,
        supplierSigner.erc20.address,
      );

      offerNotRegistered = await buildRandomOffer(
        randomId(),
        supplierSigner.signer,
        'Market',
        '1',
        BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
        supplierSigner.market.address,
        supplierSigner.erc20.address,
      );
    });

    describe('#deal(Offer,PaymentOption[],bytes32,bytes[])', () => {
      it('should throw if invalid payment options provided', async () => {
        await expect(
          buyer.market.deal(offer.payload, [], offer.payment[0].id, [offer.signature]),
        ).to.revertedWithCustomError(buyer.market, 'InvalidPaymentOptions');
      });

      it('should throw if invalid payment option Id provided', async () => {
        await expect(
          buyer.market.deal(offer.payload, offer.payment, constants.HashZero, [
            offer.signature,
          ]),
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
          .to.emit(buyer.market, 'Status')
          .withArgs(offer.payload.id, 0, buyer.address);

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
          buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
            offer.signature,
          ]),
        ).to.revertedWithCustomError(buyer.market, 'DealExists');
      });

      it('should throw if supplier of the offer is not registered', async () => {
        await expect(
          buyer.market.deal(
            offerNotRegistered.payload,
            offerNotRegistered.payment,
            offerNotRegistered.payment[0].id,
            [offerNotRegistered.signature],
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
          ),
        ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
      });

      it('should throw if supplier of the offer is disabled', async () => {
        await supplierOwner.market.toggleSupplier(offer.payload.supplierId);
        expect(await supplierOwner.market.isSupplierEnabled(offer.payload.supplierId)).to
          .false;
        await expect(
          buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
            offer.signature,
          ]),
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
            supplierSigner.market.claim(randomId()),
          ).to.revertedWithCustomError(supplierSigner.market, 'DealNotFound');
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
            BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
            supplierSigner.market.address,
            supplierSigner.erc20.address,
          );
          await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
          await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
            offer.signature,
          ]);
        });

        it('should throw called not by signer', async () => {
          await expect(buyer.market.claim(offer.payload.id)).to.revertedWithCustomError(
            buyer.market,
            'NotAllowedAuth',
          );
        });

        it('should claim the deal', async () => {
          const tx = await supplierSigner.market.claim(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.Claimed, supplierSigner.address);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Transfer')
            .withArgs(constants.AddressZero, buyer.address, DealStatus.Created);
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
          expect(status).to.eq(DealStatus.Claimed);
        });

        it('should throw id deal "not-created"', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            supplierSigner.market.claim(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedStatus');
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
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
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
        expect(status).to.eq(DealStatus.Claimed);
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

    describe('#reject(bytes32,bytes32)', () => {
      let offer: Offer;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
      });

      it('should throw if a deal is not found', async () => {
        await expect(
          supplierSigner.market.reject(constants.HashZero, constants.HashZero),
        ).to.revertedWithCustomError(buyer.market, 'DealNotFound');
      });

      it('should throw if a deal is claimed already', async () => {
        await supplierSigner.market.claim(offer.payload.id);
        await expect(
          supplierSigner.market.reject(offer.payload.id, constants.HashZero),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedStatus');
      });

      it('should reject a deal', async () => {
        const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
        await supplierSigner.market.reject(offer.payload.id, constants.HashZero);
        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceBefore.add(offer.payment[0].price),
        );
        const { status } = await supplierSigner.market.deals(offer.payload.id);
        expect(status).to.eq(DealStatus.Rejected);
      });

      it('should throw if a deal is rejected already', async () => {
        await supplierSigner.market.reject(offer.payload.id, constants.HashZero);
        await expect(
          supplierSigner.market.reject(offer.payload.id, constants.HashZero),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedStatus');
      });
    });

    describe('#cancel(bytes32,CancelOption[])', () => {
      let offer: Offer;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp),
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
      });

      it('should throw if a deal is not found', async () => {
        await expect(
          buyer.market.cancel(constants.HashZero, []),
        ).to.revertedWithCustomError(buyer.market, 'DealNotFound');
      });

      it('should throw if a deal is checked-in', async () => {
        await supplierSigner.market.claim(offer.payload.id);
        const signSupplier = await createCheckInOutSignature(
          supplierSigner.signer,
          offer.payload.id,
          'Market',
          '1',
          BigNumber.from(await supplierSigner.signer.getChainId()),
          supplierSigner.market.address,
        );
        const signBuyer = await createCheckInOutSignature(
          buyer.signer,
          offer.payload.id,
          'Market',
          '1',
          BigNumber.from(await buyer.signer.getChainId()),
          buyer.market.address,
        );
        await supplierSigner.market.checkIn(offer.payload.id, [signSupplier, signBuyer]);
        await expect(
          buyer.market.cancel(offer.payload.id, []),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedStatus');
      });

      it('should throw if called not by buyer', async () => {
        await expect(
          supplierSigner.market.cancel(offer.payload.id, []),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedAuth');
      });

      it('should cancel non-claimed deal by buyer', async () => {
        const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
        const tx = await buyer.market.cancel(offer.payload.id, []);
        await expect(tx)
          .to.emit(supplierSigner.market, 'Status')
          .withArgs(offer.payload.id, DealStatus.Cancelled, buyer.address);
        const { status } = await buyer.market.deals(offer.payload.id);
        expect(status).to.eq(DealStatus.Cancelled);
        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceBefore.add(offer.payment[0].price),
        );
      });

      it('should throw if a deal is cancelled already', async () => {
        await buyer.market.cancel(offer.payload.id, []);
        await expect(
          buyer.market.cancel(offer.payload.id, []),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedStatus');
      });

      it('should throw if an invalid cancellation options provided', async () => {
        await supplierSigner.market.claim(offer.payload.id);
        await expect(
          buyer.market.cancel(offer.payload.id, []),
        ).to.revertedWithCustomError(buyer.market, 'InvalidCancelOptions');
      });

      it('should cancel claimed deal according to the cancellation options', async () => {
        await supplierSigner.market.claim(offer.payload.id);
        let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        await ethers.provider.send('evm_setNextBlockTimestamp', [blockTimestamp + 3000]);
        await ethers.provider.send('evm_mine', []);
        blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        const penalty = getCancelPenalty(offer.cancel, BigNumber.from(blockTimestamp));
        const multiplier = BigNumber.from(1000);
        const penaltyValue = offer.payment[0].price
          .mul(multiplier)
          .mul(penalty)
          .div(BigNumber.from(100))
          .div(multiplier);
        const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
        const balanceSupplierBefore = await supplierOwner.erc20.balanceOf(
          supplierOwner.address,
        );
        const tokenId = await buyer.market.offerTokens(offer.payload.id);
        const tx = await buyer.market.cancel(offer.payload.id, offer.cancel);
        await expect(tx)
          .to.emit(supplierSigner.market, 'Status')
          .withArgs(offer.payload.id, DealStatus.Cancelled, buyer.address);
        const { status } = await buyer.market.deals(offer.payload.id);
        expect(status).to.eq(DealStatus.Cancelled);
        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceBefore.add(offer.payment[0].price.sub(penaltyValue)),
        );
        expect(await supplierOwner.erc20.balanceOf(supplierOwner.address)).to.eq(
          balanceSupplierBefore.add(penaltyValue),
        );
        await expect(tx)
          .to.emit(supplierSigner.market, 'Transfer')
          .withArgs(buyer.address, constants.AddressZero, tokenId);
        expect(await buyer.market.offerTokens(offer.payload.id)).to.eq(0);
        expect(await buyer.market.tokenOffers(tokenId)).to.eq(constants.HashZero);
      });
    });

    describe('#checkIn(bytes32,bytes[])', () => {
      let offer: Offer;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
      });

      it('should throw if a deal is not found', async () => {
        await expect(
          buyer.market.checkIn(constants.HashZero, [constants.HashZero]),
        ).to.revertedWithCustomError(buyer.market, 'DealNotFound');
      });

      it('should throw if a deal is not claimed yet', async () => {
        await expect(
          buyer.market.checkIn(
            offer.payload.id,
            [constants.HashZero], // it doesn't matter in this case
          ),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedStatus');
      });

      it('should throw if a called by unknown user', async () => {
        await supplierSigner.market.claim(offer.payload.id);
        await expect(
          notOwner.market.checkIn(
            offer.payload.id,
            [constants.HashZero], // it doesn't matter in this case
          ),
        ).to.revertedWithCustomError(buyer.market, 'NotAllowedAuth');
      });

      describe('check in a deal by a buyer', () => {
        it('should throw if invalid signature provided', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            buyer.market.checkIn(offer.payload.id, [constants.HashZero]),
          ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
        });

        it('should throw if a buyers signature signed by unknown signer', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signature = await createCheckInOutSignature(
            notOwner.signer, // not a buyer
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await notOwner.signer.getChainId()),
            notOwner.market.address,
          );
          await expect(
            buyer.market.checkIn(offer.payload.id, [signature]),
          ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
        });

        it('should throw if a suppliers signature signed by unknown signer', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signBuyer = await createCheckInOutSignature(
            buyer.signer, // not a supplier
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const signSupplier = await createCheckInOutSignature(
            notOwner.signer, // not a supplier
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await notOwner.signer.getChainId()),
            notOwner.market.address,
          );
          await expect(
            buyer.market.checkIn(offer.payload.id, [signBuyer, signSupplier]),
          ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
        });

        it('should check in', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          const tx = await buyer.market.checkIn(offer.payload.id, [
            signBuyer,
            signSupplier,
          ]);
          await expect(tx)
            .to.emit(buyer.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.CheckedIn, buyer.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });
      });

      describe('check in a deal by a supplier', () => {
        it('should throw if invalid signature provided', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            supplierSigner.market.checkIn(offer.payload.id, [constants.HashZero]),
          ).to.revertedWithCustomError(buyer.market, 'InvalidOfferSignature');
        });

        it('should check in before checkIn date', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const tx = await supplierSigner.market.checkIn(offer.payload.id, [
            signSupplier,
            signBuyer,
          ]);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.CheckedIn, supplierSigner.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });

        it('should check in after checkIn date', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          await ethers.provider.send('evm_setNextBlockTimestamp', [
            Number(offer.payload.checkIn.toString()),
          ]);
          await ethers.provider.send('evm_mine', []);
          const tx = await supplierSigner.market.checkIn(offer.payload.id, [
            signSupplier,
          ]);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.CheckedIn, supplierSigner.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });
      });
    });

    describe('#checkOut(bytes32)', () => {
      let offer: Offer;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp),
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
        await supplierSigner.market.claim(offer.payload.id);
      });

      it('should throw if deal not exists', async () => {
        await expect(
          supplierSigner.market.checkOut(constants.HashZero),
        ).to.revertedWithCustomError(supplierSigner.market, 'DealNotFound');
      });

      describe('if not checked in', () => {
        it('should throw if a deal is not checked in', async () => {
          await expect(
            supplierSigner.market.checkOut(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedStatus');
        });
      });

      describe('if checked in', () => {
        beforeEach(async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          await buyer.market.checkIn(offer.payload.id, [signBuyer, signSupplier]);
        });

        it('should throw if called not by a signer', async () => {
          await expect(
            buyer.market.checkOut(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedAuth');
        });

        it('should throw if called before check out time', async () => {
          await expect(
            supplierSigner.market.checkOut(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedTime');
        });

        it('should check out a deal', async () => {
          await ethers.provider.send('evm_setNextBlockTimestamp', [
            offer.payload.checkOut.toNumber(),
          ]);
          await ethers.provider.send('evm_mine', []);
          const balanceBefore = await supplierOwner.erc20.balanceOf(
            supplierOwner.address,
          );
          const tx = await supplierSigner.market.checkOut(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.CheckedOut, supplierSigner.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedOut);
          expect(await supplierOwner.erc20.balanceOf(supplierOwner.address)).to.eq(
            balanceBefore.add(offer.payment[0].price),
          );
        });
      });
    });

    describe('#refund(bytes32)', () => {
      let offer: Offer;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          'Market',
          '1',
          BigNumber.from((await supplierSigner.market.provider.getNetwork()).chainId),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp),
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(offer.payload, offer.payment, offer.payment[0].id, [
          offer.signature,
        ]);
      });

      it('should throw if deal not exists', async () => {
        await expect(
          supplierSigner.market.refund(constants.HashZero),
        ).to.revertedWithCustomError(supplierSigner.market, 'DealNotFound');
      });

      describe('if not claimed', () => {
        it('should throw if a deal is not claimed', async () => {
          await expect(
            supplierSigner.market.refund(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedStatus');
        });
      });

      describe('if claimed', () => {
        beforeEach(async () => {
          await supplierSigner.market.claim(offer.payload.id);
        });

        it('should throw if called not by a signer', async () => {
          await expect(buyer.market.refund(offer.payload.id)).to.revertedWithCustomError(
            supplierSigner.market,
            'NotAllowedAuth',
          );
        });

        it('should throw if a deal is checked out', async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          await buyer.market.checkIn(offer.payload.id, [signBuyer, signSupplier]);
          await ethers.provider.send('evm_setNextBlockTimestamp', [
            offer.payload.checkOut.toNumber(),
          ]);
          await ethers.provider.send('evm_mine', []);
          await supplierSigner.market.checkOut(offer.payload.id);
          await expect(
            supplierSigner.market.refund(offer.payload.id),
          ).to.revertedWithCustomError(supplierSigner.market, 'NotAllowedStatus');
        });

        it('should refund a deal in Claimed status', async () => {
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const tx = await supplierSigner.market.refund(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.Refunded, supplierSigner.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Refunded);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price),
          );
        });

        it('should refund a deal in CheckedIn status', async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address,
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            'Market',
            '1',
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address,
          );
          await buyer.market.checkIn(offer.payload.id, [signBuyer, signSupplier]);
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const tx = await supplierSigner.market.refund(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, 'Status')
            .withArgs(offer.payload.id, DealStatus.Refunded, supplierSigner.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Refunded);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price),
          );
        });
      });
    });
  });
});
