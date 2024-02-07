import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import {
    ContractAddresses,
    addresses as MentoAddresses,
  } from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';

import {
  MentoGovernor,
  MentoGovernor__factory,
  Broker,
  Broker__factory,
  BiPoolManager,
  BiPoolManager__factory,
  BreakerBox,
  BreakerBox__factory,
  Reserve,
  Reserve__factory,
  MedianDeltaBreaker,
  MedianDeltaBreaker__factory,
} from '@mento-protocol/mento-core-ts';

describe('Mento Upgrade', function () {
  const { provider, parseEther } = ethers;

  const celoRegistryAddress = '0x000000000000000000000000000000000000ce10';
  const celoRegistryABI = [
    "function getAddressForString(string) external view returns (address)",
  ];

  const OwnableABI = [
    "function owner() external view returns (address)",
    "function transferOwnership(address newOwner) external",
  ];

  let celoGovernanceAddress: string;

  let mentoAddresses: ContractAddresses;
  let mentoGovernor: MentoGovernor;
  let Broker: Broker;
  let BiPoolManager: BiPoolManager;
  let BreakerBox: BreakerBox;
  let MedianDeltaBreaker: MedianDeltaBreaker;
  let Reserve: Reserve;


  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);
  });

  before(async function () {
    const chainId = hre.network.config.chainId;
    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    mentoAddresses = MentoAddresses[chainId];
    if (!mentoAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    mentoGovernor = MentoGovernor__factory.connect(
      mentoAddresses.MentoGovernor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    Broker = Broker__factory.connect(
      mentoAddresses.Broker,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    BiPoolManager = BiPoolManager__factory.connect(
      mentoAddresses.BiPoolManager,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    BreakerBox = BreakerBox__factory.connect(
      mentoAddresses.BreakerBox,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    MedianDeltaBreaker = MedianDeltaBreaker__factory.connect(
      mentoAddresses.MedianDeltaBreaker,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    Reserve = Reserve__factory.connect(
      mentoAddresses.Reserve,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    const registryContract = new ethers.Contract(celoRegistryAddress, celoRegistryABI, provider);
    celoGovernanceAddress = await registryContract.getAddressForString('Governance');
    if (!celoGovernanceAddress) {
      throw new Error('Celo Governance address not found');
    }

    console.log('\r\n========================');
    console.log('Running Mento Upgrade tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should allow for new tokens to be created', async function () {
    await transferOwnership();
    // deploy new StableToken and transfer ownership to MentoGovernor
    // const StableToken = await ethers.deployContract('StableTokenV2', []);

  })

  async function transferOwnership(): Promise<void>{
    const governance = await ethers.getImpersonatedSigner(celoGovernanceAddress);

    await Broker.connect(governance).transferOwnership(mentoAddresses.MentoGovernor);
    expect(await Broker.owner()).to.equal(mentoAddresses.MentoGovernor);

    await BiPoolManager.connect(governance).transferOwnership(mentoAddresses.MentoGovernor);
    expect(await BiPoolManager.owner()).to.equal(mentoAddresses.MentoGovernor);

    await BreakerBox.connect(governance).transferOwnership(mentoAddresses.MentoGovernor);
    expect(await BreakerBox.owner()).to.equal(mentoAddresses.MentoGovernor);

    await MedianDeltaBreaker.connect(governance).transferOwnership(mentoAddresses.MentoGovernor);
    expect(await MedianDeltaBreaker.owner()).to.equal(mentoAddresses.MentoGovernor);

    await Reserve.connect(governance).transferOwnership(mentoAddresses.MentoGovernor);
    expect(await Reserve.owner()).to.equal(mentoAddresses.MentoGovernor);
  }

});
