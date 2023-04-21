import { expect } from 'chai';
import { utils, BigNumber, BigNumberish, TypedDataField, Wallet } from 'ethers';
import {
  PAYMENT_OPTION_TYPE_HASH,
  CANCEL_OPTION_TYPE_HASH,
  OFFER_TYPE_HASH,
} from '../../src/constants';

export const nonces: Record<string, number> = {
  request: 1,
};

export interface Request {
  id: string;
  expire: BigNumberish;
  nonce: BigNumberish;
  topic: string;
  query: unknown;
}

export interface PaymentOption {
  id: string;
  price: BigNumberish;
  asset: string;
}

export interface CancelOption {
  time: BigNumberish;
  penalty: BigNumberish;
}

export interface OfferPayload {
  id: string;
  expire: BigNumberish;
  supplierId: string;
  chainId: BigNumberish;
  requestHash: string;
  optionsHash: string;
  paymentHash: string;
  cancelHash: string;
  transferable: boolean;
  checkIn: BigNumberish;
}

export interface Offer {
  request: Request;
  options: unknown;
  payment: PaymentOption[];
  cancel: CancelOption[];
  payload: OfferPayload;
  signature: string;
}

export const randomId = (): string =>
  utils.solidityKeccak256(
    ['string'],
    [
      Math.random()
        .toString(16)
        .replace('.', '')
        .split('')
        .sort(() => (Math.random() > 0.5 ? 1 : -1))
        .join('')
        .slice(0, 14),
    ],
  );

export const createSupplierId = (address: string, salt: string): string =>
  utils.solidityKeccak256(['address', 'bytes32'], [address, salt]);

export const hashObject = (request: unknown): string =>
  utils.solidityKeccak256(['string'], [JSON.stringify(request)]);

export const hashPaymentOption = (option: PaymentOption): string =>
  utils.solidityKeccak256(
    ['bytes32', 'bytes32', 'uint256', 'address'],
    [PAYMENT_OPTION_TYPE_HASH, option.id, option.price, option.asset],
  );

export const hashCancelOption = (option: CancelOption): string =>
  utils.solidityKeccak256(
    ['bytes32', 'uint256', 'uint256'],
    [CANCEL_OPTION_TYPE_HASH, option.time, option.penalty],
  );

export const hashPaymentOptionArray = (options: PaymentOption[]): string => {
  const hashes = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashPaymentOption(options[i]);
  }
  return utils.solidityKeccak256(['bytes32[]'], [hashes]);
};

export const hashCancelOptionArray = (options: CancelOption[]): string => {
  const hashes = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashCancelOption(options[i]);
  }

  return utils.solidityKeccak256(['bytes32[]'], [hashes]);
};

export const hashOfferPayload = (payload: OfferPayload): string =>
  utils.solidityKeccak256(
    [
      'bytes32',
      'bytes32',
      'uint256',
      'bytes32',
      'uint256',
      'bytes32',
      'bytes32',
      'bytes32',
      'bytes32',
      'bool',
      'uint256',
    ],
    [
      OFFER_TYPE_HASH,
      payload.id,
      payload.expire,
      payload.supplierId,
      payload.chainId,
      payload.requestHash,
      payload.optionsHash,
      payload.paymentHash,
      payload.cancelHash,
      payload.transferable,
      payload.checkIn,
    ],
  );

export const offerEip712Types: Record<string, Array<TypedDataField>> = {
  Offer: [
    {
      name: 'id',
      type: 'bytes32',
    },
    {
      name: 'expire',
      type: 'uint256',
    },
    {
      name: 'supplierId',
      type: 'bytes32',
    },
    {
      name: 'chainId',
      type: 'uint256',
    },
    {
      name: 'requestHash',
      type: 'bytes32',
    },
    {
      name: 'optionsHash',
      type: 'bytes32',
    },
    {
      name: 'paymentHash',
      type: 'bytes32',
    },
    {
      name: 'cancelHash',
      type: 'bytes32',
    },
    {
      name: 'transferable',
      type: 'bool',
    },
    {
      name: 'checkIn',
      type: 'uint256',
    },
  ],
};

export const buildRandomOffer = async (
  supplierId: string,
  signer: Wallet,
  name: string,
  version: string,
  chainId: BigNumberish,
  verifyingContract: string,
  erc20address: string,
): Promise<Offer> => {
  const request: Request = {
    id: randomId(),
    expire: BigNumber.from(Math.round(Date.now() / 1000) + 10000),
    nonce: nonces.request++,
    topic: Math.random().toString(),
    query: {},
  };

  const payment: PaymentOption[] = [
    {
      id: randomId(),
      price: BigNumber.from('1'),
      asset: erc20address,
    },
  ];

  const checkInTime = BigNumber.from(Math.round(Date.now() / 1000) + 100000);

  const cancel: CancelOption[] = [
    {
      time: checkInTime,
      penalty: BigNumber.from('100'),
    },
  ];

  const offerPayload: OfferPayload = {
    id: randomId(),
    expire: BigNumber.from(Math.round(Date.now() / 1000) + 20000),
    supplierId: supplierId,
    chainId: BigNumber.from(270),
    requestHash: hashObject(request),
    optionsHash: hashObject({}),
    paymentHash: hashPaymentOptionArray(payment),
    cancelHash: hashCancelOptionArray(cancel),
    transferable: Math.random() > 0.5,
    checkIn: checkInTime,
  };

  const signature = await signer._signTypedData(
    {
      name,
      version,
      chainId,
      verifyingContract,
    },
    offerEip712Types,
    offerPayload,
  );

  const offer: Offer = {
    request,
    options: {},
    payment,
    cancel,
    payload: offerPayload,
    signature,
  };

  return offer;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const structEqual = (struct: { [k: string]: any }, obj: { [k: string]: any }) => {
  for (const key of Object.keys(obj)) {
    expect(obj[key]).to.eq(struct[key]);
  }
};
