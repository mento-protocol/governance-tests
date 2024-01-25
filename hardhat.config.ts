import { HardhatUserConfig } from 'hardhat/config';
import { NetworkConfig, networks, NetworkName } from './config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-foundry';

function getNetworkConfig(): NetworkConfig {
  const network = process.env.NETWORK;
  if (!network) {
    throw new Error('NETWORK environment variable was not set');
  }
  if (!networks[network as NetworkName]) {
    throw new Error(
      'Invalid network, NETWORK env var must be `alfajores`, `baklava`, or `celo`',
    );
  }

  return networks[network as NetworkName];
}

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: getNetworkConfig().url,
      },
      chainId: getNetworkConfig().chainId,
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
