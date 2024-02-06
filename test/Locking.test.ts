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
import { calculateVotingPower, timeTravel } from './utils/utils';

describe('Locking', function () {
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

    const signers = (await ethers.getSigners()) as HardhatEthersSigner[];
    if (signers[0] && signers[1]) {
      [alice, bob] = signers;
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
    await expect(
      locking
        .connect(alice)
        .lock(alice.address, alice.address, initialBalance, 10, 7),
    ).to.changeTokenBalances(
      mentoToken,
      [alice, locking],
      [-initialBalance, initialBalance],
    );

    await expect(
      locking
        .connect(bob)
        .lock(bob.address, bob.address, initialBalance / 2n, 11, 13),
    ).to.changeTokenBalances(
      mentoToken,
      [bob, locking],
      [-initialBalance / 2n, initialBalance / 2n],
    );

    const aliceVeBalance = await locking.balanceOf(alice.address);
    const aliceVotingPower = await locking.getVotes(alice.address);

    const bobVeBalance = await locking.balanceOf(bob.address);
    const bobVotingPower = await locking.getVotes(bob.address);

    expect(aliceVeBalance).to.eq(calculateVotingPower(initialBalance, 10n, 7n));
    expect(aliceVotingPower).to.eq(aliceVeBalance);
    expect(bobVeBalance).to.eq(
      calculateVotingPower(initialBalance / 2n, 11n, 13n),
    );
    expect(bobVotingPower).to.eq(bobVeBalance);
  });

  it('should withdraw correct amounts after weeks', async function () {
    await locking
      .connect(alice)
      .lock(alice.address, alice.address, initialBalance, 10, 7);
    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    await timeTravel(21); // 3 weeks

    let aliceVotingPower = await locking.getVotes(alice.address);
    let bobVotingPower = await locking.getVotes(bob.address);
    const aliceCalculatedVotingPower = calculateVotingPower(
      initialBalance,
      10n,
      7n,
    );
    const bobCalculatedVotingPower = calculateVotingPower(
      initialBalance / 2n,
      11n,
      13n,
    );

    expect(aliceVotingPower).to.eq(aliceCalculatedVotingPower);
    expect(bobVotingPower).to.eq(bobCalculatedVotingPower);

    // withdraw as soon as locking
    // should not transfer anything
    await expect(locking.connect(alice).withdraw()).to.changeTokenBalances(
      mentoToken,
      [alice, locking],
      [0, 0],
    );
    await expect(locking.connect(bob).withdraw()).to.changeTokenBalances(
      mentoToken,
      [bob, locking],
      [0, 0],
    );

    await timeTravel(28); // 3 weeks + 4 weeks = 7 weeks

    aliceVotingPower = await locking.getVotes(alice.address);
    bobVotingPower = await locking.getVotes(bob.address);

    // still in the cliff period
    expect(aliceVotingPower).to.eq(aliceCalculatedVotingPower);
    expect(bobVotingPower).to.eq(bobCalculatedVotingPower);

    // withdraw in cliff period
    // should not transfer anything
    await expect(locking.connect(alice).withdraw()).to.changeTokenBalances(
      mentoToken,
      [alice, locking],
      [0, 0],
    );
    await expect(locking.connect(bob).withdraw()).to.changeTokenBalances(
      mentoToken,
      [bob, locking],
      [0, 0],
    );

    await timeTravel(35); // 7 weeks + 5 weeks = 12 weeks
    aliceVotingPower = await locking.getVotes(alice.address);
    bobVotingPower = await locking.getVotes(bob.address);

    // alice in slope period(5/10), bob still in cliff period
    expect(aliceVotingPower).to.eq(aliceCalculatedVotingPower / 2n);
    expect(bobVotingPower).to.eq(bobCalculatedVotingPower);

    // withdraw in slope period
    // should transfer mento from locking to alice
    await expect(locking.connect(alice).withdraw()).to.changeTokenBalances(
      mentoToken,
      [alice, locking],
      [initialBalance / 2n, -initialBalance / 2n],
    );
    await expect(locking.connect(bob).withdraw()).to.changeTokenBalances(
      mentoToken,
      [bob, locking],
      [0, 0],
    );

    await timeTravel(42); // 12 weeks + 6 weeks = 18 weeks
    aliceVotingPower = await locking.getVotes(alice.address);
    bobVotingPower = await locking.getVotes(bob.address);

    // alice fully unlocked, bob in slope period(6/11)
    expect(aliceVotingPower).to.eq(0);
    expect(bobVotingPower).to.closeTo(
      (bobCalculatedVotingPower * 6n) / 11n,
      10n,
    );

    // withdraw in after slope for alice, and in slope for bob
    // should transfer mento from locking to both alice and bob
    await expect(locking.connect(alice).withdraw()).to.changeTokenBalances(
      mentoToken,
      [alice, locking],
      [initialBalance / 2n, -initialBalance / 2n],
    );

    const bobMentoBalanceBefore = await mentoToken.balanceOf(bob.address);
    await locking.connect(bob).withdraw();
    const bobMentoBalanceAfter = await mentoToken.balanceOf(bob.address);
    expect(bobMentoBalanceAfter - bobMentoBalanceBefore).to.closeTo(
      (initialBalance * 5n) / 22n,
      10n,
    );

    await timeTravel(42); // 18 weeks + 6 weeks = 24 weeks

    await locking.connect(bob).withdraw();

    aliceVotingPower = await locking.getVotes(alice.address);
    bobVotingPower = await locking.getVotes(bob.address);
    const aliceFinalMentoBalance = await mentoToken.balanceOf(alice.address);
    const bobFinalMentoBalance = await mentoToken.balanceOf(bob.address);

    expect(aliceFinalMentoBalance).to.eq(initialBalance);
    expect(bobFinalMentoBalance).to.eq(initialBalance);
    expect(aliceVotingPower).to.eq(0);
    expect(bobVotingPower).to.eq(0);
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

  it('should relock with longer duration', async function () {
    const currentLockId = await locking.counter();

    await locking
      .connect(alice)
      .lock(alice.address, alice.address, initialBalance, 10, 7);

    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    await timeTravel(21); // 3 weeks

    await locking
      .connect(alice)
      .relock(currentLockId + 1n, alice.address, initialBalance, 20, 15);

    await expect(
      locking
        .connect(bob)
        .relock(currentLockId + 2n, bob.address, initialBalance / 2n, 5, 13),
    ).to.be.revertedWith('new line period lock too short');

    await expect(
      locking
        .connect(bob)
        .relock(currentLockId + 2n, bob.address, initialBalance / 2n, 10, 9),
    ).to.be.revertedWith('new line period lock too short');

    locking
      .connect(bob)
      .relock(currentLockId + 2n, bob.address, initialBalance / 2n, 10, 12);

    const aliceVotingPower = await locking.getVotes(alice.address);
    const bobVotingPower = await locking.getVotes(bob.address);

    expect(aliceVotingPower).to.eq(
      calculateVotingPower(initialBalance, 20n, 15n),
    );
    expect(bobVotingPower).to.eq(
      calculateVotingPower(initialBalance / 2n, 10n, 12n),
    );
  });

  it('should relock with larger amount', async function () {
    const currentLockId = await locking.counter();

    await locking
      .connect(alice)
      .lock(alice.address, alice.address, (initialBalance * 2n) / 3n, 10, 7);

    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance / 2n, 11, 13);

    await timeTravel(21); // 3 weeks

    await locking
      .connect(alice)
      .relock(currentLockId + 1n, alice.address, initialBalance, 10, 4);

    await expect(
      locking
        .connect(bob)
        .relock(currentLockId + 2n, bob.address, initialBalance / 4n, 11, 10),
    ).to.be.revertedWith('Impossible to relock: less amount, then now is');

    locking
      .connect(bob)
      .relock(currentLockId + 2n, bob.address, initialBalance, 11, 10);

    const aliceVotingPower = await locking.getVotes(alice.address);
    const bobVotingPower = await locking.getVotes(bob.address);

    expect(aliceVotingPower).to.eq(
      calculateVotingPower(initialBalance, 10n, 4n),
    );
    expect(bobVotingPower).to.eq(
      calculateVotingPower(initialBalance, 11n, 10n),
    );
  });
});
