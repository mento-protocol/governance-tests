import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ethers } from 'hardhat';
import { EventLog } from 'ethers';
import {
  MentoToken__factory,
  Locking__factory,
  MentoGovernor__factory,
} from '@mento-protocol/mento-core-ts';
import * as mento from '@mento-protocol/mento-sdk';
// Move block.timestamp and block.number in sync
export const timeTravel = async (days: number): Promise<void> => {
  const blocks = (days * 86400) / 5 + 1;
  await helpers.mine(blocks, { interval: 5 });
};
import { COUNTRY_NAMES } from './constants';

export const calculateVotingPower = (
  tokens: bigint,
  slopePeriod: bigint,
  cliffPeriod: bigint,
): bigint => {
  const ST_FORMULA_CONST_MULTIPLIER = 2n * 10n ** 7n;
  const ST_FORMULA_CLIFF_MULTIPLIER = 8n * 10n ** 7n;
  const ST_FORMULA_SLOPE_MULTIPLIER = 4n * 10n ** 7n;
  const ST_FORMULA_DIVIDER = 1n * 10n ** 8n;
  const MAX_CLIFF_PERIOD = 103n;
  const MAX_SLOPE_PERIOD = 104n;
  const MIN_CLIFF_PERIOD = 0n;
  const MIN_SLOPE_PERIOD = 1n;

  const amount =
    (tokens *
      (ST_FORMULA_CONST_MULTIPLIER +
        (ST_FORMULA_CLIFF_MULTIPLIER * (cliffPeriod - MIN_CLIFF_PERIOD)) /
          (MAX_CLIFF_PERIOD - MIN_CLIFF_PERIOD) +
        (ST_FORMULA_SLOPE_MULTIPLIER * (slopePeriod - MIN_SLOPE_PERIOD)) /
          (MAX_SLOPE_PERIOD - MIN_SLOPE_PERIOD))) /
    ST_FORMULA_DIVIDER;

  return amount;
};

export const setUpTestAccounts = async (
  accounts: HardhatEthersSigner[],
  giveVotingPower: boolean,
  mentoAddresses: mento.ContractAddresses,
): Promise<void> => {
  const emissionSigner = await ethers.getImpersonatedSigner(
    mentoAddresses.Emission,
  );
  const mentoToken = MentoToken__factory.connect(
    mentoAddresses.MentoToken,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethers.provider as any,
  );
  const locking = Locking__factory.connect(
    mentoAddresses.Locking,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethers.provider as any,
  );
  const amount = ethers.parseEther('1000000');

  for (const account of accounts) {
    await mentoToken.connect(emissionSigner!).mint(account.address, amount);
    if (giveVotingPower) {
      await mentoToken.connect(account).approve(locking.getAddress(), amount);
      await locking
        .connect(account)
        .lock(account.address, account.address, amount, 52, 52);
    }
  }
};

export const submitProposal = async (
  mentoAddresses: mento.ContractAddresses,
  proposalSigner: HardhatEthersSigner,
  targets: string[],
  values: bigint[],
  calldatas: string[],
  description: string,
): Promise<bigint> => {
  const governor = MentoGovernor__factory.connect(
    mentoAddresses.MentoGovernor,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethers.provider as any,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = await governor
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

function countryList(countryCodes: string[]): string {
  if (countryCodes.length === 0) return '';

  return countryCodes
    .map((code) => {
      const name = COUNTRY_NAMES[code];
      if (!name) {
        throw new Error('invalid country');
      }
      return `${name} (${code})`;
    })
    .join(', ');
}

export function getMessage(): string {
  const countriesString = countryList(
    process.env.RESTRICTED_COUNTRIES!.split(','),
  );

  return `I authorize Airdrop (${process.env.FRACTAL_CLIENT_ID!}) to get a proof from Fractal that:
- I passed KYC level plus+liveness
- I am not a resident of the following countries: ${countriesString}`;
}
