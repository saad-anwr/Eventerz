/**
 * Token gating - the requirement, and whether a wallet meets it.
 *
 * Every amount here is a BigInt or a decimal string, never a Number, for the
 * reasons `amount.ts` sets out: an SPL mint with 9 decimals passes
 * `Number.MAX_SAFE_INTEGER` long before it passes 2^63, and a gate that rounds
 * is a gate that admits the wrong people at the boundary.
 *
 * The functions here decide *nothing* on their own. The authoritative check is
 * the `check-gate` Edge Function, which reads the balance from the cluster with
 * the service-role key and calls a Postgres function revoked from
 * `authenticated`. What lives here is the rendering and the input validation -
 * the parts that must agree with the server but cannot replace it.
 *
 * A client-side balance check would be a suggestion. This file is careful to
 * never look like the gate itself.
 */

import { fromBaseUnits, toBaseUnits } from './amount';

/**
 * The `gate_mint` sentinel for plain SOL.
 *
 * SOL has no mint account, so there is no address to store. Native SOL and
 * wrapped SOL are deliberately different requirements here: a host asking for
 * "1 SOL to enter" means the balance in the wallet, not an SPL position that
 * happens to be denominated in it.
 */
export const NATIVE_MINT = 'native';

export interface GateRequirement {
  tokenGated: boolean;
  mint: string | null;
  /** Base units, as a string - see the module note on precision. */
  minAmount: string | null;
  decimals: number | null;
  symbol: string | null;
  /** Free text the host wrote, for display only. Never evaluated. */
  requirement: string | null;
}

/**
 * Does this holding satisfy this requirement?
 *
 * `>=`, and both sides BigInt. Accepts strings because that is how the amounts
 * arrive - from PostgREST as `numeric`, and from an RPC as a decimal string.
 */
export function meetsGate(held: bigint | string, required: bigint | string): boolean {
  const have = typeof held === 'string' ? BigInt(held) : held;
  const need = typeof required === 'string' ? BigInt(required) : required;
  return have >= need;
}

/** How much more is needed. Zero when the requirement is already met. */
export function gateShortfall(
  held: bigint | string,
  required: bigint | string,
): bigint {
  const have = typeof held === 'string' ? BigInt(held) : held;
  const need = typeof required === 'string' ? BigInt(required) : required;
  return have >= need ? 0n : need - have;
}

/**
 * The requirement as a sentence.
 *
 * Falls back to the host's free text, then to a bare "Token holders only". An
 * ungated event returns null rather than an empty string, so a caller cannot
 * accidentally render a padlock with no label next to it.
 */
export function describeGate(gate: GateRequirement): string | null {
  if (!gate.tokenGated) return null;

  if (gate.mint && gate.minAmount) {
    const symbol = gate.symbol ?? (gate.mint === NATIVE_MINT ? 'SOL' : 'token');
    const decimals = gate.decimals ?? (gate.mint === NATIVE_MINT ? 9 : 0);
    return `Hold ${fromBaseUnits(gate.minAmount, decimals)} ${symbol} to join`;
  }

  return gate.requirement?.trim() || 'Token holders only';
}

/** Base58, 32–44 chars. Enough to catch a paste error, not a full decode. */
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface GateDraft {
  mint: string;
  /** What the host typed, in whole units: "1.5", not "1500000000". */
  amount: string;
  decimals: number;
  symbol: string;
}

/**
 * Validate and normalise what a host typed on the create form.
 *
 * Throws with a message meant for the host, in the style `toBaseUnits` already
 * uses - refusing an ambiguous amount rather than coercing it, because the
 * coerced value is the one that silently locks out every guest.
 */
export function buildGate(draft: GateDraft): {
  gate_mint: string;
  gate_min_amount: string;
  gate_decimals: number;
  gate_symbol: string;
  token_gated: true;
} {
  const mint = draft.mint.trim();
  if (mint !== NATIVE_MINT && !BASE58_ADDRESS.test(mint)) {
    throw new Error('That does not look like a mint address.');
  }

  if (draft.decimals < 0 || draft.decimals > 18 || !Number.isInteger(draft.decimals)) {
    throw new Error('Token decimals must be a whole number between 0 and 18.');
  }

  // Throws on anything that is not a plain decimal - reused rather than
  // reimplemented, so the create form and a transfer reject the same strings.
  const base = toBaseUnits(draft.amount, draft.decimals);

  // A gate of zero admits everyone while displaying a padlock, which is the
  // exact dishonesty migration 0013 exists to remove.
  if (base <= 0n) {
    throw new Error('A gate of zero would let everyone in. Enter an amount above 0.');
  }

  const symbol = draft.symbol.trim();
  if (!symbol) throw new Error('Give the token a symbol so guests know what to hold.');

  return {
    gate_mint: mint,
    gate_min_amount: base.toString(),
    gate_decimals: draft.decimals,
    gate_symbol: symbol,
    token_gated: true,
  };
}
