import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import * as mento from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { setUpTestAccounts } from './utils/utils';

import { MentoToken, MentoToken__factory } from '@mento-protocol/mento-core-ts';

async function unpauseMentoToken(
  mentoAddresses: mento.ContractAddresses,
): Promise<void> {
  const mentoToken = MentoToken__factory.connect(
    mentoAddresses.MentoToken,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethers.provider as any,
  );
  const timelockController = await ethers.getImpersonatedSigner(
    mentoAddresses.TimelockController,
  );
  await mentoToken.connect(timelockController!).unpause();
}

async function pauseMentoToken(
  mentoAddresses: mento.ContractAddresses,
): Promise<void> {
  const mentoTokenAddress = mentoAddresses.MentoToken;

  const mentoToken = MentoToken__factory.connect(
    mentoAddresses.MentoToken,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethers.provider as any,
  );

  const isPaused = await mentoToken.paused();
  if (!isPaused) {
    // Read the current value of slot 0
    // inspect MentoToken storage-layout --pretty to see the layout
    const currentSlotValue = await ethers.provider.getStorage(
      mentoTokenAddress,
      0,
    );

    // Convert the hex string to a bigint for easier manipulation
    let slotValueBigInt = BigInt(currentSlotValue);

    // Set the _paused bit (21st byte) to 1 without modifying the _owner address
    slotValueBigInt = slotValueBigInt | (BigInt(1) << BigInt(160));

    // Convert back to hex string, maintaining 32 byte length
    const newSlotValue = ethers.toBeHex(slotValueBigInt, 32);

    // Set the new storage value
    await ethers.provider.send('hardhat_setStorageAt', [
      mentoTokenAddress,
      '0x0', // slot 0
      newSlotValue,
    ]);

    // Verify that the token is now paused
    const nowPaused = await mentoToken.paused();

    if (!nowPaused) {
      throw new Error('Mento Token is not paused...');
    }
  }
}

describe('Mento Token', function () {
  const { provider, parseEther } = ethers;

  let mentoAddresses: mento.ContractAddresses;
  let mentoToken: MentoToken;

  beforeEach(async function () {
    // reset the fork state between tests to not pollute the state
    // @ts-expect-error - forking doesn't exist in hre for some reason
    await helpers.reset(hre.network.config.forking.url);

    // Pause the token if it is unpaused as that is the expected state
    await pauseMentoToken(mentoAddresses);
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

    mentoToken = MentoToken__factory.connect(
      mentoAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Mento Token tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should be owned by the TimelockController', async function () {
    expect(await mentoToken.owner()).to.equal(
      mentoAddresses.TimelockController,
    );
  });

  it('should have supply gte initial supply', async function () {
    const totalSupply = await mentoToken.totalSupply();
    const initialTokenSupply = parseEther('307000000');

    expect(totalSupply).greaterThanOrEqual(initialTokenSupply);
  });

  it('should revert when mint is called by an address != Emission', async function () {
    const [addr] = await ethers.getSigners();
    await expect(
      mentoToken.connect(addr!).mint(addr!.address, parseEther('1')),
    ).to.be.revertedWith('MentoToken: only emission contract');
  });

  it('should successfully mint when called by the Emission contract', async function () {
    const emissionSigner = await ethers.getImpersonatedSigner(
      mentoAddresses.Emission,
    );
    const [receiver] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amount = parseEther('100');

    expect(await mentoToken.balanceOf(receiver!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(receiver!.address, amount);
    expect(await mentoToken.totalSupply()).to.equal(supplyBefore + amount);
    expect(await mentoToken.balanceOf(receiver!.address)).to.equal(amount);
  });

  it('should allow for tokens to be transferred by anyone when unpaused', async function () {
    const emissionSigner = await ethers.getImpersonatedSigner(
      mentoAddresses.Emission,
    );
    const [bob, alice] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amountToMint = parseEther('1337');

    expect(await mentoToken.balanceOf(bob!.address)).to.equal(0);
    expect(await mentoToken.balanceOf(alice!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(bob!.address, amountToMint);

    const amountToTransfer = parseEther('123');

    await expect(
      mentoToken.connect(bob!).transfer(alice!.address, amountToTransfer),
    ).to.be.revertedWith('MentoToken: token transfer while paused');

    await unpauseMentoToken(mentoAddresses);

    await mentoToken.connect(bob!).transfer(alice!.address, amountToTransfer);
    expect(await mentoToken.balanceOf(bob!.address)).to.equal(
      amountToMint - amountToTransfer,
    );
    expect(await mentoToken.balanceOf(alice!.address)).to.equal(
      amountToTransfer,
    );
    expect(await mentoToken.totalSupply()).to.equal(
      supplyBefore + amountToMint,
    );
  });

  it('should allow for tokens to be transferred by owner,locking and emission when paused', async function () {
    const addresses = [
      mentoAddresses.Emission,
      mentoAddresses.Locking,
      mentoAddresses.TimelockController,
    ];
    const [recipient] = await ethers.getSigners();
    const amountToTransfer = parseEther('361');
    expect(await mentoToken.paused()).to.be.true;

    for (const address of addresses) {
      const signer = await ethers.getImpersonatedSigner(address);
      await setUpTestAccounts([signer], false, mentoAddresses);

      const senderBalance = await mentoToken.balanceOf(signer.address);
      const recipientBalance = await mentoToken.balanceOf(recipient!.address);

      await mentoToken
        .connect(signer!)
        .transfer(recipient!.address, amountToTransfer);
      expect(await mentoToken.balanceOf(signer!.address)).to.equal(
        senderBalance - amountToTransfer,
      );
      expect(await mentoToken.balanceOf(recipient!.address)).to.equal(
        recipientBalance + amountToTransfer,
      );
    }
  });

  it('should allow for tokens to be burned by anyone when unpaused', async function () {
    const emissionSigner = await ethers.getImpersonatedSigner(
      mentoAddresses.Emission,
    );
    const [bob] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amountToMint = parseEther('1337');

    expect(await mentoToken.balanceOf(bob!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(bob!.address, amountToMint);

    const amountToBurn = parseEther('456');

    await expect(
      mentoToken.connect(bob!).burn(amountToBurn),
    ).to.be.revertedWith('MentoToken: token transfer while paused');

    await unpauseMentoToken(mentoAddresses);

    await mentoToken.connect(bob!).burn(amountToBurn);
    expect(await mentoToken.balanceOf(bob!.address)).to.equal(
      amountToMint - amountToBurn,
    );
    expect(await mentoToken.totalSupply()).to.equal(
      supplyBefore + amountToMint - amountToBurn,
    );
  });
});
