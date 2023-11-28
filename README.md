[![@windingtree/contracts](https://img.shields.io/npm/v/@windingtree/contracts)](https://www.npmjs.com/package/@windingtree/contracts)
[![Beta Release](https://github.com/windingtree/contracts/actions/workflows/release.yml/badge.svg?branch=beta)](https://github.com/windingtree/contracts/actions/workflows/release.yml)

# @windingtree/contracts

The WindingTree market protocol smart contracts and utilities

## Deployments

### Polygon zkEVM

- Config ([0x098b1d12cAfE7315C77b6d308A62ce02806260Ee](https://explorer.public.zkevm-test.net/address/0x098b1d12cAfE7315C77b6d308A62ce02806260Ee/read-proxy#address-tabs)): the protocol configuration smart contract
- EntitiesRegistry ([0x4bB51528C83844b509E1152EEb05260eE1bf60e6](https://explorer.public.zkevm-test.net/address/0x4bB51528C83844b509E1152EEb05260eE1bf60e6/read-proxy#address-tabs)): the protocol identity management
- Market ([0xDd5B6ffB3585E109ECddec5293e31cdc1e9DeD57](https://explorer.public.zkevm-test.net/address/0xDd5B6ffB3585E109ECddec5293e31cdc1e9DeD57/read-proxy#address-tabs)): the protocol entry point
- LIF ([0x4d60F4483BaA654CdAF1c5734D9E6B16735efCF8](https://explorer.public.zkevm-test.net/address/0x4d60F4483BaA654CdAF1c5734D9E6B16735efCF8/read-proxy#address-tabs)): Test version of LIF token

#### Testing tokens

- `STABLE6`: [ERC20, 6 decimals, no permit](https://explorer.public.zkevm-test.net/address/0x8CB96383609C56af1Fe44DB7591F94AEE2fa43b2/read-proxy#address-tabs)
- `STABLE6PERMIT`: [ERC20, 6 decimals, with permit](https://explorer.public.zkevm-test.net/address/0x4556d5C1486d799f67FA96c84F1d0552486CAAF4/read-proxy#address-tabs)
- `STABLE18`: [ERC20, 18 decimals, no permit](https://explorer.public.zkevm-test.net/address/0x4EcB659060Da61D795D777bb21BAe3599b301C66/read-proxy#address-tabs)
- `STABLE18PERMIT`: [ERC20, 18 decimals, with permit](https://explorer.public.zkevm-test.net/address/0xF54784206A53EF19fd3024D8cdc7A6251A4A0d67/read-proxy#address-tabs)

### Gnosis Chiado

- Config ([0x4556d5C1486d799f67FA96c84F1d0552486CAAF4](https://gnosis-chiado.blockscout.com/address/0x4556d5C1486d799f67FA96c84F1d0552486CAAF4?tab=read_proxy)): the protocol configuration smart contract
- EntitiesRegistry ([0x4EcB659060Da61D795D777bb21BAe3599b301C66](https://gnosis-chiado.blockscout.com/address/0x4EcB659060Da61D795D777bb21BAe3599b301C66?tab=read_proxy)): the protocol identity management
- Market ([0xF54784206A53EF19fd3024D8cdc7A6251A4A0d67](https://gnosis-chiado.blockscout.com/address/0xF54784206A53EF19fd3024D8cdc7A6251A4A0d67?tab=read_proxy)): the protocol entry point
- LIF ([0x8CB96383609C56af1Fe44DB7591F94AEE2fa43b2](https://gnosis-chiado.blockscout.com/address/0x8CB96383609C56af1Fe44DB7591F94AEE2fa43b2?tab=read_proxy)): Test version of LIF token

#### Testing tokens

- `STABLE6`: [ERC20, 6 decimals, no permit](https://gnosis-chiado.blockscout.com/address/0xcC28A4e6DEF318A1b88CF34c4F2Eeb2489995513?tab=read_proxy)
- `STABLE6PERMIT`: [ERC20, 6 decimals, with permit](https://gnosis-chiado.blockscout.com/address/0x78F924A7C70213D502E6110567AC556c2EFBBF73?tab=read_proxy)
- `STABLE18`: [ERC20, 18 decimals, no permit](https://gnosis-chiado.blockscout.com/address/0x7067fC74fFCf4096796454747461D098E6bF7241?tab=read_proxy)
- `STABLE18PERMIT`: [ERC20, 18 decimals, with permit](https://gnosis-chiado.blockscout.com/address/0x44947d69A9F06EF48170BD41Da9B27E74ecd0891?tab=read_proxy)

## Install package

```bash
pnpm add @windingtree/contracts
```

## Setup

```bash
pnpm
pnpm build:contracts
```

## Testing

```bash
pnpm test:contracts
```

## Contributing

[Contribution guidelines](https://windingtree.github.io/sdk/#/docs/contribution)
