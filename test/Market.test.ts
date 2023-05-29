import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { TransferEventObject } from "../typechain/contracts/Market";
import { kinds } from "../temp/utils/constants";
import { Offer } from "../utils/types";
import {
  structEqual,
  buildRandomOffer,
  randomId,
  createSupplierId,
  getEventArgs,
  createCheckInOutSignature,
  getCancelPenalty,
} from "./utils";
import { User, setup, registerEntity, calcFees } from "./setup";

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

describe("Market", () => {
  let owner: User;
  let notOwner: User;
  let buyer: User;
  let supplierOwner: User;
  let supplierSigner: User;
  let retailerOwner: User;
  let retailerSigner: User;

  before(async () => {
    const { users } = await setup();
    owner = users.owner;
    notOwner = users.notOwner;
    buyer = users.buyer;
    supplierOwner = users.supplierOwner;
    supplierSigner = users.supplierSigner;
    retailerOwner = users.retailerOwner;
    retailerSigner = users.retailerSigner;

    await owner.erc20.mint(buyer.address, "1000000000000000000000000");
    await owner.lif.mint(supplierOwner.address, "1000000000000000000000000");
    await owner.lif.mint(retailerOwner.address, "1000000000000000000000000");
  });

  describe("Pausable", () => {
    after(async () => {
      if (await owner.market.paused()) {
        await owner.market.unpause();
      }
    });

    describe("#pause()", () => {
      beforeEach(async () => {
        if (await owner.market.paused()) {
          await owner.market.unpause();
        }
      });

      it("should throw if called by not an owner", async () => {
        await expect(notOwner.market.pause()).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should pause the contract", async () => {
        expect(await owner.market.paused()).to.be.false;
        await owner.market.pause();
        expect(await owner.market.paused()).to.be.true;
      });

      it("should throw if already paused", async () => {
        await owner.market.pause();
        await expect(owner.market.pause()).to.revertedWith("Pausable: paused");
      });
    });

    describe("#unpause()", () => {
      beforeEach(async () => {
        if (!(await owner.market.paused())) {
          await owner.market.pause();
        }
      });

      it("should throw if called by not an owner", async () => {
        await expect(notOwner.market.unpause()).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should unpause the contract", async () => {
        expect(await owner.market.paused()).to.be.true;
        await owner.market.unpause();
        expect(await owner.market.paused()).to.be.false;
      });

      it("should throw if not paused", async () => {
        await owner.market.unpause();
        await expect(owner.market.unpause()).to.revertedWith(
          "Pausable: not paused"
        );
      });
    });
  });

  describe("DealsRegistry", () => {
    let supplierId: string;
    let retailerId: string;
    let offer: Offer;
    let offerNotRegistered: Offer;

    before(async () => {
      const supplierSalt = randomId();
      supplierId = createSupplierId(supplierOwner.address, supplierSalt);
      const retailerSalt = randomId();
      retailerId = createSupplierId(retailerOwner.address, retailerSalt);

      await registerEntity(
        supplierOwner,
        supplierSigner,
        kinds.supplier,
        supplierSalt,
        supplierOwner.lif
      );

      await registerEntity(
        retailerOwner,
        retailerSigner,
        kinds.retailer,
        retailerSalt,
        retailerOwner.lif
      );

      offer = await buildRandomOffer(
        supplierId,
        supplierSigner.signer,
        "Market",
        "1",
        BigNumber.from(
          (
            await supplierSigner.market.provider.getNetwork()
          ).chainId
        ),
        supplierSigner.market.address,
        supplierSigner.erc20.address
      );

      offerNotRegistered = await buildRandomOffer(
        randomId(),
        supplierSigner.signer,
        "Market",
        "1",
        BigNumber.from(
          (
            await supplierSigner.market.provider.getNetwork()
          ).chainId
        ),
        supplierSigner.market.address,
        supplierSigner.erc20.address
      );
    });

    describe("#deal(Offer,PaymentOption[],bytes32,bytes32,bytes[])", () => {
      it("should throw if invalid payment options provided", async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            [],
            offer.payment[0].id,
            retailerId,
            [offer.signature]
          )
        ).to.revertedWithCustomError(buyer.market, "InvalidPaymentOptions");
      });

      it("should throw if invalid payment option Id provided", async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            constants.HashZero,
            retailerId,
            [offer.signature]
          )
        ).to.revertedWithCustomError(buyer.market, "InvalidPaymentId");
      });

      it("should create a deal", async () => {
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        const balanceOfBuyer = await buyer.erc20.balanceOf(buyer.address);
        const balanceOfMarket = await buyer.erc20.balanceOf(
          buyer.market.address
        );

        const tx = await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
        await expect(tx)
          .to.emit(buyer.market, "Status")
          .withArgs(offer.payload.id, 0, buyer.address);

        const {
          offer: contractOffer,
          buyer: buyerAddress,
          price,
          asset,
          status,
        } = await buyer.market.deals(offer.payload.id);
        expect(buyerAddress).to.eq(buyer.address);
        structEqual(contractOffer, offer.payload, "Offer");
        expect(price).to.eq(offer.payment[0].price);
        expect(asset).to.eq(offer.payment[0].asset);
        expect(status).to.eq(0);

        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceOfBuyer.sub(offer.payment[0].price)
        );
        expect(await buyer.erc20.balanceOf(buyer.market.address)).to.eq(
          balanceOfMarket.add(offer.payment[0].price)
        );
      });

      it("should throw if attempting to create the same deal", async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            retailerId,
            [offer.signature]
          )
        ).to.revertedWithCustomError(buyer.market, "DealExists");
      });

      it("should throw if supplier of the offer is not registered", async () => {
        await expect(
          buyer.market.deal(
            offerNotRegistered.payload,
            offerNotRegistered.payment,
            offerNotRegistered.payment[0].id,
            retailerId,
            [offerNotRegistered.signature]
          )
        ).to.revertedWithCustomError(buyer.entities, "EntityNotFound");
      });

      it("should throw if invalid signature provided", async () => {
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            retailerId,
            [offerNotRegistered.signature] // Invalid
          )
        ).to.revertedWithCustomError(buyer.market, "InvalidOfferSignature");
      });

      it("should throw if supplier of the offer is disabled", async () => {
        await supplierOwner.entities.toggleEntity(offer.payload.supplierId);
        expect(
          await supplierOwner.entities.isEntityEnabled(offer.payload.supplierId)
        ).to.false;
        await expect(
          buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            retailerId,
            [offer.signature]
          )
        ).to.revertedWithCustomError(buyer.market, "DisabledSupplier");
      });
    });

    describe("#claim(bytes32)", () => {
      before(async () => {
        if (!(await supplierOwner.entities.isEntityEnabled(supplierId))) {
          await supplierOwner.entities.toggleEntity(supplierId);
        }
      });

      describe("without deal", () => {
        it("should throw if deal not found", async () => {
          await expect(
            supplierSigner.market.claim(randomId())
          ).to.revertedWithCustomError(supplierSigner.market, "DealNotFound");
        });
      });

      describe("with deal", () => {
        let offer: Offer;

        beforeEach(async () => {
          offer = await buildRandomOffer(
            supplierId,
            supplierSigner.signer,
            "Market",
            "1",
            BigNumber.from(
              (
                await supplierSigner.market.provider.getNetwork()
              ).chainId
            ),
            supplierSigner.market.address,
            supplierSigner.erc20.address
          );
          await buyer.erc20.approve(
            buyer.market.address,
            offer.payment[0].price
          );
          await buyer.market.deal(
            offer.payload,
            offer.payment,
            offer.payment[0].id,
            retailerId,
            [offer.signature]
          );
        });

        it("should throw called not by signer", async () => {
          await expect(
            buyer.market.claim(offer.payload.id)
          ).to.revertedWithCustomError(buyer.market, "NotAllowedAuth");
        });

        it("should claim the deal", async () => {
          const tx = await supplierSigner.market.claim(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.Claimed,
              supplierSigner.address
            );
          await expect(tx)
            .to.emit(supplierSigner.market, "Transfer")
            .withArgs(constants.AddressZero, buyer.address, DealStatus.Created);
          expect(await supplierSigner.market.resolveTokenId(0)).to.eq(
            offer.payload.id
          );
          const {
            offer: contractOffer,
            buyer: buyerAddress,
            price,
            asset,
            status,
          } = await buyer.market.deals(offer.payload.id);
          expect(buyerAddress).to.eq(buyer.address);
          structEqual(contractOffer, offer.payload, "Offer");
          expect(price).to.eq(offer.payment[0].price);
          expect(asset).to.eq(offer.payment[0].asset);
          expect(status).to.eq(DealStatus.Claimed);
        });

        it('should throw id deal "not-created"', async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            supplierSigner.market.claim(offer.payload.id)
          ).to.revertedWithCustomError(
            supplierSigner.market,
            "NotAllowedStatus"
          );
        });
      });
    });

    describe("#transferFrom(address,address,uint256)", () => {
      let offer: Offer;
      let tokenId: BigNumber;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
        const tx = await supplierSigner.market.claim(offer.payload.id);
        const { tokenId: claimedToken } =
          await getEventArgs<TransferEventObject>(tx, "Transfer");
        tokenId = claimedToken;
      });

      it("should transfer", async () => {
        expect(await buyer.market.ownerOf(tokenId)).to.eq(buyer.address);
        const { status } = await buyer.market.deals(offer.payload.id);
        expect(status).to.eq(DealStatus.Claimed);
        const tx = await buyer.market.transferFrom(
          buyer.address,
          notOwner.address,
          tokenId
        );
        await expect(tx)
          .to.emit(buyer.market, "Transfer")
          .withArgs(buyer.address, notOwner.address, tokenId);
        expect(await buyer.market.ownerOf(tokenId)).to.eq(notOwner.address);
      });
    });

    describe("#reject(bytes32,bytes32)", () => {
      let offer: Offer;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
      });

      it("should throw if a deal is not found", async () => {
        await expect(
          supplierSigner.market.reject(constants.HashZero, constants.HashZero)
        ).to.revertedWithCustomError(buyer.market, "DealNotFound");
      });

      it("should throw if a deal is claimed already", async () => {
        await supplierSigner.market.claim(offer.payload.id);
        await expect(
          supplierSigner.market.reject(offer.payload.id, constants.HashZero)
        ).to.revertedWithCustomError(buyer.market, "NotAllowedStatus");
      });

      it("should reject a deal", async () => {
        const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
        await supplierSigner.market.reject(
          offer.payload.id,
          constants.HashZero
        );
        expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
          balanceBefore.add(offer.payment[0].price)
        );
        const { status } = await supplierSigner.market.deals(offer.payload.id);
        expect(status).to.eq(DealStatus.Rejected);
      });

      it("should throw if a deal is rejected already", async () => {
        await supplierSigner.market.reject(
          offer.payload.id,
          constants.HashZero
        );
        await expect(
          supplierSigner.market.reject(offer.payload.id, constants.HashZero)
        ).to.revertedWithCustomError(buyer.market, "NotAllowedStatus");
      });
    });

    describe("#cancel(bytes32,CancelOption[])", () => {
      let offer: Offer;
      let claimPeriod: BigNumber;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock("latest"))
          .timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp)
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
        claimPeriod = await buyer.config.getNumber(
          ethers.utils.formatBytes32String("claim_period")
        );
      });

      it("should throw if a deal is not found", async () => {
        await expect(
          buyer.market.cancel(constants.HashZero, [])
        ).to.revertedWithCustomError(buyer.market, "DealNotFound");
      });

      describe("before claim-period", () => {
        it("should throw if a deal is checked-in", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          await supplierSigner.market.checkIn(offer.payload.id, [
            signSupplier,
            signBuyer,
          ]);
          await expect(
            buyer.market.cancel(offer.payload.id, [])
          ).to.revertedWithCustomError(buyer.market, "NotAllowedStatus");
        });

        it("should throw if called not by buyer", async () => {
          await expect(
            supplierSigner.market.cancel(offer.payload.id, [])
          ).to.revertedWithCustomError(buyer.market, "NotAllowedAuth");
        });

        it("should cancel claimed deal according to the cancellation options", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          let blockTimestamp = (await ethers.provider.getBlock("latest"))
            .timestamp;
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            blockTimestamp + 3000,
          ]);
          await ethers.provider.send("evm_mine", []);
          blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const penalty = getCancelPenalty(
            offer.cancel,
            BigNumber.from(blockTimestamp)
          );
          const multiplier = BigNumber.from(1000);
          const penaltyValue = offer.payment[0].price
            .mul(multiplier)
            .mul(penalty)
            .div(BigNumber.from(100))
            .div(multiplier);
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const balanceSupplierBefore = await supplierOwner.erc20.balanceOf(
            supplierOwner.address
          );
          const tokenId = await buyer.market.offerTokens(offer.payload.id);
          const tx = await buyer.market.cancel(offer.payload.id, offer.cancel);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(offer.payload.id, DealStatus.Cancelled, buyer.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Cancelled);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price.sub(penaltyValue))
          );
          expect(
            await supplierOwner.erc20.balanceOf(supplierOwner.address)
          ).to.eq(balanceSupplierBefore.add(penaltyValue));
          await expect(tx)
            .to.emit(supplierSigner.market, "Transfer")
            .withArgs(buyer.address, constants.AddressZero, tokenId);
          expect(await buyer.market.offerTokens(offer.payload.id)).to.eq(0);
          expect(await buyer.market.tokenOffers(tokenId)).to.eq(
            constants.HashZero
          );
        });
      });

      describe("after claim-period", () => {
        beforeEach(async () => {
          const blockTimestamp = (await ethers.provider.getBlock("latest"))
            .timestamp;
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            BigNumber.from(blockTimestamp).add(claimPeriod).toNumber(),
          ]);
          await ethers.provider.send("evm_mine", []);
        });

        it("should cancel non-claimed deal by buyer", async () => {
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const tx = await buyer.market.cancel(offer.payload.id, []);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(offer.payload.id, DealStatus.Cancelled, buyer.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Cancelled);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price)
          );
        });

        it("should throw if a deal is cancelled already", async () => {
          await buyer.market.cancel(offer.payload.id, []);
          await expect(
            buyer.market.cancel(offer.payload.id, [])
          ).to.revertedWithCustomError(buyer.market, "NotAllowedStatus");
        });

        it("should throw if an invalid cancellation options provided", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            buyer.market.cancel(offer.payload.id, [])
          ).to.revertedWithCustomError(buyer.market, "InvalidCancelOptions");
        });
      });
    });

    describe("#checkIn(bytes32,bytes[])", () => {
      let offer: Offer;

      beforeEach(async () => {
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
      });

      it("should throw if a deal is not found", async () => {
        await expect(
          buyer.market.checkIn(constants.HashZero, [constants.HashZero])
        ).to.revertedWithCustomError(buyer.market, "DealNotFound");
      });

      it("should throw if a deal is not claimed yet", async () => {
        await expect(
          buyer.market.checkIn(
            offer.payload.id,
            [constants.HashZero] // it doesn't matter in this case
          )
        ).to.revertedWithCustomError(buyer.market, "NotAllowedStatus");
      });

      it("should throw if a called by unknown user", async () => {
        await supplierSigner.market.claim(offer.payload.id);
        await expect(
          notOwner.market.checkIn(
            offer.payload.id,
            [constants.HashZero] // it doesn't matter in this case
          )
        ).to.revertedWithCustomError(buyer.market, "NotAllowedAuth");
      });

      describe("check in a deal by a buyer", () => {
        it("should throw if invalid signature provided", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            buyer.market.checkIn(offer.payload.id, [constants.HashZero])
          ).to.revertedWithCustomError(buyer.market, "InvalidOfferSignature");
        });

        it("should throw if a buyers signature signed by unknown signer", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signature = await createCheckInOutSignature(
            notOwner.signer, // not a buyer
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await notOwner.signer.getChainId()),
            notOwner.market.address
          );
          await expect(
            buyer.market.checkIn(offer.payload.id, [signature])
          ).to.revertedWithCustomError(buyer.market, "InvalidOfferSignature");
        });

        it("should throw if a suppliers signature signed by unknown signer", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signBuyer = await createCheckInOutSignature(
            buyer.signer, // not a supplier
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const signSupplier = await createCheckInOutSignature(
            notOwner.signer, // not a supplier
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await notOwner.signer.getChainId()),
            notOwner.market.address
          );
          await expect(
            buyer.market.checkIn(offer.payload.id, [signBuyer, signSupplier])
          ).to.revertedWithCustomError(buyer.market, "InvalidOfferSignature");
        });

        it("should check in", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          const tx = await buyer.market.checkIn(offer.payload.id, [
            signBuyer,
            signSupplier,
          ]);
          await expect(tx)
            .to.emit(buyer.market, "Status")
            .withArgs(offer.payload.id, DealStatus.CheckedIn, buyer.address);
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });
      });

      describe("check in a deal by a supplier", () => {
        it("should throw if invalid signature provided", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          await expect(
            supplierSigner.market.checkIn(offer.payload.id, [
              constants.HashZero,
            ])
          ).to.revertedWithCustomError(buyer.market, "InvalidOfferSignature");
        });

        it("should check in before checkIn date", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const tx = await supplierSigner.market.checkIn(offer.payload.id, [
            signSupplier,
            signBuyer,
          ]);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.CheckedIn,
              supplierSigner.address
            );
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });

        it("should check in after checkIn date", async () => {
          await supplierSigner.market.claim(offer.payload.id);
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            Number(offer.payload.checkIn.toString()),
          ]);
          await ethers.provider.send("evm_mine", []);
          const tx = await supplierSigner.market.checkIn(offer.payload.id, [
            signSupplier,
          ]);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.CheckedIn,
              supplierSigner.address
            );
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedIn);
        });
      });
    });

    describe("#checkOut(bytes32)", () => {
      let offer: Offer;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock("latest"))
          .timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp)
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
        await supplierSigner.market.claim(offer.payload.id);
      });

      it("should throw if deal not exists", async () => {
        await expect(
          supplierSigner.market.checkOut(constants.HashZero)
        ).to.revertedWithCustomError(supplierSigner.market, "DealNotFound");
      });

      describe("if not checked in", () => {
        it("should throw if a deal is not checked in", async () => {
          await expect(
            supplierSigner.market.checkOut(offer.payload.id)
          ).to.revertedWithCustomError(
            supplierSigner.market,
            "NotAllowedStatus"
          );
        });
      });

      describe("if checked in", () => {
        beforeEach(async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          await buyer.market.checkIn(offer.payload.id, [
            signBuyer,
            signSupplier,
          ]);
        });

        it("should throw if called not by a signer", async () => {
          await expect(
            buyer.market.checkOut(offer.payload.id)
          ).to.revertedWithCustomError(supplierSigner.market, "NotAllowedAuth");
        });

        it("should throw if called before check out time", async () => {
          await expect(
            supplierSigner.market.checkOut(offer.payload.id)
          ).to.revertedWithCustomError(supplierSigner.market, "NotAllowedTime");
        });

        it("should check out a deal", async () => {
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            offer.payload.checkOut.toNumber(),
          ]);
          await ethers.provider.send("evm_mine", []);
          const balSupBefore = await supplierOwner.erc20.balanceOf(
            supplierOwner.address
          );
          const balRetBefore = await retailerOwner.erc20.balanceOf(
            retailerOwner.address
          );
          const balProBefore = await owner.erc20.balanceOf(owner.address);
          const { protocolFeeValue, retailerFeeValue, supplierValue } =
            calcFees(offer.payment[0].price);
          const tx = await supplierSigner.market.checkOut(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.CheckedOut,
              supplierSigner.address
            );
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.CheckedOut);
          expect(
            await supplierOwner.erc20.balanceOf(supplierOwner.address)
          ).to.eq(balSupBefore.add(supplierValue));
          expect(
            await retailerOwner.erc20.balanceOf(retailerOwner.address)
          ).to.eq(balRetBefore.add(retailerFeeValue));
          expect(await owner.erc20.balanceOf(owner.address)).to.eq(
            balProBefore.add(protocolFeeValue)
          );
        });
      });
    });

    describe("#refund(bytes32)", () => {
      let offer: Offer;

      beforeEach(async () => {
        const blockTimestamp = (await ethers.provider.getBlock("latest"))
          .timestamp;
        offer = await buildRandomOffer(
          supplierId,
          supplierSigner.signer,
          "Market",
          "1",
          BigNumber.from(
            (
              await supplierSigner.market.provider.getNetwork()
            ).chainId
          ),
          supplierSigner.market.address,
          supplierSigner.erc20.address,
          true,
          BigNumber.from(blockTimestamp)
        );
        await buyer.erc20.approve(buyer.market.address, offer.payment[0].price);
        await buyer.market.deal(
          offer.payload,
          offer.payment,
          offer.payment[0].id,
          retailerId,
          [offer.signature]
        );
      });

      it("should throw if deal not exists", async () => {
        await expect(
          supplierSigner.market.refund(constants.HashZero)
        ).to.revertedWithCustomError(supplierSigner.market, "DealNotFound");
      });

      describe("if not claimed", () => {
        it("should throw if a deal is not claimed", async () => {
          await expect(
            supplierSigner.market.refund(offer.payload.id)
          ).to.revertedWithCustomError(
            supplierSigner.market,
            "NotAllowedStatus"
          );
        });
      });

      describe("if claimed", () => {
        beforeEach(async () => {
          await supplierSigner.market.claim(offer.payload.id);
        });

        it("should throw if called not by a signer", async () => {
          await expect(
            buyer.market.refund(offer.payload.id)
          ).to.revertedWithCustomError(supplierSigner.market, "NotAllowedAuth");
        });

        it("should throw if a deal is checked out", async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          await buyer.market.checkIn(offer.payload.id, [
            signBuyer,
            signSupplier,
          ]);
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            offer.payload.checkOut.toNumber(),
          ]);
          await ethers.provider.send("evm_mine", []);
          await supplierSigner.market.checkOut(offer.payload.id);
          await expect(
            supplierSigner.market.refund(offer.payload.id)
          ).to.revertedWithCustomError(
            supplierSigner.market,
            "NotAllowedStatus"
          );
        });

        it("should refund a deal in Claimed status", async () => {
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const tx = await supplierSigner.market.refund(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.Refunded,
              supplierSigner.address
            );
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Refunded);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price)
          );
        });

        it("should refund a deal in CheckedIn status", async () => {
          const signBuyer = await createCheckInOutSignature(
            buyer.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await buyer.signer.getChainId()),
            buyer.market.address
          );
          const signSupplier = await createCheckInOutSignature(
            supplierSigner.signer,
            offer.payload.id,
            "Market",
            "1",
            BigNumber.from(await supplierSigner.signer.getChainId()),
            supplierSigner.market.address
          );
          await buyer.market.checkIn(offer.payload.id, [
            signBuyer,
            signSupplier,
          ]);
          const balanceBefore = await buyer.erc20.balanceOf(buyer.address);
          const tx = await supplierSigner.market.refund(offer.payload.id);
          await expect(tx)
            .to.emit(supplierSigner.market, "Status")
            .withArgs(
              offer.payload.id,
              DealStatus.Refunded,
              supplierSigner.address
            );
          const { status } = await buyer.market.deals(offer.payload.id);
          expect(status).to.eq(DealStatus.Refunded);
          expect(await buyer.erc20.balanceOf(buyer.address)).to.eq(
            balanceBefore.add(offer.payment[0].price)
          );
        });
      });
    });
  });
});
