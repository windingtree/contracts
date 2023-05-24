/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import {
  utils,
  BigNumber,
  TypedDataField,
  VoidSigner,
  ContractTransaction,
} from "ethers";
import { MockERC20Dec18Permit } from "../typechain";
import {
  PaymentOption,
  CancelOption,
  OfferPayload,
  Offer,
  Request,
} from "../utils/types";

export const nonces: Record<string, number> = {
  request: 1,
};

export const PAYMENT_OPTION_TYPE_HASH =
  "0x2f8fc0b3ad3f58f6deb367673d38e4112a3c8c64de033c5b780b84ef8f67cde6";

export const CANCEL_OPTION_TYPE_HASH =
  "0x8ea27057ea8a0239f02c8b75748218a035a5a2a2a0785b53aaa99af91ff538c5";

export const OFFER_TYPE_HASH =
  "0xcf2addd2f89a78825d3f130a17e47b4e9963adfd09837fa9c454569faa073354";

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

export const buildRandomOffer = async (
  supplierId: string,
  signer: VoidSigner,
  name: string,
  version: string,
  chainId: BigNumber,
  verifyingContract: string,
  erc20address: string,
  transferableOverride?: boolean,
  timestamp = BigNumber.from(Math.round(Date.now() / 1000))
): Promise<Offer> => {
  const request: Request = {
    id: randomId(),
    expire: timestamp.add(BigNumber.from(3600)),
    nonce: BigNumber.from(nonces.request++),
    topic: Math.random().toString(),
    query: {},
  };

  const payment: PaymentOption[] = [
    {
      id: randomId(),
      price: BigNumber.from("100"),
      asset: erc20address,
    },
  ];

  const checkInTime = timestamp.add(BigNumber.from(3600));

  const cancel: CancelOption[] = [
    {
      time: checkInTime.sub(BigNumber.from(1200)),
      penalty: BigNumber.from("50"),
    },
    {
      time: checkInTime.sub(BigNumber.from(60)),
      penalty: BigNumber.from("100"),
    },
  ];

  const offerPayload: OfferPayload = {
    id: randomId(),
    expire: timestamp.add(BigNumber.from(1200)),
    supplierId: supplierId,
    chainId: BigNumber.from(270),
    requestHash: hashObject(request),
    optionsHash: hashObject({}),
    paymentHash: hashPaymentOptionArray(payment),
    cancelHash: hashCancelOptionArray(cancel),
    transferable: transferableOverride ?? Math.random() > 0.5,
    checkIn: checkInTime,
    checkOut: checkInTime.add(BigNumber.from(7200)),
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
    options: {},
    payment,
    cancel,
    payload: offerPayload,
    signature,
  };

  return offer;
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

export const structEqual = (
  struct: { [k: string]: any },
  obj: { [k: string]: any },
  structName = ""
) => {
  for (const key of Object.keys(obj)) {
    expect(obj[key]).to.eq(
      struct[key],
      `'${structName}.${key}' value validation failed`
    );
  }
};

export const getEventArgs = async <T>(
  tx: ContractTransaction,
  name: string
) => {
  const { events } = await tx.wait();

  if (events) {
    for (const event of events) {
      if (event.event === name) {
        return event.args as T;
      }
    }
  }

  throw new Error(`Event ${name} not found in the transaction ${tx.hash}`);
};
