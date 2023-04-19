import { utils, TypedDataField, Wallet } from 'ethers';
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
  expire: number;
  nonce: number;
  topic: string;
  query: unknown;
}

export interface PaymentOption {
  id: string;
  price: string;
  asset: string;
}

export interface CancelOption {
  time: number;
  penalty: number;
}

export interface OfferPayload {
  id: string;
  expire: number;
  supplierId: string;
  chainId: number;
  requestHash: string;
  optionsHash: string;
  paymentHash: string;
  cancelHash: string;
  transferable: boolean;
  checkIn: number;
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
  signer: Wallet,
  verifyingContract: string,
  erc20address: string,
): Promise<Offer> => {
  const request: Request = {
    id: randomId(),
    expire: Math.round(Date.now() / 1000) + 10000,
    nonce: nonces.request++,
    topic: Math.random().toString(),
    query: {},
  };

  const payment: PaymentOption[] = [
    {
      id: randomId(),
      price: '1',
      asset: erc20address,
    },
  ];

  const checkInTime = Math.round(Date.now() / 1000) + 100000;

  const cancel: CancelOption[] = [
    {
      time: checkInTime,
      penalty: 100,
    },
  ];

  const offerPayload: OfferPayload = {
    id: randomId(),
    expire: Math.round(Date.now() / 1000) + 20000,
    supplierId: randomId(),
    chainId: 270,
    requestHash: hashObject(request),
    optionsHash: hashObject({}),
    paymentHash: hashPaymentOptionArray(payment),
    cancelHash: hashCancelOptionArray(cancel),
    transferable: Math.random() > 0.5,
    checkIn: checkInTime,
  };

  const signature = await signer._signTypedData(
    {
      name: 'Market',
      version: '1',
      chainId: 270,
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
