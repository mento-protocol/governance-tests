import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import {
    ContractAddresses,
    addresses as MentoAddresses,
  } from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';

import {
  MentoGovernor,
  MentoGovernor__factory
} from '@mento-protocol/mento-core-ts';

describe('Mento Upgrade', function () {
  const { provider, parseEther } = ethers;
  let mentoAddresses: mento.ContractAddresses;
  let mentoGovernor: MentoGovernor;

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);
  });

  before(async function () {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    const mentoAddresses = MentoAddresses[chainId];
    if (!mentoAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    mentoGovernor = MentoGovernor__factory.connect(
      mentoAddresses.MentoGovernor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    // transfer ownership of mento core contracts from Celo governance to new Mento governor
    
    // get celo governance Address through Registry 

    // transfer ownership of contracts to MentoGovernor

    // const broker: Broker = Broker__factory.connect(
    //     mentoAddresses[chainId].Broker,
    //     celoGovernance
    //     );
    // await 


    console.log('\r\n========================');
    console.log('Running Mento Upgrade tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should have a valid MentoGovernor address', async function () {
    console.log(mentoAddresses);
  })

});
