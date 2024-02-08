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
  MentoGovernor,
  MentoGovernor__factory,
  TimelockController,
  TimelockController__factory,
  GovernanceFactory,
  GovernanceFactory__factory,
} from '@mento-protocol/mento-core-ts';
import { timeTravel } from './utils/utils';
import { EventLog, toUtf8Bytes } from 'ethers';

describe.only('Governance', function () {
  const { provider, parseEther, MaxUint256 } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let mentoToken: MentoToken;
  let locking: Locking;
  let governor: MentoGovernor;
  let timelock: TimelockController;
  let governanceFactory: GovernanceFactory;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let david: HardhatEthersSigner;
  let initialBalance: bigint;

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);

    const treasury = await ethers.getImpersonatedSigner(
      governanceAddresses.TimelockController,
    );
    initialBalance = parseEther('1000000');
    await mentoToken.connect(treasury).transfer(alice.address, initialBalance);
    await mentoToken.connect(treasury).transfer(bob.address, initialBalance);
    await mentoToken
      .connect(treasury)
      .transfer(charlie.address, initialBalance);

    await mentoToken
      .connect(alice)
      .approve(governanceAddresses.Locking, MaxUint256);
    await mentoToken
      .connect(bob)
      .approve(governanceAddresses.Locking, MaxUint256);
    await mentoToken
      .connect(charlie)
      .approve(governanceAddresses.Locking, MaxUint256);

    await locking
      .connect(alice)
      .lock(alice.address, alice.address, initialBalance, 52, 52);
    await locking
      .connect(bob)
      .lock(bob.address, bob.address, initialBalance, 52, 52);
    await locking
      .connect(charlie)
      .lock(charlie.address, charlie.address, initialBalance, 52, 52);
  });

  before(async function () {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    const signers = (await ethers.getSigners()) as HardhatEthersSigner[];
    if (signers[0] && signers[1] && signers[2] && signers[3]) {
      [alice, bob, charlie, david] = signers;
    }

    governanceAddresses = mento.addresses[chainId]!;
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

    governor = MentoGovernor__factory.connect(
      governanceAddresses.MentoGovernor,
      provider as any,
    );

    timelock = TimelockController__factory.connect(
      governanceAddresses.TimelockController,
      provider as any,
    );

    governanceFactory = GovernanceFactory__factory.connect(
      governanceAddresses.GovernanceFactory,
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Governance tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should transfer tokens from treasury', async function () {
    const amountToTransfer = parseEther('1000000');
    const target = david.address;
    const description = 'Transfer 1m tokens to David';

    const calldata = mentoToken.interface.encodeFunctionData('transfer', [
      target,
      amountToTransfer,
    ]);

    await expect(
      governor
        .connect(david)
        .propose(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          description,
        ),
    ).to.be.revertedWith('Governor: proposer votes below proposal threshold');

    // Create a proposal to transfer tokens from the treasury
    const tx = await governor
      .connect(alice)
      .propose([governanceAddresses.MentoToken], [0], [calldata], description);

    // Get the proposalId from the event logs
    const receipt = await tx.wait();
    const proposalCreatedEvent = receipt.logs.find(
      (e: EventLog) => e.fragment.name === 'ProposalCreated',
    );

    const proposalId = proposalCreatedEvent.args[0];

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    // Proposal not yet ready for queue
    await expect(
      governor
        .connect(alice)
        .queue(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.be.revertedWith('Governor: proposal not successful');

    // Voting period of 7 days
    await timeTravel(7);

    // Proposal ready for queue
    await governor
      .connect(alice)
      .queue(
        [governanceAddresses.MentoToken],
        [0],
        [calldata],
        ethers.keccak256(toUtf8Bytes(description)),
      );

    // Proposal not yet ready for execution
    await expect(
      governor
        .connect(alice)
        .execute(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.be.revertedWith('TimelockController: operation is not ready');

    // Timelock period of 2 days
    await timeTravel(2);

    // Executing proposal transfers tokens from treasury to target account
    await expect(
      governor
        .connect(alice)
        .execute(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.changeTokenBalances(
      mentoToken,
      [david, timelock],
      [amountToTransfer, -amountToTransfer],
    );
  });

  it('should cancel a queued proposal', async function () {
    const amountToTransfer = parseEther('1000000');
    const target = david.address;
    const description = 'Transfer 1m tokens to David';

    const calldata = mentoToken.interface.encodeFunctionData('transfer', [
      target,
      amountToTransfer,
    ]);

    // Create a proposal to transfer tokens from the treasury
    const tx = await governor
      .connect(alice)
      .propose([governanceAddresses.MentoToken], [0], [calldata], description);

    // Get the proposalId from the event logs
    const receipt = await tx.wait();
    const proposalCreatedEvent = receipt.logs.find(
      (e: EventLog) => e.fragment.name === 'ProposalCreated',
    );

    const proposalId = proposalCreatedEvent.args[0];

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    // Voting period of 7 days
    await timeTravel(7);

    // Proposal ready for queue
    await governor
      .connect(alice)
      .queue(
        [governanceAddresses.MentoToken],
        [0],
        [calldata],
        ethers.keccak256(toUtf8Bytes(description)),
      );

    const timelockId = timelock.hashOperationBatch(
      [governanceAddresses.MentoToken],
      [0],
      [calldata],
      ethers.ZeroHash,
      ethers.keccak256(toUtf8Bytes(description)),
    );

    // only the canceller can cancel the proposal
    const cancellerRole = await timelock.CANCELLER_ROLE();
    await expect(timelock.connect(alice).cancel(timelockId)).to.be.revertedWith(
      `AccessControl: account ${alice.address.toLowerCase()} is missing role ${cancellerRole}`,
    );

    const watchdogAddress = await governanceFactory.watchdogMultiSig();
    const watchdog = await ethers.getImpersonatedSigner(watchdogAddress);

    expect(await timelock.isOperationPending(timelockId)).to.be.true;
    // watchdog can cancel the proposal
    await timelock.connect(watchdog).cancel(timelockId);
    expect(await timelock.isOperationPending(timelockId)).to.be.false;

    await timeTravel(2);

    // Proposal can not be executed after being cancelled
    await expect(
      governor
        .connect(alice)
        .execute(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.be.revertedWith('Governor: proposal not successful');
  });

  it('should defeat a proposal', async function () {
    const amountToTransfer = parseEther('1000000');
    const target = david.address;
    const description = 'Transfer 1m tokens to David';

    const calldata = mentoToken.interface.encodeFunctionData('transfer', [
      target,
      amountToTransfer,
    ]);

    // Create a proposal to transfer tokens from the treasury
    const tx = await governor
      .connect(alice)
      .propose([governanceAddresses.MentoToken], [0], [calldata], description);

    // Get the proposalId from the event logs
    const receipt = await tx.wait();
    const proposalCreatedEvent = receipt.logs.find(
      (e: EventLog) => e.fragment.name === 'ProposalCreated',
    );

    const proposalId = proposalCreatedEvent.args[0];

    // Vote on the proposal using multiple accounts, with the majority voting NO
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    expect(await governor.state(proposalId)).to.equal(1); // active

    // Voting period of 7 days
    await timeTravel(7);
    expect(await governor.state(proposalId)).to.equal(3); // defeated

    // Proposal is defeated and cant be queued
    await expect(
      governor
        .connect(alice)
        .queue(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.be.revertedWith('Governor: proposal not successful');

    await timeTravel(2);

    expect(await governor.state(proposalId)).to.equal(3); // defeated

    // Proposal can not be executed after being defeated
    await expect(
      governor
        .connect(alice)
        .execute(
          [governanceAddresses.MentoToken],
          [0],
          [calldata],
          ethers.keccak256(toUtf8Bytes(description)),
        ),
    ).to.be.revertedWith('Governor: proposal not successful');
  });

  it('changes governor config', async function () {
    const newVotingDelay = 17_280; // 1 day in CELO
    const newVotingPeriod = 2 * 120_960; // 2 weeks in CELO
    const newThreshold = parseEther('5000');
    const newQuorum = 10; // 10%
    const newMinDelay = 3 * 86400; // 2 days
    const newMinCliff = 6; // 6 weeks
    const newMinSlope = 12; // 12 weeks
    const targets = [
      governanceAddresses.MentoGovernor,
      governanceAddresses.MentoGovernor,
      governanceAddresses.MentoGovernor,
      governanceAddresses.MentoGovernor,
      governanceAddresses.TimelockController,
      governanceAddresses.Locking,
      governanceAddresses.Locking,
    ];
    const values = Array(7).fill(0);
    const calldatas = [];
    const description = 'Change governor config';

    calldatas.push(
      governor.interface.encodeFunctionData('setVotingDelay', [newVotingDelay]),
    );
    calldatas.push(
      governor.interface.encodeFunctionData('setVotingPeriod', [
        newVotingPeriod,
      ]),
    );
    calldatas.push(
      governor.interface.encodeFunctionData('setProposalThreshold', [
        newThreshold,
      ]),
    );
    calldatas.push(
      governor.interface.encodeFunctionData('updateQuorumNumerator', [
        newQuorum,
      ]),
    );
    calldatas.push(
      timelock.interface.encodeFunctionData('updateDelay', [newMinDelay]),
    );
    calldatas.push(
      locking.interface.encodeFunctionData('setMinCliffPeriod', [newMinCliff]),
    );
    calldatas.push(
      locking.interface.encodeFunctionData('setMinSlopePeriod', [newMinSlope]),
    );

    // Create a proposal to transfer tokens from the treasury
    const tx = await governor
      .connect(alice)
      .propose(targets, values, calldatas, description);

    // Get the proposalId from the event logs
    const receipt = await tx.wait();
    const proposalCreatedEvent = receipt.logs.find(
      (e: EventLog) => e.fragment.name === 'ProposalCreated',
    );

    const proposalId = proposalCreatedEvent.args[0];

    // Vote on the proposal using multiple accounts, with the majority voting NO
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 1);

    // Voting period
    await timeTravel(7);

    await governor
      .connect(alice)
      .queue(
        targets,
        values,
        calldatas,
        ethers.keccak256(toUtf8Bytes(description)),
      );

    // Timelock period
    await timeTravel(2);

    await governor
      .connect(alice)
      .execute(
        targets,
        values,
        calldatas,
        ethers.keccak256(toUtf8Bytes(description)),
      );

    expect(await governor.votingDelay()).to.eq(newVotingDelay);
    expect(await governor.votingPeriod()).to.eq(newVotingPeriod);
    expect(await governor.proposalThreshold()).to.eq(newThreshold);
    expect(await governor.quorumNumerator()).to.eq(newQuorum);
    expect(await timelock.getMinDelay()).to.eq(newMinDelay);
    expect(await locking.minCliffPeriod()).to.eq(newMinCliff);
    expect(await locking.minSlopePeriod()).to.eq(newMinSlope);
  });
});