import { BigNumber } from "ethers";

export interface Request {
  id: string;
  expire: BigNumber;
  nonce: BigNumber;
  topic: string;
  query: unknown;
}

export interface PaymentOption {
  id: string;
  price: BigNumber;
  asset: string;
}

export interface CancelOption {
  time: BigNumber;
  penalty: BigNumber;
}

export interface OfferPayload {
  id: string;
  expire: BigNumber;
  supplierId: string;
  chainId: BigNumber;
  requestHash: string;
  optionsHash: string;
  paymentHash: string;
  cancelHash: string;
  transferable: boolean;
  checkIn: BigNumber;
  checkOut: BigNumber;
}

export interface Offer {
  request: Request;
  options: unknown;
  payment: PaymentOption[];
  cancel: CancelOption[];
  payload: OfferPayload;
  signature: string;
}
