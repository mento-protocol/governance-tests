import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-foundry';

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        // blockNumber: 13100000, // Set to governance deployment block
        enabled: true,
        url: `https://alfajores-forno.celo-testnet.org`,
      },
      chainId: 44787,
      hardfork: 'berlin',
    },
  },
  paths: {
    sources: './lib/mento-core/contracts',
  },
};

export default config;
