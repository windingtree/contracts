import { utils, BigNumber } from "ethers";

// Protocol entities types (kinds) as object
export const kinds = {
  supplier: utils.formatBytes32String("supplier"),
  retailer: utils.formatBytes32String("retailer"),
};

// Protocol entities types (kinds) as values array
export const kindsArr = Object.values(kinds);

// Protocol defaults
export const eip712name = "Market";
export const eip712version = "1";
export const minDeposit = BigNumber.from("1000000000000000000000");
export const claimPeriod = BigNumber.from("60");
export const protocolFee = BigNumber.from("1");
export const retailerFee = BigNumber.from("1");

// ethers.solidityPackedKeccak256(
//   ['string'],
//   ['PaymentOption(bytes32 id,uint256 price,address asset)'],
// );
export const PAYMENT_OPTION_TYPE_HASH =
  "0x2f8fc0b3ad3f58f6deb367673d38e4112a3c8c64de033c5b780b84ef8f67cde6";

// ethers.solidityPackedKeccak256(
//   ['string'],
//   ['CancelOption(uint256 time,uint256 penalty)'],
// );
export const CANCEL_OPTION_TYPE_HASH =
  "0x8ea27057ea8a0239f02c8b75748218a035a5a2a2a0785b53aaa99af91ff538c5";

// ethers.solidityPackedKeccak256(
//   ['string'],
//   [
//     'Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn)',
//   ],
// );
export const OFFER_TYPE_HASH =
  "0x4fb12343a6f44152999c71291770d97fc1eace9d7d04889330d5a6d1af4a57c7";

// ethers.solidityPackedKeccak256(
//   ['string'],
//   [
//     'Voucher(bytes32 id,address signer)',
//   ],
// );
export const CHECK_IN_TYPE_HASH =
  "0xf811d7f3ddb148410001929e2cbfb7fea8779b9349b7c2f650fa91840528d69c";

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
