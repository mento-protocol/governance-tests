export type NetworkName = 'alfajores' | 'celo';

export type NetworkConfig = {
  chainId: number;
  url: string;
  hardfork: string
  gasSettings: {
    initialBaseFeePerGas?: number;
    gasPrice?: number;
  }
};

export type Networks = {
  [key in NetworkName]: NetworkConfig;
};

export const networks: Networks = {
  alfajores: {
    chainId: 44787,
    url: 'https://alfajores-forno.celo-testnet.org',
    // L2 CELO is full EIP-1559 and 'cancun' compliant
    // so we need to set initialBaseFeePerGas to have
    // free txs, but the setting fails on mainnet.
    hardfork: 'cancun',
    gasSettings: {
      initialBaseFeePerGas: 0,
      gasPrice: 0
    }
  },
  celo: {
    chainId: 42220,
    url: 'https://forno.celo.org',
    hardfork: 'berlin',
    gasSettings: {
      gasPrice: 0,
    }
  },
};
