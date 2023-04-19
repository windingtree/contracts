// ethers.utils.solidityKeccak256(
//   ['string'],
//   ['PaymentOption(string id,uint256 price,address asset)'],
// );
export const PAYMENT_OPTION_TYPE_HASH =
  '0x21e94f50acfd0299dfc65a494d626baf55cb6ab601752f1da4b3aa16f82fdb99';

// ethers.utils.solidityKeccak256(
//   ['string'],
//   ['CancelOption(uint256 time,uint256 penalty)'],
// );
export const CANCEL_OPTION_TYPE_HASH =
  '0x8ea27057ea8a0239f02c8b75748218a035a5a2a2a0785b53aaa99af91ff538c5';

// ethers.utils.solidityKeccak256(
//   ['string'],
//   [
//     'Offer(bytes32 id,uint256 expire,bytes32 supplierId,uint256 chainId,bytes32 requestHash,bytes32 optionsHash,bytes32 paymentHash,bytes32 cancelHash,bool transferable,uint256 checkIn)',
//   ],
// );
export const OFFER_TYPE_HASH =
  '0xcf2addd2f89a78825d3f130a17e47b4e9963adfd09837fa9c454569faa073354';
