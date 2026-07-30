/**
 * Converting between what a user types and what a chain moves.
 *
 * Every function here is string→BigInt or BigInt→string, and none of them go
 * through `Number`. That is not fastidiousness: `0.1 + 0.2 !== 0.3` in binary
 * floating point, `1e9 * 0.07` is `70000000.00000001`, and both of those errors
 * land in a transfer amount. A ledger that cannot add up is not a ledger.
 *
 * `Number.MAX_SAFE_INTEGER` is about 9.007e15, so a lamport value above roughly
 * 9 million SOL is already unrepresentable as a JS number — and SPL tokens with
 * larger supplies and different decimals hit it far sooner.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * A decimal string in whole units → base units.
 *
 * Throws on anything that is not a plain non-negative decimal. Silently
 * coercing "1,5" or "1 SOL" to something would be worse than refusing: the user
 * would see a confirmation for an amount they did not write.
 */
export function toBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error('Enter an amount like 0.25');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(
      `That is more precision than this token has (${decimals} decimals).`,
    );
  }

  // Pad rather than round. Truncating the user's digits changes the amount;
  // padding with zeros does not.
  const padded = fraction.padEnd(decimals, '0');
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

/**
 * Base units → a decimal string, trailing zeros trimmed.
 *
 * "0.4 SOL", never "0.400000000". Long strings of zeros make two amounts hard
 * to compare at a glance, which is the only thing anyone does with a receipt.
 */
export function fromBaseUnits(amount: bigint | string, decimals: number): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;

  if (fraction === 0n) return `${negative ? '-' : ''}${whole}`;

  const padded = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}.${padded}`;
}

/** "0.4 SOL" — the amount and its ticker, formatted for display. */
export function formatTokenAmount(
  amount: bigint | string,
  decimals: number,
  symbol: string,
): string {
  return `${fromBaseUnits(amount, decimals)} ${symbol}`;
}

export const solToLamports = (sol: string): bigint => toBaseUnits(sol, 9);
export const lamportsToSol = (lamports: bigint | string): string =>
  fromBaseUnits(lamports, 9);

/**
 * Headroom left unspendable so the transfer's own fee can be paid.
 *
 * A base transaction fee is 5,000 lamports per signature. 10,000 covers that
 * with room for a priority fee, and is small enough (0.00001 SOL) that nobody
 * notices it withheld. Offering a "max" that leaves nothing for the fee produces
 * a transaction that always fails, which reads as the app being broken.
 */
export const FEE_HEADROOM_LAMPORTS = 10_000n;

/** The most of a SOL balance that can actually be sent. */
export function maxSendableLamports(balanceLamports: bigint): bigint {
  const spendable = balanceLamports - FEE_HEADROOM_LAMPORTS;
  return spendable > 0n ? spendable : 0n;
}
