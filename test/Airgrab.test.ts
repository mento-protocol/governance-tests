import hre, { ethers } from 'hardhat';
import { parseEther } from 'ethers';
import { addresses, ContractAddresses } from '@mento-protocol/mento-sdk';

import { Airgrab, Airgrab__factory } from '@mento-protocol/mento-core-ts';

type ClaimParameters = {
  claimAmount: string;
  delegate: string;
  merkleProof: string[];
  fractalProof: string;
  fractalProofValidUntil: bigint;
  fractalProofApprovedAt: bigint;
  fractalId: string;
};

describe('Airgrab', function () {
  const { provider } = ethers;

  let contractAddresses: ContractAddresses | undefined;
  let airgrab: Airgrab;

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

    console.log('\r\n========================');
    console.log('Running Airgrab tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  describe('Claim', function () {
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
