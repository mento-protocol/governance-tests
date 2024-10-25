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

describe('Emission Contract', function() {
  const { provider } = ethers;

  const DAY = 60 * 60 * 24;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  const TOTAL_EMISSION_SUPPLY = 400000000000000000000000000n;
  const EMISSION_SCHEDULE: [string, number, bigint][] = [
    ['1 month', MONTH, 2272360966034735200000000n],
    ['6 months', 6 * MONTH, 13441990350939033200000000n],
    ['1 year', YEAR, 26786803451673338400000000n],
    ['10 years', 10 * YEAR, 200056003618009585600000000n],
    ['15 years', 15 * YEAR, 259188355645680168400000000n],
    ['25 years', 25 * YEAR, 341282536560102987200000000n],
    ['30 years', 30 * YEAR, 384380367358251650800000000n],
    ['40 years', 40 * YEAR, TOTAL_EMISSION_SUPPLY],
  ];

  let governanceAddresses: mento.ContractAddresses;
  let emission: Emission;
  let mentoToken: MentoToken;

  beforeEach(async function() {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);
  });

  before(async function() {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    governanceAddresses = mento.addresses[chainId]!;
    if (!governanceAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    emission = Emission__factory.connect(
      governanceAddresses.Emission,
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

  describe('calculateEmission()', async function() {
    for (const [period, timeToTravel, expectedEmission] of EMISSION_SCHEDULE) {
      it(`should calculate the correct amount after ${period}`, async function() {
        const start = await emission.emissionStartTime();
        const now = await helpers.time.latest();
        const elapsed = BigInt(now) - start;

        if (elapsed >= timeToTravel) {
          // can only time travel to the future
          this.skip();
        }

        await helpers.time.increase(BigInt(timeToTravel) - elapsed);
        const emissionTotalEmitteed = await emission.totalEmittedAmount();
        const calculatedEmission = await emission.calculateEmission();

        // Subtract the total emission already emitted from the expected emission
        const totalExpectedEmission = expectedEmission - emissionTotalEmitteed;

        expect(calculatedEmission).to.be.eq(totalExpectedEmission);
      });
    }
  });

  describe('emitTokens()', async function() {
    for (const [period, timeToTravel, expectedEmission] of EMISSION_SCHEDULE) {
      it(`should emit the correct amount after ${period}`, async function() {
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

        const emissionTotalEmittedAmount = await emission.totalEmittedAmount();
        const mentoTokenEmittedAmount = await mentoToken.emittedAmount();
        expect(mentoTokenEmittedAmount).to.equal(emissionTotalEmittedAmount);

        const [signer] = await ethers.getSigners();
        await emission.connect(signer!).emitTokens();

        // Fetch the new total emitted amounts after emission
        const newEmissionTotalEmittedAmount =
          await emission.totalEmittedAmount();
        const newMentoTokenEmittedAmount = await mentoToken.emittedAmount();

        const totalExpectedEmission =
          expectedEmission - emissionTotalEmittedAmount;

        expect(newEmissionTotalEmittedAmount).to.be.eq(
          emissionTotalEmittedAmount + totalExpectedEmission,
        );
        expect(newMentoTokenEmittedAmount).to.be.eq(
          emissionTotalEmittedAmount + totalExpectedEmission,
        );
      });
    }
  });
});
