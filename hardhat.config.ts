import { config as dotEnvConfig } from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import { NetworkConfig, networks, NetworkName } from './config';
import '@nomicfoundation/hardhat-toolbox';

dotEnvConfig({ path: `.env.${process.env.NETWORK}` });

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
      gasPrice: 0,
    },
  },
  solidity: {
    version: '0.8.18',
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
};

export default config;
