import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { getContractsByChainId } from '@mento-protocol/mento-sdk';

// TODO: @bayological Update SDK to export ContractAddresses type
export type ContractAddresses = {
  Airgrab: string;
  Emission: string;
  MentoGovernor: string;
  MentoToken: string;
  TimelockController: string;
  Locking: string;
};

describe('Governance SDK', function () {
  let governanceAddresses: ContractAddresses;

  this.beforeAll(async function () {
    const chainId = hre.network.config.chainId;

    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    governanceAddresses = getContractsByChainId(chainId);
    if (!governanceAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }
  });

  describe('Mento Governor', function () {
    this.beforeAll(async function () {});

    it('Should return token address that matches static SDK address', async function () {
      const abi: string[] = ['function token() view returns (address)'];

      const governor = await ethers.getContractAt(
        abi,
        governanceAddresses.MentoGovernor,
      );

      // @ts-expect-error "governor.token()" is possibly undefined
      const governorTokenAddress = await governor.token();

      expect(governorTokenAddress).equal(governanceAddresses.MentoToken);
    });
  });
});
