// Protocol entities types (kinds) as object
export const kinds = {
  // 'supplier'
  supplier: '0x737570706c696572000000000000000000000000000000000000000000000000',
  // 'retailer'
  retailer: '0x72657461696c6572000000000000000000000000000000000000000000000000',
};

// viem.encodePacked(
//   ['string'],
//   ['PaymentOption(bytes32 id,uint256 price,address asset)'],
// );
export const PAYMENT_OPTION_TYPE_HASH =
  '0x2f8fc0b3ad3f58f6deb367673d38e4112a3c8c64de033c5b780b84ef8f67cde6';

// viem.encodePacked(
//   ['string'],
//   ['CancelOption(uint256 time,uint256 penalty)'],
// );
export const CANCEL_OPTION_TYPE_HASH =
  '0x8ea27057ea8a0239f02c8b75748218a035a5a2a2a0785b53aaa99af91ff538c5';

// viem.encodePacked(
//   ['string'],
//   [
//     'Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn)',
//   ],
// );
export const OFFER_TYPE_HASH =
  '0x4fb12343a6f44152999c71291770d97fc1eace9d7d04889330d5a6d1af4a57c7';

// viem.encodePacked(
//   ['string'],
//   [
//     'Voucher(bytes32 id,address signer)',
//   ],
// );
export const CHECK_IN_TYPE_HASH =
  '0xf811d7f3ddb148410001929e2cbfb7fea8779b9349b7c2f650fa91840528d69c';

/** EIP-712 JSON schema types for offer */
export const offerEip712Types = {
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
    {
      name: 'checkOut',
      type: 'uint256',
    },
  ],
} as const;

/** EIP-712 JSON schema types for checkIn/Out voucher */
export const checkInOutEip712Types = {
  Voucher: [
    {
      name: 'id',
      type: 'bytes32',
    },
    {
      name: 'signer',
      type: 'address',
    },
  ],
} as const;
