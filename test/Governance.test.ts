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
  Emission,
  Emission__factory,
} from '@mento-protocol/mento-core-ts';
import { ProxyAdmin } from '../typechain-types/@openzeppelin/contracts/proxy/transparent';
import { ProxyAdmin__factory } from '../typechain-types/factories/@openzeppelin/contracts/proxy/transparent';

import { timeTravel, setUpTestAccounts, submitProposal } from './utils/utils';

describe('Governance', function () {
  const {
    provider,
    parseEther,
    getSigners,
    ZeroHash,
    keccak256,
    deployContract,
    getImpersonatedSigner,
    toUtf8Bytes,
  } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let emission: Emission;
  let mentoToken: MentoToken;
  let locking: Locking;
  let governor: MentoGovernor;
  let timelock: TimelockController;
  let governanceFactory: GovernanceFactory;
  let proxyAdmin: ProxyAdmin;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let david: HardhatEthersSigner;

  before(async function () {
    const chainId = await setupEnvironment();
    console.log('\r\n========================');
    console.log('Running Governance tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);

    await setUpTestAccounts([alice, bob, charlie], true, governanceAddresses);
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
      submitProposal(
        governanceAddresses,
        david,
        [governanceAddresses.MentoToken],
        [0n],
        [calldata],
        description,
      ),
    ).to.be.revertedWith('Governor: proposer votes below proposal threshold');

    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    // Proposal not yet ready for queue
    await expect(
      governor.connect(alice)['queue(uint256)'](proposalId),
    ).to.be.revertedWith('Governor: proposal not successful');

    // Voting period of 7 days
    await timeTravel(7);

    // Proposal ready for queue
    await governor.connect(alice)['queue(uint256)'](proposalId);

    // Proposal not yet ready for execution
    await expect(
      governor.connect(alice)['execute(uint256)'](proposalId),
    ).to.be.revertedWith('TimelockController: operation is not ready');

    // Timelock period of 2 days
    await timeTravel(2);

    // Executing proposal transfers tokens from treasury to target account
    await expect(
      governor.connect(alice)['execute(uint256)'](proposalId),
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
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    // Voting period of 7 days
    await timeTravel(7);

    // Proposal ready for queue
    await governor.connect(alice)['queue(uint256)'](proposalId);

    const timelockId = timelock.hashOperationBatch(
      [governanceAddresses.MentoToken],
      [0],
      [calldata],
      ZeroHash,
      keccak256(toUtf8Bytes(description)),
    );

    // only the canceller can cancel the proposal
    const cancellerRole = await timelock.CANCELLER_ROLE();
    await expect(timelock.connect(alice).cancel(timelockId)).to.be.revertedWith(
      `AccessControl: account ${alice.address.toLowerCase()} is missing role ${cancellerRole}`,
    );

    const watchdogAddress = await governanceFactory.watchdogMultiSig();
    const watchdog = await getImpersonatedSigner(watchdogAddress);

    expect(await timelock.isOperationPending(timelockId)).to.be.true;
    // watchdog can cancel the proposal
    await timelock.connect(watchdog).cancel(timelockId);
    expect(await timelock.isOperationPending(timelockId)).to.be.false;

    await timeTravel(2);

    // Proposal can not be executed after being cancelled
    await expect(
      governor.connect(alice)['execute(uint256)'](proposalId),
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
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting NO
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 0);

    expect(await governor.state(proposalId)).to.eq(1); // active

    // Voting period of 7 days
    await timeTravel(7);
    expect(await governor.state(proposalId)).to.eq(3); // defeated

    // Proposal is defeated and cant be queued
    await expect(
      governor.connect(alice)['queue(uint256)'](proposalId),
    ).to.be.revertedWith('Governor: proposal not successful');

    await timeTravel(2);

    expect(await governor.state(proposalId)).to.eq(3); // defeated

    // Proposal can not be executed after being defeated
    await expect(
      governor.connect(alice)['execute(uint256)'](proposalId),
    ).to.be.revertedWith('Governor: proposal not successful');
  });

  it('should update governor config', async function () {
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

    // Create a proposal to update governor config
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      targets,
      values,
      calldatas,
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 1);

    // Voting period
    await timeTravel(7);

    await governor.connect(alice)['queue(uint256)'](proposalId);

    // Timelock period
    await timeTravel(2);

    await governor.connect(alice)['execute(uint256)'](proposalId);

    expect(await governor.votingDelay()).to.eq(newVotingDelay);
    expect(await governor.votingPeriod()).to.eq(newVotingPeriod);
    expect(await governor.proposalThreshold()).to.eq(newThreshold);
    expect(await governor['quorumNumerator()']()).to.eq(newQuorum);
    expect(await timelock.getMinDelay()).to.eq(newMinDelay);
    expect(await locking.minCliffPeriod()).to.eq(newMinCliff);
    expect(await locking.minSlopePeriod()).to.eq(newMinSlope);
  });

  it('should change governor roles', async function () {
    const proposerRole = await timelock.PROPOSER_ROLE();
    const cancellerRole = await timelock.CANCELLER_ROLE();

    const newProposer = alice.address;
    const newCanceller = charlie.address;
    const watchdogAddress = await governanceFactory.watchdogMultiSig();

    const targets = [
      governanceAddresses.TimelockController,
      governanceAddresses.TimelockController,
      governanceAddresses.TimelockController,
      governanceAddresses.TimelockController,
    ];
    const values = Array(4).fill(0);
    const calldatas = [];
    const description = 'Change governor roles';

    calldatas.push(
      timelock.interface.encodeFunctionData('grantRole', [
        proposerRole,
        newProposer,
      ]),
    );

    calldatas.push(
      timelock.interface.encodeFunctionData('grantRole', [
        cancellerRole,
        newCanceller,
      ]),
    );
    calldatas.push(
      timelock.interface.encodeFunctionData('revokeRole', [
        proposerRole,
        governanceAddresses.MentoGovernor,
      ]),
    );
    calldatas.push(
      timelock.interface.encodeFunctionData('revokeRole', [
        cancellerRole,
        watchdogAddress,
      ]),
    );

    // Create a proposal to change governor roles
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      targets,
      values,
      calldatas,
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 1);

    // Voting period
    await timeTravel(7);

    await governor.connect(alice)['queue(uint256)'](proposalId);

    // Timelock period
    await timeTravel(2);

    expect(await timelock.hasRole(proposerRole, newProposer)).to.be.false;
    expect(await timelock.hasRole(cancellerRole, newCanceller)).to.be.false;
    expect(
      await timelock.hasRole(proposerRole, governanceAddresses.MentoGovernor),
    ).to.be.true;
    expect(await timelock.hasRole(cancellerRole, watchdogAddress)).to.be.true;

    await governor.connect(alice)['execute(uint256)'](proposalId);

    expect(await timelock.hasRole(proposerRole, newProposer)).to.be.true;
    expect(await timelock.hasRole(cancellerRole, newCanceller)).to.be.true;
    expect(
      await timelock.hasRole(proposerRole, governanceAddresses.MentoGovernor),
    ).to.be.false;
    expect(await timelock.hasRole(cancellerRole, watchdogAddress)).to.be.false;
  });

  it('should upgrade upgradable contracts', async function () {
    const newLocking = await deployContract('MockLocking');
    const newTimelock = await deployContract('MockTimelock');
    const newGovernor = await deployContract('MockGovernor');
    const newEmission = await deployContract('MockEmission');

    const targets = Array(4).fill(proxyAdmin.target);
    const values = Array(4).fill(0);
    const calldatas = [];
    const description = 'Upgrade upgradable contracts';

    calldatas.push(
      proxyAdmin.interface.encodeFunctionData('upgrade', [
        locking.target,
        newLocking.target,
      ]),
    );

    calldatas.push(
      proxyAdmin.interface.encodeFunctionData('upgrade', [
        timelock.target,
        newTimelock.target,
      ]),
    );

    calldatas.push(
      proxyAdmin.interface.encodeFunctionData('upgrade', [
        governor.target,
        newGovernor.target,
      ]),
    );

    calldatas.push(
      proxyAdmin.interface.encodeFunctionData('upgrade', [
        emission.target,
        newEmission.target,
      ]),
    );

    // Create a proposal to upgrade contracts
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      targets,
      values,
      calldatas,
      description,
    );

    // Vote on the proposal using multiple accounts, with the majority voting YES
    await governor.connect(alice).castVote(proposalId, 0);
    await governor.connect(bob).castVote(proposalId, 1);
    await governor.connect(charlie).castVote(proposalId, 1);

    // Voting period
    await timeTravel(7);

    await governor.connect(alice)['queue(uint256)'](proposalId);

    // Timelock period
    await timeTravel(2);

    // functions implemented in the old versions
    await locking.getWeek();
    await timelock.getMinDelay();
    await governor.votingDelay();
    await emission.calculateEmission();

    await governor.connect(alice)['execute(uint256)'](proposalId);

    // new implementations does not implement the functions
    await expect(locking.getWeek()).to.be.revertedWith(
      'MockLocking: getWeek not implemented',
    );
    await expect(timelock.getMinDelay()).to.be.revertedWith(
      'MockTimelock: getMinDelay not implemented',
    );
    await expect(governor.votingDelay()).to.be.revertedWith(
      'MockGovernor: votingDelay not implemented',
    );
    await expect(emission.calculateEmission()).to.be.revertedWith(
      'MockEmission: calculateEmission not implemented',
    );
  });

  const setupEnvironment = async (): Promise<number> => {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    const signers = (await getSigners()) as HardhatEthersSigner[];
    if (signers[0] && signers[1] && signers[2] && signers[3]) {
      [alice, bob, charlie, david] = signers;
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

    locking = Locking__factory.connect(
      governanceAddresses.Locking,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    governor = MentoGovernor__factory.connect(
      governanceAddresses.MentoGovernor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    timelock = TimelockController__factory.connect(
      governanceAddresses.TimelockController,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    governanceFactory = GovernanceFactory__factory.connect(
      governanceAddresses.GovernanceFactory,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    const proxyAdminAddress = await governanceFactory.proxyAdmin();
    proxyAdmin = ProxyAdmin__factory.connect(
      proxyAdminAddress,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    return chainId;
  };
});
