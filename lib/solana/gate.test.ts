import { describe, expect, it } from 'vitest';

import {
  NATIVE_MINT,
  buildGate,
  describeGate,
  gateShortfall,
  meetsGate,
  type GateRequirement,
} from './gate';

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCaLnJdEFCcHkPYmLj';

function gate(overrides: Partial<GateRequirement> = {}): GateRequirement {
  return {
    tokenGated: true,
    mint: BONK,
    minAmount: '1000000',
    decimals: 5,
    symbol: 'BONK',
    requirement: null,
    ...overrides,
  };
}

describe('meetsGate', () => {
  it('admits an exact match', () => {
    expect(meetsGate('1000', '1000')).toBe(true);
  });

  it('admits more than required', () => {
    expect(meetsGate('1001', '1000')).toBe(true);
  });

  it('refuses one base unit short', () => {
    expect(meetsGate('999', '1000')).toBe(false);
  });

  /*
   * The whole reason these are BigInt. Both of these values are past
   * Number.MAX_SAFE_INTEGER, where `Number` rounds them to the same float - so
   * a Number-based gate would admit a wallet holding one unit less than
   * required, at exactly the balance where a real token gate matters.
   */
  it('separates amounts that Number would collapse', () => {
    const required = '9007199254740993';
    const held = '9007199254740992';
    expect(Number(held) === Number(required)).toBe(true);
    expect(meetsGate(held, required)).toBe(false);
  });

  it('accepts bigint as well as string', () => {
    expect(meetsGate(10n, 5n)).toBe(true);
    expect(meetsGate(5n, 10n)).toBe(false);
  });
});

describe('gateShortfall', () => {
  it('is zero when the requirement is met', () => {
    expect(gateShortfall('1000', '1000')).toBe(0n);
    expect(gateShortfall('2000', '1000')).toBe(0n);
  });

  it('is the difference when short', () => {
    expect(gateShortfall('400', '1000')).toBe(600n);
  });
});

describe('describeGate', () => {
  it('returns null for an ungated event, not an empty string', () => {
    // A caller that renders `describeGate(...) ?? ''` next to a padlock would
    // otherwise show a lock with no label.
    expect(describeGate(gate({ tokenGated: false }))).toBeNull();
  });

  it('formats the structured requirement', () => {
    expect(describeGate(gate())).toBe('Hold 10 BONK to join');
  });

  it('trims trailing zeros rather than printing 10.00000', () => {
    expect(describeGate(gate({ minAmount: '150000' }))).toBe('Hold 1.5 BONK to join');
  });

  it('defaults native SOL to 9 decimals and the SOL ticker', () => {
    const native = gate({
      mint: NATIVE_MINT,
      minAmount: '1500000000',
      decimals: null,
      symbol: null,
    });
    expect(describeGate(native)).toBe('Hold 1.5 SOL to join');
  });

  it('falls back to the host free text when there is no structured gate', () => {
    const legacy = gate({
      mint: null,
      minAmount: null,
      requirement: 'Any Mad Lad',
    });
    expect(describeGate(legacy)).toBe('Any Mad Lad');
  });

  it('falls back again when the free text is blank', () => {
    const bare = gate({ mint: null, minAmount: null, requirement: '   ' });
    expect(describeGate(bare)).toBe('Token holders only');
  });
});

describe('buildGate', () => {
  it('converts whole units to base units', () => {
    const built = buildGate({ mint: BONK, amount: '1.5', decimals: 5, symbol: 'BONK' });
    expect(built.gate_min_amount).toBe('150000');
    expect(built.token_gated).toBe(true);
  });

  it('accepts the native sentinel', () => {
    const built = buildGate({ mint: NATIVE_MINT, amount: '1', decimals: 9, symbol: 'SOL' });
    expect(built.gate_mint).toBe(NATIVE_MINT);
    expect(built.gate_min_amount).toBe('1000000000');
  });

  it('refuses a gate of zero', () => {
    // Would render a padlock and admit everyone - the exact defect 0013 removes.
    expect(() => buildGate({ mint: BONK, amount: '0', decimals: 5, symbol: 'BONK' })).toThrow(
      /would let everyone in/,
    );
  });

  it('refuses an address that is not base58', () => {
    expect(() => buildGate({ mint: 'not-an-address', amount: '1', decimals: 5, symbol: 'X' })).toThrow(
      /mint address/,
    );
  });

  it('refuses more precision than the token has', () => {
    expect(() => buildGate({ mint: BONK, amount: '1.123456', decimals: 5, symbol: 'BONK' })).toThrow(
      /precision/,
    );
  });

  it('refuses an amount that is not a plain decimal', () => {
    expect(() => buildGate({ mint: BONK, amount: '1,5', decimals: 5, symbol: 'BONK' })).toThrow();
  });

  it('refuses a missing symbol', () => {
    expect(() => buildGate({ mint: BONK, amount: '1', decimals: 5, symbol: '  ' })).toThrow(
      /symbol/,
    );
  });

  it('refuses fractional decimals', () => {
    expect(() => buildGate({ mint: BONK, amount: '1', decimals: 2.5, symbol: 'X' })).toThrow(
      /whole number/,
    );
  });
});
