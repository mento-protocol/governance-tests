import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import {
  ContractAddresses,
  addresses as MentoAddresses,
} from '@mento-protocol/mento-sdk';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { MentoToken, MentoToken__factory } from '@mento-protocol/mento-core-ts';

describe('Mento Token', function () {
  const { provider, parseEther } = ethers;

  let contractAddresses: ContractAddresses;
  let mentoToken: MentoToken;

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

    mentoToken = MentoToken__factory.connect(
      contractAddresses.MentoToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider as any,
    );

    console.log('\r\n========================');
    console.log('Running Mento Token tests on network with chain id:', chainId);
    console.log('========================\r\n');
  });

  it('should have supply gte initial supply', async function () {
    const totalSupply = await mentoToken.totalSupply();
    const initialTokenSupply = parseEther('350000000');

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
      contractAddresses.Emission,
    );
    const [receiver] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amount = parseEther('100');

    expect(await mentoToken.balanceOf(receiver!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(receiver!.address, amount);
    expect(await mentoToken.totalSupply()).to.equal(supplyBefore + amount);
    expect(await mentoToken.balanceOf(receiver!.address)).to.equal(amount);
  });

  it('should allow for tokens to be transferred', async function () {
    const emissionSigner = await ethers.getImpersonatedSigner(
      contractAddresses.Emission,
    );
    const [bob, alice] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amountToMint = parseEther('1337');

    expect(await mentoToken.balanceOf(bob!.address)).to.equal(0);
    expect(await mentoToken.balanceOf(alice!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(bob!.address, amountToMint);

    const amountToTransfer = parseEther('123');
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

  it('should allow for tokens to be burned', async function () {
    const emissionSigner = await ethers.getImpersonatedSigner(
      contractAddresses.Emission,
    );
    const [bob] = await ethers.getSigners();
    const supplyBefore = await mentoToken.totalSupply();
    const amountToMint = parseEther('1337');

    expect(await mentoToken.balanceOf(bob!.address)).to.equal(0);

    await mentoToken.connect(emissionSigner!).mint(bob!.address, amountToMint);

    const amountToBurn = parseEther('456');
    await mentoToken.connect(bob!).burn(amountToBurn);
    expect(await mentoToken.balanceOf(bob!.address)).to.equal(
      amountToMint - amountToBurn,
    );
    expect(await mentoToken.totalSupply()).to.equal(
      supplyBefore + amountToMint - amountToBurn,
    );
  });
});