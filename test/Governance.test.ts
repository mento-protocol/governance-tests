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
} from '@mento-protocol/mento-core-ts';
import { calculateVotingPower, timeTravel } from './utils/utils';
import { EventLog } from 'ethers';

describe('Governance', function () {
  const { provider, parseEther, MaxUint256, AbiCoder } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let mentoToken: MentoToken;
  let locking: Locking;
  let governor: MentoGovernor;
  let timelock: TimelockController;
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

    governor = MentoGovernor__factory.connect(
      governanceAddresses.MentoGovernor,
      provider as any,
    );
    timelock = TimelockController__factory.connect(
      governanceAddresses.TimelockController,
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Governance tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it.only('should transfer tokens from treasury', async function () {
    // Queue the proposal
    // Execute the proposal
    // Tokens should be transferred to the target account
    // Create a proposal to transfer some tokens from the treasury
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

    // Queue the proposal
    // await governance.connect(proposer).queue(proposalId);

    // // Advance time if necessary (depends on your contract's rules for when a proposal can be executed)
    // // await ethers.provider.send('evm_increaseTime', [timeToAdvance]);

    // // Execute the proposal
    // await governance.connect(proposer).execute(proposalId);

    // // Tokens should be transferred to the target account
    // const targetBalance = await token.balanceOf(target.address);
    // assert.equal(
    //   targetBalance.toString(),
    //   amountToTransfer.toString(),
    //   'Tokens were not transferred correctly',
    // );
  });
});
