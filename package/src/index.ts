import ConfigJson from '../artifacts/contracts/Config.sol/Config.json';
import EntitiesRegistryJson from '../artifacts/contracts/EntitiesRegistry.sol/EntitiesRegistry.json';
import MarketJson from '../artifacts/contracts/Market.sol/Market.json';
import ERC20PermitJson from '../artifacts/contracts/test/MockERC20Dec18Permit.sol/MockERC20Dec18Permit.json';

export * from '../typechain';
export {
  MockERC20Dec18Permit as ERC20Permit,
  MockERC20Dec18Permit__factory as ERC20Permit__factory,
} from '../typechain';
export * from './constants';
export { ConfigJson, EntitiesRegistryJson, MarketJson, ERC20PermitJson };
