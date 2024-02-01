import hre, { ethers } from 'hardhat';
import { parseEther } from 'ethers';
import { addresses, ContractAddresses } from '@mento-protocol/mento-sdk';

import {
  Airgrab,
  Airgrab__factory,
  Locking,
  Locking__factory,
  MentoToken,
  MentoToken__factory,
} from '@mento-protocol/mento-core-ts';

type ClaimParameters = {
  claimAmount: string;
  delegate: string;
  merkleProof: string[];
  fractalProof: string;
  fractalProofValidUntil: bigint;
  fractalProofApprovedAt: bigint;
  fractalId: string;
};

describe.only('Airgrab', function () {
  const { provider } = ethers;

  let contractAddresses: ContractAddresses | undefined;
  let airgrab: Airgrab;
  let veMentoToken: Locking;
  let mentoToken: MentoToken;

  const testUserWithKycAndAllocation: string =
    '0x12860B283318bb73195F22C54d88f094aFc3DF1';

  before(async function () {
    const chainId = hre.network.config.chainId;

    if (!chainId) {
      throw new Error('Chain ID not found');
    }

    contractAddresses = addresses[chainId];
    if (!contractAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    airgrab = Airgrab__factory.connect(
      contractAddresses.Airgrab,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    veMentoToken = Locking__factory.connect(
      contractAddresses.Locking,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    mentoToken = MentoToken__factory.connect(
      contractAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n======================================================');
    console.log('Running Airgrab tests on network with chain id:', chainId);
    console.log(
      '==========================================================\r\n',
    );
  });

  describe('Claim', function () {
    this.beforeEach(async function () {
      // Reset the network state
      await hre.network.provider.request({
        method: 'hardhat_reset',
        params: [],
      });
      // Impersonate the emission contract and mint some tokens to the airgrab contract
      const emissionSigner = await ethers.getImpersonatedSigner(
        contractAddresses!.Emission,
      );
      await mentoToken
        .connect(emissionSigner)
        .mint(contractAddresses!.Airgrab, parseEther('1000').toString());
    });

    it('Should be successfull using a KYCed & eligible account', async function () {
      // Arrange
      const claimParams: ClaimParameters = {
        claimAmount: parseEther('100').toString(),
        delegate: testUserWithKycAndAllocation,
        merkleProof: [],
        fractalProof: '',
        fractalProofValidUntil: BigInt(0),
        fractalProofApprovedAt: BigInt(0),
        fractalId: '',
      };

      // const emissionSigner = await ethers.getImpersonatedSigner(
      //   contractAddresses!.Emission,
      // );

      // mentoToken.
      //   .connect(emissionSigner)
      //   .mint(contractAddresses!.Airgrab, parseEther('1000').toString());

      console.log('Airgrab address:', contractAddresses!.Airgrab);
      console.log('MentoToken address:', contractAddresses!.MentoToken);

      //

      const airgrabMentoBalanceBefore = await mentoToken.balanceOf(
        contractAddresses!.Airgrab,
      );

      const userVeTokenBalanceBefore = await veMentoToken.balanceOf(
        testUserWithKycAndAllocation,
      );

      console.log(
        'User veToken balance before:',
        userVeTokenBalanceBefore.toString(),
      );

      console.log(
        'Airgrab Mento balance before:',
        airgrabMentoBalanceBefore.toString(),
      );

      // Act
      await airgrab.claim(
        claimParams.claimAmount,
        claimParams.delegate,
        claimParams.merkleProof,
        claimParams.fractalProof,
        claimParams.fractalProofValidUntil,
        claimParams.fractalProofApprovedAt,
        claimParams.fractalId,
        { from: testUserWithKycAndAllocation },
      );

      // Assert

      // Things to do:
      // - Need to simulate the emission contract and mint some tokens to the airgrab contract
      // - Add assert to verivy that the user's veToken balance has increased by the claim amount
      // - Add assert to verify that the user has a lock
      // - Add assert to verify that the tokens claimed have increased

      // Balace of the user veToken should be increased by the claim amount
      // USer should have a lock
      // Tokens claimed should have been increased
      // Airgrab balance of mento token should have been decreased.

      // Add an account to hardhat settings for a KYC passed wallet
      // Modify the merkle tree to include wallet and ensure that root is being used on the contract
      // Determine what needs to be done on chain to get the fractal on chain setup

      console.log(await airgrab.getAddress());

      return true;
    });
  });
});
