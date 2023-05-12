import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { minDeposit, kinds } from '../../src';
import { randomId, createSupplierId, createPermitSignature } from './utils';
import { User, setup, registerEntity } from './setup';

describe('EntitiesRegistry', () => {
  let owner: User;
  let buyer: User;
  let supplierOwner: User;
  let supplierSigner: User;
  let retailerOwner: User;
  let supplierSalt: string;
  let supplierId: string;

  before(async () => {
    const { users } = await setup();
    owner = users.owner;
    buyer = users.buyer;
    supplierOwner = users.supplierOwner;
    supplierSigner = users.supplierSigner;
    retailerOwner = users.retailerOwner;

    await owner.erc20.mint(buyer.address, '1000000000000000000000000');
    await owner.lif.mint(supplierOwner.address, '1000000000000000000000000');
    await owner.lif.mint(retailerOwner.address, '1000000000000000000000000');
  });

  beforeEach(async () => {
    supplierSalt = randomId();
    supplierId = createSupplierId(supplierOwner.address, supplierSalt);

    await registerEntity(
      supplierOwner,
      supplierSigner,
      kinds.supplier,
      supplierSalt,
      supplierOwner.lif,
      false,
    );
  });

  describe('#toggleEntity(bytes32); #isEntityEnabled(bytes32)', () => {
    it('should throw if called not by a owner', async () => {
      await expect(owner.entities.toggleEntity(supplierId)).to.revertedWithCustomError(
        owner.entities,
        'NotEntityOwner',
      );
    });

    it('should toggle the supplier state', async () => {
      expect(await supplierOwner.entities.isEntityEnabled(supplierId)).to.false;
      await supplierOwner.entities.toggleEntity(supplierId);
      expect(await supplierOwner.entities.isEntityEnabled(supplierId)).to.true;
    });
  });

  describe('#changeSigner(bytes32,address)', () => {
    it('should throw if called not by a owner', async () => {
      await expect(
        owner.entities.changeSigner(supplierId, owner.address),
      ).to.revertedWithCustomError(owner.entities, 'NotEntityOwner');
    });

    it('should change the supplier signer', async () => {
      let supplier = await supplierSigner.entities.getEntity(supplierId);
      expect(supplier.signer).to.eq(supplierSigner.address);
      await supplierOwner.entities.changeSigner(supplierId, owner.address);
      supplier = await supplierOwner.entities.getEntity(supplierId);
      expect(supplier.signer).to.eq(owner.address);
    });
  });

  describe('#register(bytes32,address)', () => {
    it('should register the supplier', async () => {
      const supplier = await supplierOwner.entities.getEntity(supplierId);
      expect(supplier.id).to.eq(supplierId);
    });

    it('should be initially disabled', async () => {
      expect(await supplierOwner.entities.isEntityEnabled(supplierId)).to.false;
    });

    it('should throw on attempt to register twice', async () => {
      await expect(
        supplierOwner.entities.register(
          kinds.supplier,
          supplierSalt,
          supplierSigner.address,
        ),
      ).to.revertedWithCustomError(supplierOwner.entities, 'EntityExists');
    });
  });

  describe('#addDeposit(bytes32,uit256,bytes); #balanceOfSupplier(bytes32)', () => {
    const value = BigNumber.from('1');
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    it('should throw if deposit value to small', async () => {
      const supplierSalt = randomId();
      const supplierId = createSupplierId(supplierOwner.address, supplierSalt);

      await registerEntity(
        supplierOwner,
        supplierSigner,
        kinds.supplier,
        supplierSalt,
        undefined,
        false,
      );

      const notEnoughValue = minDeposit.sub(BigNumber.from('1'));

      await supplierOwner.lif.approve(supplierOwner.entities.address, notEnoughValue);
      await expect(
        supplierOwner.entities['addDeposit(bytes32,uint256)'](supplierId, notEnoughValue),
      ).to.rejected;
    });

    it('should throw if tokens not approved', async () => {
      await expect(supplierOwner.entities['addDeposit(bytes32,uint256)'](supplierId, '1'))
        .to.rejected;
    });

    it('should add deposit', async () => {
      const lifBefore = await supplierOwner.lif.balanceOf(supplierOwner.address);
      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(minDeposit);
      const value = BigNumber.from('1');
      await supplierOwner.lif.approve(supplierOwner.entities.address, value);
      await supplierOwner.entities['addDeposit(bytes32,uint256)'](supplierId, value);
      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(
        minDeposit.add(value),
      );
      expect(await supplierOwner.lif.balanceOf(supplierOwner.address)).to.eq(
        lifBefore.sub(value),
      );
    });

    it('should throw if invalid permit signature provided', async () => {
      await expect(
        supplierOwner.entities['addDeposit(bytes32,uint256,uint256,bytes)'](
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
        supplierOwner.entities.address,
        value,
        deadline,
      );

      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(minDeposit);
      await supplierOwner.entities['addDeposit(bytes32,uint256,uint256,bytes)'](
        supplierId,
        value,
        deadline,
        signature,
      );
      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(
        minDeposit.add(value),
      );
    });
  });

  describe('#withdrawDeposit(bytes32,uit256,bytes)', () => {
    it('should throw if balance not enough', async () => {
      const balance = await supplierOwner.entities.balanceOfEntity(supplierId);
      await expect(
        supplierOwner.entities.withdrawDeposit(
          supplierId,
          balance.add(BigNumber.from('1')),
        ),
      ).to.rejected;
    });

    it('should withdraw deposit', async () => {
      const lifBefore = await supplierOwner.lif.balanceOf(supplierOwner.address);
      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(minDeposit);
      await supplierOwner.entities.withdrawDeposit(supplierId, minDeposit);
      expect(await supplierOwner.entities.balanceOfEntity(supplierId)).to.eq(
        constants.Zero,
      );
      expect(await supplierOwner.lif.balanceOf(supplierOwner.address)).to.eq(
        lifBefore.add(minDeposit),
      );
    });
  });
});
