/**
 * mint-cnft - mint a compressed NFT for a ticket or an attendance badge.
 *
 *   POST /functions/v1/mint-cnft
 *   Authorization: Bearer <the user's Supabase JWT>
 *   { "kind": "ticket" | "badge", "id": "<ticket or badge uuid>" }
 *
 * Why this is server-side
 * -----------------------
 * A Bubblegum mint is signed by the **tree authority**, not by the recipient.
 * The guest cannot mint their own ticket, and we would not want them to - the
 * point of the asset is that Eventerz issued it. So the signing key lives here,
 * as a function secret, and never reaches a client.
 *
 * It also keeps `@metaplex-foundation/*` out of both client bundles. The
 * website hand-builds its Anchor instructions specifically to avoid shipping a
 * large SDK to the browser (see `Eventerz Program/README.md`), and putting
 * umi + Bubblegum in the Next.js bundle would undo that for a call that only
 * ever runs once per ticket.
 *
 * What it refuses to do
 * ---------------------
 * Without `MERKLE_TREE_ADDRESS` and `TREE_AUTHORITY_SECRET` this function
 * returns 503 `not-configured`. It does not fabricate an asset id, and it does
 * not report success. The old `mintTicket()` stub returned
 * `"SIMULATED_CNFT_ASSET_ID"`, which is the failure mode this whole codebase
 * is written against: a UI that says "minted" over a chain that never saw it.
 *
 * Provisioning is in `supabase/functions/mint-cnft/README.md`.
 */

import { json, preflight, requireUser, serviceClient } from '../_shared/http.ts';

import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import {
  mintV1,
  mplBubblegum,
  parseLeafFromMintV1Transaction,
} from 'npm:@metaplex-foundation/mpl-bubblegum@4.2.1';
import {
  keypairIdentity,
  none,
  publicKey,
  type Umi,
} from 'npm:@metaplex-foundation/umi@0.9.2';
import bs58 from 'npm:bs58@5.0.0';

interface TicketRow {
  id: string;
  owner_id: string;
  event_id: string;
  serial: number;
  asset_id: string | null;
  soulbound: boolean;
}

interface BadgeRow {
  id: string;
  profile_id: string;
  event_id: string;
  asset_id: string | null;
}

interface EventRow {
  id: string;
  title: string;
  cover_image: string | null;
  starts_at: string;
}

function rpcUrl(): string {
  const helius = Deno.env.get('HELIUS_RPC_URL');
  if (helius) return helius;
  const cluster = Deno.env.get('SOLANA_CLUSTER') ?? 'mainnet-beta';
  if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  return `https://api.${cluster}.solana.com`;
}

/**
 * The tree authority, from a base58 secret key.
 *
 * Returns null rather than throwing when unset, so the caller can answer
 * "not configured" as a distinct, non-alarming state - which is what it is
 * until someone provisions a tree.
 */
function loadUmi(): Umi | null {
  const secret = Deno.env.get('TREE_AUTHORITY_SECRET');
  const tree = Deno.env.get('MERKLE_TREE_ADDRESS');
  if (!secret || !tree) return null;

  const umi = createUmi(rpcUrl()).use(mplBubblegum());
  const bytes = bs58.decode(secret.trim());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(bytes)));
  return umi;
}

/**
 * Metadata URI.
 *
 * Points at the event page rather than an uploaded JSON file. A real collection
 * wants immutable metadata on Arweave or IPFS; this is deliberately the smaller
 * commitment, because an event page already renders the title, date and banner
 * and is the thing a holder actually wants to open. Swapping this for a pinned
 * JSON uri is a one-line change once there is a pinning account to pay for.
 */
function metadataUri(eventId: string): string {
  const site = Deno.env.get('SITE_URL') ?? 'https://www.eventerz.xyz';
  return `${site}/events/${eventId}`;
}

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Use POST.' }, 405);
  }

  const user = await requireUser(request);
  if (!user) return json(request, { error: 'Sign in first.' }, 401);

  let body: { kind?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Expected a JSON body.' }, 400);
  }

  const kind = (body.kind ?? '').trim();
  const id = (body.id ?? '').trim();
  if (kind !== 'ticket' && kind !== 'badge') {
    return json(request, { error: 'kind must be "ticket" or "badge".' }, 400);
  }
  if (!id) return json(request, { error: 'id is required.' }, 400);

  const umi = loadUmi();
  if (!umi) {
    /*
     * 503 and an explicit reason, so the UI can say "not available yet" rather
     * than "failed". The seat, the ticket row and the badge row are all real
     * without this; the cNFT is a representation of them, and its absence is a
     * missing representation, not a missing entitlement.
     */
    return json(
      request,
      {
        minted: false,
        reason: 'not-configured',
        detail: 'Compressed-NFT minting is not enabled on this deployment yet.',
      },
      503,
    );
  }

  const supabase = serviceClient();

  // Resolve the row, confirm it belongs to the caller, and get the event it is
  // for. The service-role client bypasses RLS, so ownership is checked here
  // explicitly - the same trap `verify-payment` documents.
  let owner: string;
  let eventId: string;
  let name: string;
  let alreadyMinted: string | null;

  if (kind === 'ticket') {
    const { data, error } = await supabase
      .from('tickets')
      .select('id, owner_id, event_id, serial, asset_id, soulbound')
      .eq('id', id)
      .maybeSingle<TicketRow>();
    if (error) {
      console.error('[mint-cnft] ticket lookup failed', error);
      return json(request, { error: 'Could not read that ticket.' }, 500);
    }
    if (!data) return json(request, { error: 'Ticket not found.' }, 404);
    if (data.owner_id !== user.id) {
      return json(request, { error: 'That ticket is not yours.' }, 403);
    }
    owner = data.owner_id;
    eventId = data.event_id;
    alreadyMinted = data.asset_id;
    name = `Ticket #${String(data.serial).padStart(4, '0')}`;
  } else {
    const { data, error } = await supabase
      .from('badges')
      .select('id, profile_id, event_id, asset_id')
      .eq('id', id)
      .maybeSingle<BadgeRow>();
    if (error) {
      console.error('[mint-cnft] badge lookup failed', error);
      return json(request, { error: 'Could not read that badge.' }, 500);
    }
    if (!data) return json(request, { error: 'Badge not found.' }, 404);
    if (data.profile_id !== user.id) {
      return json(request, { error: 'That badge is not yours.' }, 403);
    }
    owner = data.profile_id;
    eventId = data.event_id;
    alreadyMinted = data.asset_id;
    name = 'Proof of Attendance';
  }

  // Idempotent: a retried mint after a lost response must not mint twice.
  if (alreadyMinted) {
    return json(request, { minted: true, assetId: alreadyMinted, alreadyMinted: true });
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, title, cover_image, starts_at')
    .eq('id', eventId)
    .maybeSingle<EventRow>();

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address')
    .eq('id', owner)
    .maybeSingle<{ wallet_address: string | null }>();

  const leafOwner = profile?.wallet_address;
  if (!leafOwner) {
    return json(
      request,
      {
        minted: false,
        reason: 'no-wallet',
        detail: 'Link a wallet to receive this on-chain.',
      },
      403,
    );
  }

  let assetId: string;
  try {
    const { signature } = await mintV1(umi, {
      leafOwner: publicKey(leafOwner),
      merkleTree: publicKey(Deno.env.get('MERKLE_TREE_ADDRESS')!),
      metadata: {
        name: `${event?.title ?? 'Eventerz'} - ${name}`.slice(0, 32),
        uri: metadataUri(eventId),
        sellerFeeBasisPoints: 0,
        collection: none(),
        creators: [
          { address: umi.identity.publicKey, verified: true, share: 100 },
        ],
      },
    }).sendAndConfirm(umi);

    // The asset id is derived from the leaf index, which is only knowable after
    // the transaction lands - it is assigned by the tree, not chosen by us.
    const leaf = await parseLeafFromMintV1Transaction(umi, signature);
    assetId = leaf.id.toString();
  } catch (error) {
    console.error('[mint-cnft] mint failed', error);
    return json(
      request,
      { minted: false, reason: 'mint-failed', detail: 'The mint did not land. Nothing was recorded.' },
      502,
    );
  }

  /*
   * Record only after the mint has landed. The other ordering is tempting
   * because it gives the UI something to show immediately, and it is the same
   * mistake `record_payment` documents: a row saying "on-chain" for an asset
   * that does not exist is a claim a holder will act on.
   */
  const { error: recordError } = await supabase.rpc(
    kind === 'ticket' ? 'record_ticket_mint' : 'record_badge_mint',
    kind === 'ticket'
      ? { p_ticket_id: id, p_asset_id: assetId }
      : { p_badge_id: id, p_asset_id: assetId },
  );

  if (recordError) {
    // The asset exists; only our record of it failed. Return it so the caller
    // can retry the record rather than the mint - `record_*_mint` is idempotent
    // on the asset id precisely for this path.
    console.error('[mint-cnft] record failed', recordError);
    return json(
      request,
      { minted: true, assetId, recorded: false, detail: 'Minted, but the record failed. Retry to file it.' },
      207,
    );
  }

  return json(request, { minted: true, assetId });
});
