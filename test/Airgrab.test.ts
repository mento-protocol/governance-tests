import hre, { ethers } from 'hardhat';
import fs from 'fs';
import { parseEther, getAddress, getBytes, hexlify } from 'ethers';
import {
  addresses as MentoAddresses,
  ContractAddresses,
} from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import {
  Airgrab,
  Airgrab__factory,
  Locking,
  Locking__factory,
  MentoToken,
  MentoToken__factory,
} from '@mento-protocol/mento-core-ts';
import { getMessage } from './getMessage';

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

  let contractAddresses: ContractAddresses;
  let airgrab: Airgrab;
  let veMentoToken: Locking;
  let mentoToken: MentoToken;
  let merkleRoot: any;

  // Test user with KYC and allocation
  const testUser: string = getAddress(
    '0x12860B283318bb73195F22C54d88f094aFc3DF1a',
  );

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

    const mentoChainContracts = MentoAddresses[chainId];
    if (!mentoChainContracts) {
      throw new Error('Governance addresses not found for this chain');
    }

    contractAddresses = mentoChainContracts;

    // Init contracts

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

    // Load the merkle root
    const treeData = JSON.parse(
      fs.readFileSync('constants/merkleTree.json', 'utf8'),
    );
    merkleRoot = treeData.root;

    console.log('\r\n======================================================');
    console.log('Running Airgrab tests on network with chain id:', chainId);
    console.log('\r\n Contract addresses', contractAddresses);
    console.log(
      '==========================================================\r\n',
    );
  });

  describe('Claim', function () {
    beforeEach(async function () {
      // Impersonate the emission contract and mint some tokens to the airgrab contract
      // const emissionSigner = await ethers.getImpersonatedSigner(
      //   contractAddresses.Emission,
      // );
      // await mentoToken
      //   .connect(emissionSigner)
      //   .mint(contractAddresses.Airgrab, parseEther('1000').toString());
    });

    it('Should be successfull using a KYCed & eligible account', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      console.log(
        '\r\n===================== MESSAGE =================================\n',
      );
      const message = getMessage();
      console.log(message);

      // Create signer with TestUser3 private key
      const signer = new ethers.Wallet(
        'a315701803976585ece0c2f434be18bdf83e98f17186e98051c094402ad4ea1f',
        provider,
      );

      // Sign the message
      const signature = await signer.signMessage(message);
      console.log(
        '\r\n===================== SIGNATURE =================================\n',
      );
      console.log(signature);

      // Url encode the message
      const encMessage = encodeURIComponent(message);

      // Generate the URL
      const url = `https://credentials.next.fractal.id?message=${encMessage}&signature=${signature}`;
      console.log(
        '\r\n===================== URL =================================\n',
      );
      console.log(url);

      console.log(
        '\r\n===================== PROOF =================================\n',
      );

      let fractalCredentials;

      try {
        // // Send the message to fractal api and get the proof
        const res = await fetch(url);
        fractalCredentials = await res.json();
        // do something with proof
        console.log(fractalCredentials);
      } catch (err) {
        console.log(err);
      }
      // Claim params
      const claimAmount = parseEther('100').toString();
      const delegate = fractalCredentials.address;
      const merkleProof = [
        '0xc0260aa87d4c691d368df3fe588d3133ccbfcaa4cc4adecf49b97facebb95afa',
        '0xba6e59fe2a99b9f038585af133a5c1f3fda13387adde65edd818e3ae5a837247',
        '0xe590bb15db139b6276553d351ba599e0590e735d4c81413cb78ad956548dc9fa',
      ];
      const fractalProof = fractalCredentials.proof;
      const fractalProofValidUntil = BigInt(fractalCredentials.validUntil);
      const fractalProofApprovedAt = BigInt(fractalCredentials.approvedAt);
      const fractalId = fractalCredentials.fractalId;

      const userVeTokenBalanceBefore = await veMentoToken.balanceOf(testUser);

      // Act
      await airgrab
        .connect(userSigner)
        .claim(
          claimAmount,
          delegate,
          merkleProof,
          fractalProof,
          fractalProofValidUntil,
          fractalProofApprovedAt,
          fractalId,
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

      // console.log(await airgrab.getAddress());

      return true;
    });
  });
});
