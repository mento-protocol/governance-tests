import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { ContractAddresses, addresses } from '@mento-protocol/mento-sdk';  

import { MentoToken, MentoToken__factory } from '@mento-protocol/mento-core-ts';

describe('Mento Token', function () {
  const { provider, parseEther } = ethers;

  let contractAddresses: ContractAddresses | undefined;
  let mentoToken: MentoToken;

  before(async function () {
    const chainId = hre.network.config.chainId;

    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    contractAddresses = addresses[chainId];
    if (!contractAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    mentoToken = MentoToken__factory.connect(
      contractAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Mento Token tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('Should have supply gte initial supply', async function () {
    const totalSupply = await mentoToken.totalSupply();
    const initialTokenSupply = parseEther('350000000');

    expect(totalSupply).greaterThanOrEqual(initialTokenSupply);
  });
});
