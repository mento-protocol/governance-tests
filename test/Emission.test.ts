import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';

import {
  Emission,
  Emission__factory,
  MentoToken,
  MentoToken__factory,
} from '@mento-protocol/mento-core-ts';

describe('Emission Contract', function () {
  const { provider } = ethers;

  const DAY = 60 * 60 * 24;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  const TOTAL_EMISSION_SUPPLY = BigInt('650000000000000000000000000');
  const EMISSION_SCHEDULE: [string, number, BigInt][] = [
    ['1 month', MONTH, BigInt('3692586569806444700000000')],
    ['6 months', 6 * MONTH, BigInt('21843234320275928950000000')],
    ['1 year', YEAR, BigInt('43528555608969174900000000')],
    ['10 years', 10 * YEAR, BigInt('325091005879265576600000000')],
    ['15 years', 15 * YEAR, BigInt('421181077924230273650000000')],
    ['25 years', 25 * YEAR, BigInt('554584121910167354200000000')],
    ['30 years', 30 * YEAR, BigInt('624618096957158932550000000')],
    ['40 years', 40 * YEAR, BigInt(TOTAL_EMISSION_SUPPLY)],
  ];

  let governanceAddresses: mento.ContractAddresses;
  let emission: Emission;
  let mentoToken: MentoToken;

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

    governanceAddresses = mento.getContractsByChainId(chainId);
    if (!governanceAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    emission = Emission__factory.connect(
      governanceAddresses.Emission,
      // @TODO: Do I need this line below?
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    mentoToken = MentoToken__factory.connect(
      governanceAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n========================');
    console.log(
      'Running Emission Contract tests on network with chain id:',
      chainId,
    );
    console.log('========================\r\n');
  });

  describe('calculateEmission()', async function () {
    for (const [period, timeToTravel, expectedEmission] of EMISSION_SCHEDULE) {
      it(`should calculate the correct amount after ${period}`, async function () {
        const start = await emission.emissionStartTime();
        const now = await helpers.time.latest();
        const elapsed = BigInt(now) - start;

        if (elapsed >= timeToTravel) {
          // can only time travel to the future
          this.skip();
        }

        await helpers.time.increase(BigInt(timeToTravel) - elapsed);
        expect(await emission.calculateEmission()).to.equal(expectedEmission);
      });
    }
  });

  describe('emitTokens()', async function () {
    for (const [period, timeToTravel, expectedEmission] of EMISSION_SCHEDULE) {
      it(`should emit the correct amount after ${period}`, async function () {
        const start = await emission.emissionStartTime();
        const now = await helpers.time.latest();
        const elapsed = BigInt(now) - start;

        if (elapsed >= timeToTravel) {
          // can only time travel to the future
          this.skip();
        }

        // emission.emitTokens() will increase block.timestamp by 1 second,
        // therefore to mint at the exact time, we need to subtract 1s
        await helpers.time.increase(BigInt(timeToTravel) - elapsed - BigInt(1));

        const emittedSoFar = await emission.totalEmittedAmount();
        expect(await mentoToken.emittedAmount()).to.equal(emittedSoFar);

        const [signer] = await ethers.getSigners();
        await emission.connect(signer!).emitTokens();

        expect(await emission.totalEmittedAmount()).to.equal(
          emittedSoFar + expectedEmission,
        );
        expect(await mentoToken.emittedAmount()).to.equal(
          emittedSoFar + expectedEmission,
        );
      });
    }
  });
});
