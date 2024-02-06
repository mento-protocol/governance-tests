import * as helpers from '@nomicfoundation/hardhat-toolbox/network-helpers';

export const timeTravel = async (days: number): Promise<void> => {
  const blocks = (days * 86400) / 5;
  await helpers.mine(blocks);
};

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

  // Arithmetic operations using BigInt directly
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
