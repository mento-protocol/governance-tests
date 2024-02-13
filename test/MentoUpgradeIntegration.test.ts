import { expect } from 'chai';
import { timeTravel } from './utils/utils';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import { EventLog } from 'ethers';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

import {
  MentoGovernor,
  MentoGovernor__factory,
  Reserve,
  Reserve__factory,
  MentoToken__factory,
  Locking__factory,
} from '@mento-protocol/mento-core-ts';

describe('Mento Upgrade', function () {
  const {
    provider,
    parseEther,
    deployContract,
    getImpersonatedSigner,
    Contract,
    getSigners,
  } = ethers;

  const celoRegistryAddress = '0x000000000000000000000000000000000000ce10';
  const celoRegistryABI = [
    'function getAddressForString(string) external view returns (address)',
  ];
  const proxyABI = [
    'function _getImplementation() external view returns (address)',
  ];

  let celoGovernanceAddress: string;

  let mentoAddresses: mento.ContractAddresses;
  let mentoGovernor: MentoGovernor;
  let reserve: Reserve;

  let voter1: HardhatEthersSigner;
  let voter2: HardhatEthersSigner;
  let voter3: HardhatEthersSigner;
  let proposer: HardhatEthersSigner;
  let random: HardhatEthersSigner;

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);

    await transferOwnership();
    await setUpTestAccounts([voter1, voter2, voter3, proposer, random]);
  });

  before(async function () {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    mentoAddresses = mento.addresses[chainId]!;
    if (!mentoAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    mentoGovernor = MentoGovernor__factory.connect(
      mentoAddresses.MentoGovernor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    reserve = Reserve__factory.connect(
      mentoAddresses.Reserve,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    const registryContract = new Contract(
      celoRegistryAddress,
      celoRegistryABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    celoGovernanceAddress =
      await registryContract.getAddressForString!('Governance');

    const signers = (await getSigners()) as HardhatEthersSigner[];
    if (
      signers[0] &&
      signers[1] &&
      signers[2] &&
      signers[3] &&
      signers[4] &&
      signers[5]
    ) {
      [proposer, random, voter1, voter2, voter3] = signers;
    }

    console.log('\r\n========================');
    console.log(
      'Running Mento Upgrade tests on network with chain id:',
      chainId,
    );
    console.log('========================\r\n');
  });

  it('should allow for new Contracts to be initialized', async function () {
    const newStableToken = await deployContract('StableTokenV2', [false]);
    await newStableToken.transferOwnership!(mentoAddresses.TimelockController);
    expect(await newStableToken.owner!()).to.equal(
      mentoAddresses.TimelockController,
    );

    const target = await newStableToken.getAddress();
    const value = 0n;
    const calldata = newStableToken.interface.encodeFunctionData('initialize', [
      'testToken',
      'tt',
      0,
      random.address,
      0,
      0,
      [],
      [],
      '',
    ]);

    const proposalId = await submitProposal(
      proposer,
      [target],
      [value],
      [calldata],
      'initialize testToken',
    );

    await mentoGovernor.connect(voter1).castVote(proposalId, 1);
    await mentoGovernor.connect(voter2).castVote(proposalId, 1);
    await mentoGovernor.connect(voter3).castVote(proposalId, 1);

    timeTravel(7);

    await mentoGovernor.connect(proposer)['queue(uint256)'](proposalId);

    timeTravel(2);

    await mentoGovernor.connect(proposer)['execute(uint256)'](proposalId);

    expect(await newStableToken.name!()).to.equal('testToken');
    expect(await newStableToken.symbol!()).to.equal('tt');
    expect(await newStableToken.owner!()).to.equal(
      mentoAddresses.TimelockController,
    );
  });

  it('should allow for existing Contracts to be changed', async function () {
    const target = mentoAddresses.Reserve;

    const value = 0n;
    // add a new stableToken to the reserve
    const calldata1 = reserve.interface.encodeFunctionData('addToken', [
      random.address,
    ]);
    // add new collateral asset to the reserve
    const calldata2 = reserve.interface.encodeFunctionData(
      'addCollateralAsset',
      [random.address],
    );
    // set daily spending ratio for collateral assets
    const calldata3 = reserve.interface.encodeFunctionData(
      'setDailySpendingRatioForCollateralAssets',
      [[random.address], [parseEther('0.1')]],
    );

    const proposalId = await submitProposal(
      proposer,
      [target, target, target],
      [value, value, value],
      [calldata1, calldata2, calldata3],
      'add tokens to reserve',
    );

    await mentoGovernor.connect(voter1).castVote(proposalId, 1);
    await mentoGovernor.connect(voter2).castVote(proposalId, 1);
    await mentoGovernor.connect(voter3).castVote(proposalId, 1);

    timeTravel(7);

    await mentoGovernor.connect(proposer)['queue(uint256)'](proposalId);

    timeTravel(2);

    await mentoGovernor.connect(proposer)['execute(uint256)'](proposalId);

    expect(await reserve.isStableAsset(random.address)).to.equal(true);
    expect(await reserve.isCollateralAsset(random.address)).to.equal(true);
    expect(
      await reserve.getDailySpendingRatioForCollateralAsset(random.address),
    ).to.equal(parseEther('0.1'));
  });

  async function transferOwnership(): Promise<void> {
    const governance = await getImpersonatedSigner(celoGovernanceAddress);

    await reserve
      .connect(governance)
      .transferOwnership(mentoAddresses.TimelockController);

    const reserveProxy = await new Contract(
      mentoAddresses.Reserve,
      proxyABI,
      provider,
    );
    const reserveImplementation = await reserveProxy._getImplementation!();

    const reserveImplementationContract = Reserve__factory.connect(
      reserveImplementation,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );
    await reserveImplementationContract
      .connect(governance)
      .transferOwnership(mentoAddresses.TimelockController);
  }

  async function setUpTestAccounts(
    accounts: HardhatEthersSigner[],
  ): Promise<void> {
    const emissionSigner = await getImpersonatedSigner(mentoAddresses.Emission);
    const mentoToken = MentoToken__factory.connect(
      mentoAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );
    const locking = Locking__factory.connect(
      mentoAddresses.Locking,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );
    for (const account of accounts) {
      await mentoToken
        .connect(emissionSigner!)
        .mint(account.address, parseEther('1000000'));
      await mentoToken
        .connect(account)
        .approve(locking.getAddress(), parseEther('1000000'));
      await locking
        .connect(account)
        .lock(account.address, account.address, parseEther('1000000'), 52, 52);
      expect(await locking.balanceOf(account.address)).to.greaterThan(0n);
    }
  }

  const submitProposal = async (
    proposalSigner: HardhatEthersSigner,
    targets: string[],
    values: bigint[],
    calldatas: string[],
    description: string,
  ): Promise<bigint> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = await mentoGovernor
      .connect(proposalSigner)
      [
        'propose(address[],uint256[],bytes[],string)'
      ](targets, values, calldatas, description);
    const receipt = await tx.wait();
    const proposalCreatedEvent = receipt.logs.find(
      (e: EventLog) => e.fragment.name === 'ProposalCreated',
    );
    return proposalCreatedEvent.args[0]; // Returns the proposalId
  };
});
