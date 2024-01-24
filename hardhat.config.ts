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
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  solidity: {
    compilers: [
      {
        version: '0.5.0',
      },
      {
        version: '0.5.13',
      },
      {
        version: '0.5.17',
      },
      {
        version: '0.8.18',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
};

export default config;
