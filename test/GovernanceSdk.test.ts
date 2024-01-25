import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { getContractsByChainId } from '@mento-protocol/mento-sdk';
import {
  Locking,
  Locking__factory,
  MentoGovernor,
  MentoGovernor__factory,
  MentoToken,
  MentoToken__factory,
} from '../typechain-types';

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

    console.log('\r\n========================');
    console.log('Running tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  describe('Mento Governor', function () {
    let mentoGovernor: MentoGovernor;

    this.beforeAll(async function () {
      // Instantiate MentoGovernor contract
      mentoGovernor = MentoGovernor__factory.connect(
        governanceAddresses.MentoGovernor,
        ethers.provider,
      );
    });

    it('Should return token address that matches static SDK address', async function () {
      // Get token address from MentoGovernor contract
      const veTokenAddress = await mentoGovernor.token();

      // Instantiate Locking contract
      const veMentoToken: Locking = Locking__factory.connect(
        veTokenAddress,
        ethers.provider,
      );

      // Get token address from Locking contract
      const mentoToken: string = await veMentoToken.token();

      // Compare token addresses
      expect(mentoToken).equal(governanceAddresses.MentoToken);
    });
  });

  describe('Mento Token', function () {
    let mentoToken: MentoToken;

    this.beforeAll(async function () {
      // Instantiate MentoToken contract
      mentoToken = MentoToken__factory.connect(
        governanceAddresses.MentoToken,
        ethers.provider,
      );
    });

    it('Should have supply gt zero', async function () {
      // Get total supply
      const totalSupply = await mentoToken.totalSupply();
      expect(totalSupply).greaterThan(0);
    });
  });
});
