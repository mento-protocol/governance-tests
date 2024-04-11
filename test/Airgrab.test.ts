import hre, { ethers } from 'hardhat';
// Although BytesLike exists in ethers, linter fails to recognize it
// eslint-disable-next-line import/named
import { parseEther, getAddress, BytesLike } from 'ethers';
import * as mento from '@mento-protocol/mento-sdk';
import { expect } from 'chai';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import {
  Airgrab,
  Airgrab__factory,
  Locking,
  Locking__factory,
  MentoToken,
  MentoToken__factory,
  TimelockController,
  TimelockController__factory,
} from '@mento-protocol/mento-core-ts';
import { getMessage } from './utils/utils';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('Airgrab', function () {
  const { provider } = ethers;

  let governanceAddresses: mento.ContractAddresses;
  let airgrab: Airgrab;
  let locking: Locking;
  let mentoToken: MentoToken;
  let mentoTreasury: TimelockController;

  // Test user with KYC and allocation
  const testUser: string = getAddress(process.env.AIRGRAB_TESTER!);

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

    governanceAddresses = mento.addresses[chainId]!;
    if (!governanceAddresses) {
      throw new Error('Governance addresses not found for this chain');
    }

    airgrab = Airgrab__factory.connect(
      governanceAddresses.Airgrab,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    locking = Locking__factory.connect(
      governanceAddresses.Locking,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    mentoToken = MentoToken__factory.connect(
      governanceAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    mentoTreasury = TimelockController__factory.connect(
      governanceAddresses.TimelockController,
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
    let address: string,
      proof: BytesLike,
      validUntil: number,
      approvedAt: number,
      fractalId: string;

    const claimAmount = parseEther('100');

    before(async function () {
      const signer = new ethers.Wallet(
        process.env.AIRGRAB_TESTER_PK!,
        provider,
      );

      const message = getMessage();
      const signature = await signer.signMessage(message);
      const encMessage = encodeURIComponent(message);
      const url = `https://credentials.next.fractal.id?message=${encMessage}&signature=${signature}`;

      let fractalCredentials;

      try {
        const res = await fetch(url);
        fractalCredentials = await res.json();
      } catch (err) {
        console.log(err);
        throw new Error('Error fetching credentials from Fractal API');
      }

      address = fractalCredentials.address;
      proof = fractalCredentials.proof;
      validUntil = fractalCredentials.validUntil;
      approvedAt = fractalCredentials.approvedAt;
      fractalId = fractalCredentials.fractalId;
    });

    it('Should fail with invalid KYC', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);
      const invalidFractalProof = '0xdeaddeaddead';

      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            invalidFractalProof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: Invalid KYC');
    });

    it('Should fail with invalid merkle proof', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);
      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(',').slice(0, -1),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: not in tree');
    });

    it('Should allow only the claimer', async function () {
      const alice = ((await ethers.getSigners()) as HardhatEthersSigner[])[0]!;

      await expect(
        airgrab
          .connect(alice)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: Invalid KYC');
    });

    it('Should revert when the KYC is expired', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      // Time travel to the future to expire the KYC
      const now = await helpers.time.latest();
      await helpers.time.increase(BigInt(validUntil - now + 1));

      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: KYC no longer valid');
    });

    it('Should be successfull using a KYCed & eligible account', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      expect(await locking.balanceOf(testUser)).to.eq(0);
      expect(await locking.getVotes(testUser)).to.eq(0);
      expect(await airgrab.claimed(testUser)).to.eq(false);

      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.changeTokenBalances(
        mentoToken,
        [locking, airgrab],
        [claimAmount, -claimAmount],
      );

      expect(await locking.balanceOf(testUser)).to.eq(claimAmount);
      expect(await locking.getVotes(testUser)).to.eq(claimAmount);
      expect(await airgrab.claimed(testUser)).to.eq(true);
    });

    it('Should fail when claimed twice', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      await airgrab
        .connect(userSigner)
        .claim(
          claimAmount,
          address,
          process.env.MERKLE_PROOF!.split(','),
          proof,
          validUntil,
          approvedAt,
          fractalId,
        );
      // Claiming again fails
      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: already claimed');
    });

    it('Should delegate voting power when claimed with a delegate', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);
      const alice = ((await ethers.getSigners()) as HardhatEthersSigner[])[0]!
        .address;

      expect(await locking.balanceOf(alice)).to.eq(0);
      expect(await locking.getVotes(alice)).to.eq(0);
      expect(await locking.balanceOf(testUser)).to.eq(0);
      expect(await locking.getVotes(testUser)).to.eq(0);
      expect(await airgrab.claimed(testUser)).to.eq(false);

      // Claim airgrab with a delegate
      await airgrab
        .connect(userSigner)
        .claim(
          claimAmount,
          alice,
          process.env.MERKLE_PROOF!.split(','),
          proof,
          validUntil,
          approvedAt,
          fractalId,
        );

      expect(await locking.balanceOf(alice)).to.eq(claimAmount);
      expect(await locking.getVotes(alice)).to.eq(claimAmount);
      expect(await locking.balanceOf(testUser)).to.eq(0);
      expect(await locking.getVotes(testUser)).to.eq(0);
      expect(await airgrab.claimed(testUser)).to.eq(true);

      // Claiming again fails
      await expect(
        airgrab
          .connect(userSigner)
          .claim(
            claimAmount,
            address,
            process.env.MERKLE_PROOF!.split(','),
            proof,
            validUntil,
            approvedAt,
            fractalId,
          ),
      ).to.be.revertedWith('Airgrab: already claimed');
    });

    it('Should fail when airgrab active', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      await airgrab
        .connect(userSigner)
        .claim(
          claimAmount,
          address,
          process.env.MERKLE_PROOF!.split(','),
          proof,
          validUntil,
          approvedAt,
          fractalId,
        );

      await expect(
        airgrab.connect(userSigner).drain(governanceAddresses.MentoToken),
      ).to.be.revertedWith('Airgrab: not finished');
    });

    it('Should drain tokens when the airgrab expired', async function () {
      const userSigner = await ethers.getImpersonatedSigner(testUser);

      await airgrab
        .connect(userSigner)
        .claim(
          claimAmount,
          address,
          process.env.MERKLE_PROOF!.split(','),
          proof,
          validUntil,
          approvedAt,
          fractalId,
        );

      const YEAR = 31536000n;
      await helpers.time.increase(YEAR);

      // token needs to be unpaused if paused
      if (await mentoToken.paused()) {
        const governance = await ethers.getImpersonatedSigner(
          governanceAddresses.TimelockController,
        );
        await mentoToken.connect(governance).unpause();
      }

      const remainingBalance = await mentoToken.balanceOf(
        governanceAddresses.Airgrab,
      );
      await expect(
        airgrab.connect(userSigner).drain(governanceAddresses.MentoToken),
      ).to.changeTokenBalances(
        mentoToken,
        [mentoTreasury, airgrab],
        [remainingBalance, -remainingBalance],
      );
    });
  });
});
