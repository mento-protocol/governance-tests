import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

import {
  MentoToken,
  MentoToken__factory,
  Locking,
  Locking__factory,
  MentoGovernor,
  MentoGovernor__factory,
} from '@mento-protocol/mento-core-ts';

import { timeTravel, setUpTestAccounts, submitProposal } from './utils/utils';

describe('Gas Tests', function () {
  const { provider, parseEther, getSigners } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let mentoToken: MentoToken;
  let locking: Locking;
  let governor: MentoGovernor;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let calldata: string;
  let amountToTransfer: bigint;
  let target: string;

  before(async function () {
    this.timeout(0);

    const chainId = await setupEnvironment();
    console.log('\r\n========================');
    console.log(`Running Gas Tests on network with chain id: ${chainId}`);
    console.log('========================\r\n');
  });

  it('submitProposal should spend reasonable gas with high number of locks', async function () {
    const tx: any = await governor
      .connect(alice)
      [
        'propose(address[],uint256[],bytes[],string)'
      ]([target], [0], [calldata], 'description1');
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for submitting proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(1_000_000);
  });

  it('castVote should spend reasonable gas with high number of locks', async function () {
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      'description2',
    );
    timeTravel(1);

    const tx1: any = await governor.connect(alice).castVote(proposalId, 1);
    const receipt1 = await tx1.wait();
    const actualGasUsed1 = receipt1.gasUsed;

    const tx2: any = await governor.connect(bob).castVote(proposalId, 0);
    const receipt2 = await tx2.wait();
    const actualGasUsed2 = receipt2.gasUsed;

    console.log(`Gas used for Alice's vote: ${actualGasUsed1}`);
    console.log(`Gas used for Bob's vote: ${actualGasUsed2}`);

    expect(actualGasUsed1).to.be.lt(200_000);
    expect(actualGasUsed2).to.be.lt(200_000);
  });

  it('queue should spend reasonable gas with high number of locks', async function () {
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      'description3',
    );
    timeTravel(1);

    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);

    timeTravel(7);

    const tx: any = await governor.connect(alice)['queue(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for queueing proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('execute should spend reasonable gas with high number of locks', async function () {
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      'description4',
    );
    timeTravel(1);

    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);

    timeTravel(7);

    await governor.connect(alice)['queue(uint256)'](proposalId);
    timeTravel(2);

    const tx: any = await governor
      .connect(alice)
      ['execute(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for executing proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('cancel proposal should spend reasonable gas with high number of locks', async function () {
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      'description5',
    );
    timeTravel(1);

    await governor.connect(alice).castVote(proposalId, 1);
    await governor.connect(bob).castVote(proposalId, 1);

    timeTravel(7);

    await governor.connect(alice)['queue(uint256)'](proposalId);
    timeTravel(1);

    const tx: any = await (governor as any)
      .connect(alice)
      ['cancel(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for canceling proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  const setupEnvironment = async (): Promise<number> => {
    console.log('Setting up environment for gas tests');

    const chainId = hre.network.config.chainId;
    if (!chainId) throw new Error('Chain ID not found');

    const signers = (await getSigners()) as HardhatEthersSigner[];
    if (signers[0] && signers[1] && signers[2]) {
      [alice, bob, charlie] = signers;
    }

    governanceAddresses = mento.addresses[chainId]!;
    if (!governanceAddresses)
      throw new Error('Governance addresses not found for this chain');

    mentoToken = MentoToken__factory.connect(
      governanceAddresses.MentoToken,
      provider as any,
    );
    locking = Locking__factory.connect(
      governanceAddresses.Locking,
      provider as any,
    );
    governor = MentoGovernor__factory.connect(
      governanceAddresses.MentoGovernor,
      provider as any,
    );

    await setUpTestAccounts(
      [alice, bob, charlie],
      true,
      governanceAddresses,
      '100000000',
    );

    const treasury = await ethers.getImpersonatedSigner(
      governanceAddresses.TimelockController,
    );
    await mentoToken
      .connect(treasury)
      .transfer(alice.address, parseEther('1000'));
    await mentoToken
      .connect(treasury)
      .transfer(bob.address, parseEther('1000'));

    console.log('Creating more locks');
    for (let i = 1; i <= 500; i++) {
      if (i % 20 === 0) {
        console.log(`Created ${i} locks`);
        timeTravel(1);
      }
      if (i % 3 !== 0) {
        await locking
          .connect(alice)
          .lock(alice.address, alice.address, parseEther('1'), 6, 6);
      } else {
        await locking
          .connect(bob)
          .lock(bob.address, bob.address, parseEther('1'), 6, 6);
      }
    }

    amountToTransfer = parseEther('1000000');
    target = ethers.ZeroAddress;

    calldata = mentoToken.interface.encodeFunctionData('transfer', [
      alice.address,
      amountToTransfer,
    ]);

    console.log('Environment setup complete');
    return chainId;
  };
});
