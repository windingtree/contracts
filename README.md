[![@windingtree/contracts](https://img.shields.io/npm/v/@windingtree/contracts)](https://www.npmjs.com/package/@windingtree/contracts)
[![Beta Release](https://github.com/windingtree/contracts/actions/workflows/release.yml/badge.svg?branch=beta)](https://github.com/windingtree/contracts/actions/workflows/release.yml)

# @windingtree/contracts

The WindingTree market protocol smart contracts and utilities

## Deployments

### Polygon zkEVM

- Config ([0x098b1d12cAfE7315C77b6d308A62ce02806260Ee](https://explorer.public.zkevm-test.net/address/0x098b1d12cAfE7315C77b6d308A62ce02806260Ee/read-proxy#address-tabs)): the protocol configuration smart contract
- EntitiesRegistry ([0x4bB51528C83844b509E1152EEb05260eE1bf60e6](https://explorer.public.zkevm-test.net/address/0x4bB51528C83844b509E1152EEb05260eE1bf60e6/read-proxy#address-tabs)): the protocol identity management
- Market ([0xDd5B6ffB3585E109ECddec5293e31cdc1e9DeD57](https://explorer.public.zkevm-test.net/address/0xDd5B6ffB3585E109ECddec5293e31cdc1e9DeD57/read-proxy#address-tabs)): the protocol entry point
- LIF ([0xba515AB7FfDa899a2e6c8FDbcDf351c8c15f4009](https://explorer.public.zkevm-test.net/address/0xba515AB7FfDa899a2e6c8FDbcDf351c8c15f4009/read-proxy#address-tabs)): Test version of LIF token

## Install package

```bash
yarn add @windingtree/contracts
```

## Setup

```bash
yarn
yarn build:contracts
```

## Testing

```bash
yarn test:contracts
```

## Contributing

[Contribution guidelines](https://windingtree.github.io/sdk/#/docs/contribution)
