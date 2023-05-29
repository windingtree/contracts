import { Hash, Address, keccak256, toHex, stringify, encodePacked } from 'viem';
import {
  CANCEL_OPTION_TYPE_HASH,
  OFFER_TYPE_HASH,
  PAYMENT_OPTION_TYPE_HASH,
} from './constants.js';

/** Offered payment option type */
export interface PaymentOption {
  /** Unique payment option Id */
  id: Hash;
  /** Asset price in WEI */
  price: bigint;
  /** ERC20 asset contract address */
  asset: Address;
}

/** Offered cancellation option type */
export interface CancelOption {
  /** Seconds before checkIn */
  time: bigint;
  /** Percents of total sum */
  penalty: bigint;
}

/** Unsigned offer payload type */
export interface UnsignedOfferPayload extends Record<string, unknown> {
  /** Unique Offer Id */
  id: Hash;
  /** Expiration time */
  expire: bigint;
  /** Unique supplier Id registered on the protocol contract */
  supplierId: Hash;
  /** Target network chain Id */
  chainId: bigint;
  /** <keccak256(request.hash())> */
  requestHash: Hash;
  /** <keccak256(hash(offer.options))> */
  optionsHash: Hash;
  /** <keccak256(hash(offer.payment))> */
  paymentHash: Hash;
  /** <keccak256(hash(offer.cancel || []))> */
  cancelHash: Hash;
  /** Makes the deal NFT transferable or not */
  transferable: boolean;
  /** Check-in time in seconds */
  checkIn: bigint;
  /** Check-out time in seconds */
  checkOut: bigint;
}

/**
 * Converts an object that contains bigint values to a JSON string representation.
 *
 * @param {unknown} data The data to stringify.
 * @returns {string} The JSON string representation of the data.
 */
export { stringify };

/**
 * Generates simple unique Id
 *
 * @param {number} [length=14] Default is `14`
 * @returns {string}
 */
export const simpleUid = (length = 14): string => {
  if (length < 5 || length > 14) {
    throw new Error('Length value must be between 5 and 14');
  }
  return Math.random()
    .toString(16)
    .replace('.', '')
    .split('')
    .sort(() => (Math.random() > 0.5 ? 1 : -1))
    .join('')
    .slice(0, length);
};

/**
 * Generates random salt (bytes32 string)
 *
 * @returns {Hash}
 */
export const randomSalt = (): Hash => keccak256(toHex(simpleUid()));

/**
 * Computes the keccak256 hash of an object.
 *
 * @param {unknown} data The data object to hash.
 * @returns {Hash} The keccak256 hash of the data.
 */
export const hashObject = (data: unknown): Hash => {
  return keccak256(toHex(stringify(data)));
};

/**
 * Computes the keccak256 hash of a PaymentOption object.
 *
 * @param {PaymentOption} option The PaymentOption object to hash.
 * @returns {Hash} The keccak256 hash of the PaymentOption.
 */
export const hashPaymentOption = (option: PaymentOption): Hash => {
  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'uint256', 'address'],
      [PAYMENT_OPTION_TYPE_HASH, option.id, option.price, option.asset],
    ),
  );
};

/**
 * Computes the keccak256 hash of a CancelOption object.
 *
 * @param {CancelOption} option The CancelOption object to hash.
 * @returns {Hash} The keccak256 hash of the CancelOption.
 */
export const hashCancelOption = (option: CancelOption): Hash => {
  return keccak256(
    encodePacked(
      ['bytes32', 'uint256', 'uint256'],
      [CANCEL_OPTION_TYPE_HASH, option.time, option.penalty],
    ),
  );
};

/**
 * Computes the keccak256 hash of an array of PaymentOption objects.
 *
 * @param {PaymentOption[]} options The array of PaymentOption objects to hash.
 * @returns {Hash} The keccak256 hash of the PaymentOption array.
 */
export const hashPaymentOptionArray = (options: PaymentOption[]): Hash => {
  const hashes: Hash[] = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashPaymentOption(options[i]);
  }

  return keccak256(encodePacked(['bytes32[]'], [hashes]));
};

/**
 * Computes the keccak256 hash of an array of CancelOption objects.
 *
 * @param {CancelOption[]} options The array of CancelOption objects to hash.
 * @returns {Hash} The keccak256 hash of the CancelOption array.
 */
export const hashCancelOptionArray = (options: CancelOption[]): Hash => {
  const hashes: Hash[] = [];

  for (let i = 0; i < options.length; i++) {
    hashes[i] = hashCancelOption(options[i]);
  }

  return keccak256(encodePacked(['bytes32[]'], [hashes]));
};

/**
 * Computes the keccak256 hash of an UnsignedOfferPayload object.
 *
 * @param {UnsignedOfferPayload} payload The UnsignedOfferPayload object to hash.
 * @returns {Hash} The keccak256 hash of the UnsignedOfferPayload.
 */
export const hashOfferPayload = (payload: UnsignedOfferPayload): Hash => {
  return keccak256(
    encodePacked(
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
        payload.checkOut,
      ],
    ),
  );
};

/**
 * Computes the keccak256 hash of a CheckInOut voucher.
 *
 * @param {string} offerId The ID of the offer.
 * @param {string} signer The signer's address.
 * @returns {Hash} The keccak256 hash of the CheckInOut operation.
 */
export const hashCheckInOut = (offerId: Hash, signer: Address): Hash => {
  return keccak256(
    encodePacked(['bytes32', 'bytes32', 'address'], [OFFER_TYPE_HASH, offerId, signer]),
  );
};
