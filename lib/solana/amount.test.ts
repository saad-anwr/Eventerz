import { describe, expect, it } from 'vitest';

import {
  FEE_HEADROOM_LAMPORTS,
  formatTokenAmount,
  fromBaseUnits,
  lamportsToSol,
  maxSendableLamports,
  solToLamports,
  toBaseUnits,
} from './amount';

/**
 * These are the tests that matter most in the repository.
 *
 * Every other bug is a wrong pixel or a wrong sentence. A bug here sends the
 * wrong amount of someone's money, and it does so silently - floating point does
 * not throw.
 */
describe('toBaseUnits', () => {
  it('converts whole and fractional SOL exactly', () => {
    expect(solToLamports('1')).toBe(1_000_000_000n);
    expect(solToLamports('0.5')).toBe(500_000_000n);
    expect(solToLamports('0.000000001')).toBe(1n);
  });

  it('is exact where floating point is not', () => {
    // `0.1 * 1e9 + 0.2 * 1e9 === 300000000.00000006` as JS numbers.
    expect(solToLamports('0.1') + solToLamports('0.2')).toBe(solToLamports('0.3'));
    // `1e9 * 0.07` is 70000000.00000001.
    expect(solToLamports('0.07')).toBe(70_000_000n);
  });

  it('survives amounts beyond Number.MAX_SAFE_INTEGER', () => {
    // ~18.4 million SOL in lamports is well past 2^53, where a JS number starts
    // losing whole lamports.
    const huge = solToLamports('18446744.073709551');
    expect(huge).toBe(18_446_744_073_709_551n);
    expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('pads a short fraction rather than misreading it', () => {
    expect(solToLamports('0.1')).toBe(100_000_000n);
    expect(solToLamports('1.')).toBe(1_000_000_000n);
    expect(solToLamports('.5')).toBe(500_000_000n);
  });

  it('refuses more precision than the token has', () => {
    // Rounding here would send a different amount than the one displayed.
    expect(() => solToLamports('0.0000000001')).toThrow(/precision/i);
  });

  it('refuses anything that is not a plain decimal', () => {
    for (const bad of ['1,5', '1 SOL', 'abc', '-1', '1e9', '', '.', '1.2.3']) {
      expect(() => solToLamports(bad), bad).toThrow();
    }
  });

  it('works for other decimal scales', () => {
    expect(toBaseUnits('1.5', 6)).toBe(1_500_000n);
    expect(toBaseUnits('7', 0)).toBe(7n);
  });
});

describe('fromBaseUnits', () => {
  it('trims trailing zeros', () => {
    expect(lamportsToSol(400_000_000n)).toBe('0.4');
    expect(lamportsToSol(1_000_000_000n)).toBe('1');
  });

  it('keeps significant trailing digits', () => {
    expect(lamportsToSol(1n)).toBe('0.000000001');
    expect(lamportsToSol(1_000_000_001n)).toBe('1.000000001');
  });

  it('accepts the string PostgREST returns for a bigint', () => {
    expect(fromBaseUnits('2500000000', 9)).toBe('2.5');
  });

  it('round-trips', () => {
    for (const value of ['0.4', '1', '12.345678901', '0.000000001', '9999999']) {
      expect(lamportsToSol(solToLamports(value))).toBe(value);
    }
  });

  it('handles zero', () => {
    expect(lamportsToSol(0n)).toBe('0');
  });
});

describe('formatTokenAmount', () => {
  it('renders the amount with its ticker', () => {
    expect(formatTokenAmount(400_000_000n, 9, 'SOL')).toBe('0.4 SOL');
    expect(formatTokenAmount('1500000', 6, 'USDC')).toBe('1.5 USDC');
  });
});

describe('maxSendableLamports', () => {
  it('withholds fee headroom', () => {
    expect(maxSendableLamports(1_000_000_000n)).toBe(
      1_000_000_000n - FEE_HEADROOM_LAMPORTS,
    );
  });

  it('never goes negative on a dust balance', () => {
    // Offering a "max" larger than the balance produces a transaction that
    // always fails, which reads as the app being broken.
    expect(maxSendableLamports(0n)).toBe(0n);
    expect(maxSendableLamports(5_000n)).toBe(0n);
    expect(maxSendableLamports(FEE_HEADROOM_LAMPORTS)).toBe(0n);
  });
});
