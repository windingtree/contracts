/* eslint-disable @typescript-eslint/no-explicit-any */
import { utils, BigNumber, TypedDataField, VoidSigner } from "ethers";
import {
  PAYMENT_OPTION_TYPE_HASH,
  CANCEL_OPTION_TYPE_HASH,
  OFFER_TYPE_HASH,
} from "./constants";
import { MockERC20Dec18Permit } from "../typechain";
import {
  PaymentOption,
  CancelOption,
  OfferPayload,
  Offer,
  Request,
} from "./types";

export const randomId = (): string =>
  utils.solidityKeccak256(
    ["string"],
    [
      Math.random()
        .toString(16)
        .replace(".", "")
        .split("")
        .sort(() => (Math.random() > 0.5 ? 1 : -1))
        .join("")
        .slice(0, 14),
    ]
  );

export const createSupplierId = (address: string, salt: string): string =>
  utils.solidityKeccak256(["address", "bytes32"], [address, salt]);

export const hashObject = (request: unknown): string =>
  utils.solidityKeccak256(["string"], [JSON.stringify(request)]);

export const hashPaymentOption = (option: PaymentOption): string =>
  utils.solidityKeccak256(
    ["bytes32", "bytes32", "uint256", "address"],
    [PAYMENT_OPTION_TYPE_HASH, option.id, option.price, option.asset]
  );

export const hashCancelOption = (option: CancelOption): string =>
  utils.solidityKeccak256(
    ["bytes32", "uint256", "uint256"],
    [CANCEL_OPTION_TYPE_HASH, option.time, option.penalty]
  );

export const hashPaymentOptionArray = (options: PaymentOption[]): string => {
  const hashes = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashPaymentOption(options[i]);
  }
  return utils.solidityKeccak256(["bytes32[]"], [hashes]);
};

export const hashCancelOptionArray = (options: CancelOption[]): string => {
  const hashes = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashCancelOption(options[i]);
  }

  return utils.solidityKeccak256(["bytes32[]"], [hashes]);
};

export const hashOfferPayload = (payload: OfferPayload): string =>
  utils.solidityKeccak256(
    [
      "bytes32",
      "bytes32",
      "uint256",
      "bytes32",
      "uint256",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bool",
      "uint256",
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
    ]
  );

export const hashCheckInOut = (offerId: string, signer: string): string =>
  utils.solidityKeccak256(
    ["bytes32", "bytes32", "address"],
    [OFFER_TYPE_HASH, offerId, signer]
  );

export const offerEip712Types: Record<string, Array<TypedDataField>> = {
  Offer: [
    {
      name: "id",
      type: "bytes32",
    },
    {
      name: "expire",
      type: "uint256",
    },
    {
      name: "supplierId",
      type: "bytes32",
    },
    {
      name: "chainId",
      type: "uint256",
    },
    {
      name: "requestHash",
      type: "bytes32",
    },
    {
      name: "optionsHash",
      type: "bytes32",
    },
    {
      name: "paymentHash",
      type: "bytes32",
    },
    {
      name: "cancelHash",
      type: "bytes32",
    },
    {
      name: "transferable",
      type: "bool",
    },
    {
      name: "checkIn",
      type: "uint256",
    },
  ],
};

export const checkInOutTypes: Record<string, Array<TypedDataField>> = {
  Voucher: [
    {
      name: "id",
      type: "bytes32",
    },
    {
      name: "signer",
      type: "address",
    },
  ],
};

export const createCheckInOutSignature = async (
  signer: VoidSigner,
  offerId: string,
  name: string,
  version: string,
  chainId: BigNumber,
  verifyingContract: string
): Promise<string> =>
  await signer._signTypedData(
    {
      name,
      version,
      chainId,
      verifyingContract,
    },
    checkInOutTypes,
    {
      id: offerId,
      signer: signer.address,
    }
  );

export const createPermitSignature = async (
  signer: VoidSigner,
  erc20: MockERC20Dec18Permit,
  owner: string,
  spender: string,
  value: BigNumber,
  deadline: number,
  version = "1"
): Promise<string> => {
  const nonce = await erc20.nonces(owner);
  const name = await erc20.name();
  const chainId = await signer.getChainId();

  return await signer._signTypedData(
    {
      name,
      version,
      chainId,
      verifyingContract: erc20.address,
    },
    {
      Permit: [
        {
          name: "owner",
          type: "address",
        },
        {
          name: "spender",
          type: "address",
        },
        {
          name: "value",
          type: "uint256",
        },
        {
          name: "nonce",
          type: "uint256",
        },
        {
          name: "deadline",
          type: "uint256",
        },
      ],
    },
    {
      owner,
      spender,
      value,
      nonce,
      deadline,
    }
  );
};

export const getCancelPenalty = (
  options: CancelOption[],
  timestamp: BigNumber
) => {
  let selectedTime = BigNumber.from(0);
  let selectedPenalty = BigNumber.from(0);

  for (const option of options) {
    if (
      timestamp.gte(option.time) &&
      (selectedTime.isZero() || option.time.lt(selectedTime))
    ) {
      selectedTime = option.time;
      selectedPenalty = option.penalty;
    }
  }

  return selectedPenalty.lte(BigNumber.from(100))
    ? selectedPenalty
    : BigNumber.from(100);
};

export const buildOffer = async (
  signer: VoidSigner,
  supplierId: string,
  expire: BigNumber,
  checkIn: BigNumber,
  checkOut: BigNumber,
  request: Request,
  offerOptions: object,
  payment: PaymentOption[],
  cancel: CancelOption[],
  transferableOverride: boolean,
  name: string,
  version: string,
  chainId: BigNumber,
  verifyingContract: string
): Promise<Offer> => {
  const offerPayload: OfferPayload = {
    id: randomId(),
    expire,
    supplierId: supplierId,
    chainId,
    requestHash: hashObject(request),
    optionsHash: hashObject(offerOptions),
    paymentHash: hashPaymentOptionArray(payment),
    cancelHash: hashCancelOptionArray(cancel),
    transferable: transferableOverride ?? Math.random() > 0.5,
    checkIn,
    checkOut,
  };

  const signature = await signer._signTypedData(
    {
      name,
      version,
      chainId,
      verifyingContract,
    },
    offerEip712Types,
    offerPayload
  );

  const offer: Offer = {
    request,
    options: offerOptions,
    payment,
    cancel,
    payload: offerPayload,
    signature,
  };

  return offer;
};
