/**
 * Solana primitives for the Edge Functions, with no npm dependency in the hot
 * path.
 *
 * Base58 and Ed25519 are the only two things these functions need from the
 * Solana ecosystem, and pulling `@solana/web3.js` into a Deno function to get
 * them costs a multi-megabyte cold start for forty lines of arithmetic.
 */

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const BASE58_INDEX: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_INDEX[BASE58_ALPHABET[i]] = i;
}

/**
 * Decode a base58 string to bytes.
 *
 * Throws on any character outside the alphabet rather than skipping it. Solana
 * addresses are routinely copied by hand, and `0`/`O` and `I`/`l` are exactly
 * the pairs base58 omits — silently dropping a bad character would produce a
 * different, valid-looking key.
 */
export function base58Decode(input: string): Uint8Array {
  if (!input) throw new Error('Empty base58 string.');

  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_INDEX[char];
    if (value === undefined) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Leading '1's are leading zero bytes, which the arithmetic above drops.
  for (let i = 0; i < input.length && input[i] === '1'; i++) bytes.push(0);

  return new Uint8Array(bytes.reverse());
}

/** True when the string decodes to a 32-byte Ed25519 public key. */
export function isValidSolanaAddress(address: string): boolean {
  try {
    return base58Decode(address).length === 32;
  } catch {
    return false;
  }
}

/** Decode standard base64 (what every wallet returns for a signature). */
export function base64Decode(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Accept a signature in whichever encoding the wallet handed the client.
 *
 * Mobile Wallet Adapter returns raw bytes the app base64-encodes; browser
 * wallets return a `Uint8Array` the client usually base58-encodes to match the
 * address format it is already handling. Both reach here as strings and both
 * have to work, because refusing one of them means half the platforms cannot
 * link a wallet.
 */
export function decodeSignature(signature: string): Uint8Array {
  // 64 raw bytes is 88 base64 characters and 86-88 base58 ones, so length
  // cannot disambiguate. Try base58 first: its alphabet is strictly smaller,
  // so a string that decodes as base58 is almost never accidental base64.
  try {
    const bytes = base58Decode(signature);
    if (bytes.length === 64) return bytes;
  } catch {
    // Not base58 — fall through.
  }

  const bytes = base64Decode(signature);
  if (bytes.length !== 64) {
    throw new Error('A signature must be 64 bytes.');
  }
  return bytes;
}

/**
 * Verify an Ed25519 signature.
 *
 * Deno's Web Crypto implements Ed25519, so the common path needs nothing
 * installed. The `@noble/curves` fallback exists because that support is a
 * runtime capability rather than a language guarantee — if the function is
 * ever deployed on a runtime without it, a wallet-linking feature that fails
 * closed with "unsupported algorithm" is a worse outcome than one extra
 * import.
 */
export async function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      signature as BufferSource,
      message as BufferSource,
    );
  } catch {
    const { ed25519 } = await import('npm:@noble/curves@1.9.7/ed25519');
    try {
      return ed25519.verify(signature, message, publicKey);
    } catch {
      // A malformed key or signature is a failed verification, not a crash.
      return false;
    }
  }
}
