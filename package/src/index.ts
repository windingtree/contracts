import ConfigJson from '../artifacts/contracts/Config.sol/Config.json' assert { type: 'json' };
import EntitiesRegistryJson from '../artifacts/contracts/EntitiesRegistry.sol/EntitiesRegistry.json' assert { type: 'json' };
import MarketJson from '../artifacts/contracts/Market.sol/Market.json' assert { type: 'json' };
import ERC20PermitJson from '../artifacts/contracts/test/MockERC20Dec18Permit.sol/MockERC20Dec18Permit.json' assert { type: 'json' };
import ERC20Json from '../artifacts/contracts/test/MockERC20Dec18.sol/MockERC20Dec18.json' assert { type: 'json' };
import ERC20Permit6Json from '../artifacts/contracts/test/MockERC20Dec6Permit.sol/MockERC20Dec6Permit.json' assert { type: 'json' };
import ERC206Json from '../artifacts/contracts/test/MockERC20Dec6.sol/MockERC20Dec6.json' assert { type: 'json' };
export {
  ConfigJson,
  EntitiesRegistryJson,
  MarketJson,
  ERC20PermitJson,
  ERC20Json,
  ERC20Permit6Json,
  ERC206Json,
};
export * from './constants.js';
export * from '../wagmi/index.js';
export * from './hash.js';
