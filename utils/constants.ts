import { utils, BigNumber } from 'ethers';

// Protocol entities types (kinds) as object
export const kinds = {
  supplier: utils.formatBytes32String('supplier'),
  retailer: utils.formatBytes32String('retailer'),
};

// Protocol entities types (kinds) as values array
export const kindsArr = Object.values(kinds);

// Protocol defaults
export const eip712name = 'Market';
export const eip712version = '1';
export const minDeposit = BigNumber.from('1000000000000000000000');
export const claimPeriod = BigNumber.from('60');
export const protocolFee = BigNumber.from('1');
export const retailerFee = BigNumber.from('1');
