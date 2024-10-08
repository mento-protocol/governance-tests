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
} from '@mento-protocol/mento-core-ts';

import { timeTravel, setUpTestAccounts, submitProposal } from './utils/utils';
import { networks } from '../config';

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
    // @ts-expect-error - forking doesn't exist in hre because of hardhat version mismatch
    await helpers.reset(hre.network.config.forking.url);
    this.timeout(0);

    const chainId = hre.network.config.chainId;

    if (chainId !== networks.celo.chainId) {
      this.skip();
    }

    await setupEnvironment(500);

    console.log('\r\n========================');
    console.log(`Running Gas Tests on network with chain id: ${chainId}`);
    console.log('========================\r\n');
  });

  it('locking.withdraw', async function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await locking.connect(alice).withdraw();

    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for withdrawal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(100_000);
  });

  it('locking.lock', async function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await locking
      .connect(alice)
      .lock(alice.address, alice.address, parseEther('1'), 6, 6);

    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for lock: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('locking.relock', async function () {
    const id = await locking.counter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await locking
      .connect(alice)
      .relock(id, alice.address, parseEther('1'), 6, 6);

    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for relock: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('governor.propose', async function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await governor
      .connect(alice)
      [
        'propose(address[],uint256[],bytes[],string)'
      ]([target], [0], [calldata], 'description1');
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for submitting proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('governor.castVote', async function () {
    const proposalId = submitProposal(
      governanceAddresses,
      alice,
      [governanceAddresses.MentoToken],
      [0n],
      [calldata],
      'description2',
    );
    timeTravel(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx1: any = await governor.connect(alice).castVote(proposalId, 1);
    const receipt1 = await tx1.wait();
    const actualGasUsed1 = receipt1.gasUsed;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx2: any = await governor.connect(bob).castVote(proposalId, 0);
    const receipt2 = await tx2.wait();
    const actualGasUsed2 = receipt2.gasUsed;

    console.log(`Gas used for Alice's vote: ${actualGasUsed1}`);
    console.log(`Gas used for Bob's vote: ${actualGasUsed2}`);

    expect(actualGasUsed1).to.be.lt(200_000);
    expect(actualGasUsed2).to.be.lt(200_000);
  });

  it('governor.queue', async function () {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await governor.connect(alice)['queue(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for queueing proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('governor.execute', async function () {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await governor
      .connect(alice)
      ['execute(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for executing proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  it('governor.cancel', async function () {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await (governor as any)
      .connect(alice)
      ['cancel(uint256)'](proposalId);
    const receipt = await tx.wait();
    const actualGasUsed = receipt.gasUsed;

    console.log(`Gas used for canceling proposal: ${actualGasUsed}`);

    expect(actualGasUsed).to.be.lt(500_000);
  });

  const setupEnvironment = async (numberOfLocks: number): Promise<number> => {
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

    console.log('Creating more locks, this may take a while');
    for (let i = 1; i <= numberOfLocks; i++) {
      if (i % 50 === 0) {
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
