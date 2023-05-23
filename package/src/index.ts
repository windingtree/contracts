import ConfigJson from '../artifacts/contracts/Config.sol/Config.json';
import EntitiesRegistryJson from '../artifacts/contracts/EntitiesRegistry.sol/EntitiesRegistry.json';
import MarketJson from '../artifacts/contracts/Market.sol/Market.json';
import ERC20PermitJson from '../artifacts/contracts/test/MockERC20Dec18Permit.sol/MockERC20Dec18Permit.json';
import ERC20Json from '../artifacts/contracts/test/MockERC20Dec18.sol/MockERC20Dec18.json';
import ERC20Permit6Json from '../artifacts/contracts/test/MockERC20Dec6Permit.sol/MockERC20Dec6Permit.json';
import ERC206Json from '../artifacts/contracts/test/MockERC20Dec6.sol/MockERC20Dec6.json';

export * from '../typechain';
export {
  MockERC20Dec18Permit as ERC20Permit,
  MockERC20Dec18Permit__factory as ERC20Permit__factory,
  MockERC20Dec18 as ERC20,
  MockERC20Dec18__factory as ERC20__factory,
  MockERC20Dec6Permit as ERC20Permit6,
  MockERC20Dec6Permit__factory as ERC20Permit6__factory,
  MockERC20Dec6 as ERC20_6,
  MockERC20Dec6__factory as ERC20_6__factory,
} from '../typechain';
export * from './constants';
export {
  ConfigJson,
  EntitiesRegistryJson,
  MarketJson,
  ERC20PermitJson,
  ERC20Json,
  ERC20Permit6Json,
  ERC206Json,
};
