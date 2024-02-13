import { expect } from 'chai';
import { timeTravel, setUpTestAccounts, submitProposal } from './utils/utils';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import {
  MentoGovernor,
  MentoGovernor__factory,
  Reserve,
  Reserve__factory,
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
    await setUpTestAccounts(
      [voter1, voter2, voter3, proposer, random],
      true,
      mentoAddresses,
    );
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
    if (signers[0] && signers[1] && signers[2] && signers[3] && signers[4]) {
      [proposer, random, voter1, voter2, voter3] = signers;
    }

    console.log('\r\n========================');
    console.log(
      'Running Mento Upgrade tests on network with chain id:',
      chainId,
    );
    console.log('========================\r\n');
  });

  it('should allow for MentoUpgrades to be proposed and executed', async function () {
    const newStableToken = await deployContract('StableTokenV2', [false]);
    await newStableToken.transferOwnership!(mentoAddresses.TimelockController);
    expect(await newStableToken.owner!()).to.equal(
      mentoAddresses.TimelockController,
    );

    const stableTokenAddr = await newStableToken.getAddress();
    const values = Array(4).fill(0n);
    const calldatas = [];

    calldatas.push(
      newStableToken.interface.encodeFunctionData('initialize', [
        'testToken',
        'tt',
        0,
        random.address,
        0,
        0,
        [],
        [],
        '',
      ]),
    );
    calldatas.push(
      reserve.interface.encodeFunctionData('addToken', [stableTokenAddr]),
    );
    calldatas.push(
      reserve.interface.encodeFunctionData('addCollateralAsset', [
        mentoAddresses.MentoToken,
      ]),
    );
    calldatas.push(
      reserve.interface.encodeFunctionData(
        'setDailySpendingRatioForCollateralAssets',
        [[mentoAddresses.MentoToken], [parseEther('0.1')]],
      ),
    );

    const proposalId = await submitProposal(
      mentoAddresses,
      proposer,
      [
        stableTokenAddr,
        mentoAddresses.Reserve,
        mentoAddresses.Reserve,
        mentoAddresses.Reserve,
      ],
      values,
      calldatas,
      'MU061 - Add new stable token and add new collateral assets',
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

    expect(await reserve.isStableAsset(stableTokenAddr)).to.equal(true);
    expect(await reserve.isCollateralAsset(mentoAddresses.MentoToken)).to.equal(
      true,
    );
    expect(
      await reserve.getDailySpendingRatioForCollateralAsset(
        mentoAddresses.MentoToken,
      ),
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
});
