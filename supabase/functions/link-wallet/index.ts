/**
 * link-wallet - prove ownership of a Solana address, then bind it to a profile.
 *
 *   POST /functions/v1/link-wallet
 *   Authorization: Bearer <the user's Supabase JWT>
 *   { "walletAddress": "...", "message": "...", "signature": "..." }
 *
 * The client obtains `message` from `issue_wallet_link_nonce()` (migration
 * 0011), has the wallet sign that exact text, and posts all three back.
 *
 * What this checks, in order - each one is load-bearing:
 *
 *   1. **The caller is signed in**, from their JWT rather than the body. See
 *      `requireUser`.
 *   2. **The signature verifies** against the claimed address. This is the
 *      whole point: it is the step `link_wallet` (0001) never did.
 *   3. **The nonce came out of the message we issued**, and the database
 *      confirms it was issued to *this* profile for *this* address, then
 *      consumes it. Verifying a signature over an attacker-chosen message
 *      proves they can sign - it does not prove they were answering our
 *      challenge, and a signature harvested from any other Solana dapp would
 *      otherwise sail straight through.
 *
 * Failures are deliberately vague to the client and specific in the logs. The
 * difference between "no such nonce" and "signature did not verify" is useful
 * to an attacker probing the endpoint and useless to a user, who can only ever
 * do one thing about it: try again.
 */

import {
  decodeSignature,
  isValidSolanaAddress,
  base58Decode,
  verifyEd25519,
} from '../_shared/solana.ts';
import { json, logError, preflight, requireUser, serviceClient, rateLimit } from '../_shared/http.ts';

/** UUID, as embedded in the challenge text by `issue_wallet_link_nonce`. */
const NONCE_PATTERN =
  /Nonce:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Use POST.' }, 405);
  }

  const user = await requireUser(request);
  if (!user) {
    return json(request, { error: 'Sign in first.' }, 401);
  }

  /*
   * Signature verification is CPU work, and a wallet-claim attempt that fails is
   * either a bug or somebody trying addresses. Five a minute is far above any
   * genuine use - linking a wallet is a once-per-account action.
   *
   * Keyed on the profile id, not the address: a caller can open a new
   * connection but cannot become a different account.
   */
  const limited = await rateLimit(request, 'link-wallet', user.id, 5, 60);
  if (limited) return limited;

  let body: { walletAddress?: string; message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Expected a JSON body.' }, 400);
  }

  const walletAddress = (body.walletAddress ?? '').trim();
  const message = body.message ?? '';
  const signature = (body.signature ?? '').trim();

  if (!walletAddress || !message || !signature) {
    return json(
      request,
      { error: 'walletAddress, message and signature are all required.' },
      400,
    );
  }

  if (!isValidSolanaAddress(walletAddress)) {
    return json(request, { error: 'That is not a Solana address.' }, 400);
  }

  /*
   * The address has to appear in the text the user actually approved. Without
   * this, a challenge issued for wallet A could be answered with a signature
   * from wallet A and then submitted as a claim on wallet B - the signature
   * would verify against B's key only if B signed it, so the attack needs both
   * keys and is not a hole today. It becomes one the moment the message format
   * changes and the address stops being implied. Checking it costs nothing.
   */
  if (!message.includes(walletAddress)) {
    return json(request, { error: 'That signature is not for this wallet.' }, 400);
  }

  const nonceMatch = message.match(NONCE_PATTERN);
  if (!nonceMatch) {
    return json(request, { error: 'That verification message is not one of ours.' }, 400);
  }
  const nonce = nonceMatch[1];

  let verified = false;
  try {
    verified = await verifyEd25519(
      new TextEncoder().encode(message),
      decodeSignature(signature),
      base58Decode(walletAddress),
    );
  } catch (error) {
    logError('[link-wallet] malformed input', error);
    return json(request, { error: 'That signature could not be read.' }, 400);
  }

  if (!verified) {
    console.warn('[link-wallet] signature rejected', {
      profile: user.id,
      wallet: walletAddress,
    });
    return json(
      request,
      { error: 'That signature does not match the wallet.' },
      401,
    );
  }

  /*
   * `link_wallet_verified` re-checks that the nonce was issued to this profile
   * for this address, and consumes it. Both facts live in the database, so the
   * check belongs there - this function proving the signature and the database
   * proving the challenge is what makes the pair non-replayable.
   */
  const { data, error } = await serviceClient().rpc('link_wallet_verified', {
    p_profile_id: user.id,
    p_wallet_address: walletAddress,
    p_nonce: nonce,
  });

  if (error) {
    logError('[link-wallet] link failed', error);
    // These messages are written for the user by the SQL function and are safe
    // to pass through: "already linked to another account", "expired".
    return json(request, { error: error.message }, 400);
  }

  return json(request, { profile: data });
});
