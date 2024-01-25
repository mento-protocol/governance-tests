import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-foundry';

const errMessage =
  'Invalid network, NETWORK env var must be `alfajores`, `baklava`, or `celo`';

const network = process.env.NETWORK;
if (!network) {
  throw new Error('NETWORK environment variable not found');
}

function getNetworkUrl(): string {
  switch (network) {
    case 'alfajores':
      return 'https://alfajores-forno.celo-testnet.org';
    case 'baklava':
      return 'https://baklava-forno.celo-testnet.org';
    case 'celo':
      return 'https://forno.celo.org';
    default:
      throw new Error(errMessage);
  }
}

function getNetworkChainId(): number {
  switch (network) {
    case 'alfajores':
      return 44787;
    case 'baklava':
      return 62320;
    case 'celo':
      return 42220;
    default:
      throw new Error(errMessage);
  }
}

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: getNetworkUrl(),
      },
      chainId: getNetworkChainId(),
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
