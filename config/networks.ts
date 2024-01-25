export type NetworkName = 'alfajores' | 'baklava' | 'celo';

export type NetworkConfig = {
  chainId: number;
  url: string;
};

export type Networks = {
  [key in NetworkName]: NetworkConfig;
};

export const networks: Networks = {
  alfajores: {
    chainId: 44787,
    url: 'https://alfajores-forno.celo-testnet.org',
  },
  baklava: {
    chainId: 62320,
    url: 'https://baklava-forno.celo-testnet.org',
  },
  celo: {
    chainId: 42220,
    url: 'https://forno.celo.org',
  },
};
