import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import {
  MentoToken,
  MentoToken__factory,
  Locking,
  Locking__factory,
} from '@mento-protocol/mento-core-ts';

describe.only('Locking', function () {
  const { provider, parseEther, MaxUint256 } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let mentoToken: MentoToken;
  let locking: Locking;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let initialBalance: bigint;

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);

    const treasury = await ethers.getImpersonatedSigner(
      governanceAddresses.TimelockController,
    );
    const signers = (await ethers.getSigners()) as HardhatEthersSigner[];
    if (signers[0] && signers[1]) {
      [alice, bob] = signers;
    }
    initialBalance = parseEther('1000');
    await mentoToken.connect(treasury).transfer(alice.address, initialBalance);
    await mentoToken.connect(treasury).transfer(bob.address, initialBalance);

    await mentoToken
      .connect(alice)
      .approve(governanceAddresses.Locking, MaxUint256);
    await mentoToken
      .connect(bob)
      .approve(governanceAddresses.Locking, MaxUint256);
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

    mentoToken = MentoToken__factory.connect(
      governanceAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    locking = Locking__factory.connect(
      governanceAddresses.Locking,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Locking tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should lock MENTO in exchange for veMENTO', async function () {
    const lockingBalanceBefore = await mentoToken.balanceOf(
      governanceAddresses.Locking,
    );

    await locking
      .connect(alice)
      .lock(alice.address, alice.address, initialBalance, 10, 7);
    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    const aliceVeBalance = await locking.balanceOf(alice.address);
    const aliceVotingPower = await locking.getVotes(alice.address);
    const aliceMentoBalance = await mentoToken.balanceOf(alice.address);

    const bobVeBalance = await locking.balanceOf(bob.address);
    const bobVotingPower = await locking.getVotes(bob.address);
    const bobMentoBalance = await mentoToken.balanceOf(bob.address);

    const lockingBalanceAfter = await mentoToken.balanceOf(
      governanceAddresses.Locking,
    );

    expect(aliceVeBalance).to.eq(calculateVotingPower(initialBalance, 10n, 7n));
    expect(aliceVotingPower).to.eq(aliceVeBalance);
    expect(bobVeBalance).to.eq(
      calculateVotingPower(initialBalance / 2n, 11n, 13n),
    );
    expect(bobVotingPower).to.eq(bobVeBalance);

    expect(aliceMentoBalance).to.eq(0);
    expect(bobMentoBalance).to.eq(initialBalance / 2n);
    expect(lockingBalanceAfter - lockingBalanceBefore).to.eq(
      initialBalance + initialBalance / 2n,
    );
  });

  it('should delegate created locks', async function () {
    await locking
      .connect(alice)
      .lock(alice.address, bob.address, initialBalance, 10, 7);
    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    const aliceVotingPower = await locking.getVotes(alice.address);
    const bobVotingPower = await locking.getVotes(bob.address);

    expect(aliceVotingPower).to.eq(0);
    expect(bobVotingPower).to.eq(
      calculateVotingPower(initialBalance / 2n, 11n, 13n) +
        calculateVotingPower(initialBalance, 10n, 7n),
    );
  });

  it('should delegate existing locks', async function () {
    const currentLockId = await locking.counter();

    await locking
      .connect(alice)
      .lock(alice.address, alice.address, initialBalance, 10, 7);

    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    await locking.connect(alice).delegateTo(currentLockId + 1n, bob.address);

    const aliceVotingPower = await locking.getVotes(alice.address);
    const bobVotingPower = await locking.getVotes(bob.address);

    expect(aliceVotingPower).to.eq(0);
    expect(bobVotingPower).to.eq(
      calculateVotingPower(initialBalance / 2n, 11n, 13n) +
        calculateVotingPower(initialBalance, 10n, 7n),
    );
  });
});

function calculateVotingPower(
  tokens: bigint,
  slopePeriod: bigint,
  cliffPeriod: bigint,
): bigint {
  const ST_FORMULA_CONST_MULTIPLIER = 2n * 10n ** 7n; // Example conversion
  const ST_FORMULA_CLIFF_MULTIPLIER = 8n * 10n ** 7n;
  const ST_FORMULA_SLOPE_MULTIPLIER = 4n * 10n ** 7n;
  const ST_FORMULA_DIVIDER = 1n * 10n ** 8n;
  const MAX_CLIFF_PERIOD = 103n;
  const MAX_SLOPE_PERIOD = 104n;
  const MIN_CLIFF_PERIOD = 0n;
  const MIN_SLOPE_PERIOD = 1n;

  // Arithmetic operations using BigInt directly
  const amount =
    (tokens *
      (ST_FORMULA_CONST_MULTIPLIER +
        (ST_FORMULA_CLIFF_MULTIPLIER * (cliffPeriod - MIN_CLIFF_PERIOD)) /
          (MAX_CLIFF_PERIOD - MIN_CLIFF_PERIOD) +
        (ST_FORMULA_SLOPE_MULTIPLIER * (slopePeriod - MIN_SLOPE_PERIOD)) /
          (MAX_SLOPE_PERIOD - MIN_SLOPE_PERIOD))) /
    ST_FORMULA_DIVIDER;

  return amount;
}
