# mint-cnft - provisioning

Until a Merkle tree exists and its authority key is set, this function returns
`503 not-configured` and nothing mints. That is the designed state, not a
broken one: tickets, badges, seats and check-ins are all real Postgres records
either way, and the compressed NFT is a *representation* of a badge, not the
badge itself.

This is the same pattern `EVENTERZ_PROGRAM_ID` already uses. Both clients skip
the on-chain step cleanly while it is unset.

---

## What you are provisioning

| Thing | Why | Cost |
| --- | --- | --- |
| A **Merkle tree** | Compressed NFTs are leaves on one. Its size is fixed at creation | Rent, paid once - see below |
| A **tree authority keypair** | Signs every mint. Lives only as a function secret | A little SOL for fees |

**The authority is not the host's wallet and not the guest's.** A Bubblegum mint
is signed by the tree authority, so the guest cannot mint their own ticket -
which is the point. An asset the recipient could mint for themselves proves
nothing about who issued it.

---

## 1. Create the keypair

```bash
solana-keygen new --outfile tree-authority.json --no-bip39-passphrase
solana address -k tree-authority.json          # note this down
solana airdrop 2 $(solana address -k tree-authority.json) --url devnet
```

Keep `tree-authority.json` out of the repo. It is the key that can mint
Eventerz tickets; treat it like the `service_role` key.

## 2. Create the tree

Tree capacity is **fixed at creation** and cannot grow. `maxDepth` decides how
many assets fit - 2^depth - and you pay rent for all of it up front, whether or
not you use it.

| maxDepth | Capacity | Roughly |
| --- | ---: | --- |
| 14 | 16,384 | a good starting tree |
| 20 | 1,048,576 | plan for it, do not start here |

```bash
npm install @metaplex-foundation/mpl-bubblegum @metaplex-foundation/umi-bundle-defaults
```

```ts
// scripts/create-tree.ts - run once, with tsx or ts-node
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createTree, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner, keypairIdentity } from '@metaplex-foundation/umi';
import { readFileSync } from 'node:fs';

const umi = createUmi('https://api.devnet.solana.com').use(mplBubblegum());
const secret = new Uint8Array(JSON.parse(readFileSync('tree-authority.json', 'utf8')));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const merkleTree = generateSigner(umi);
await (await createTree(umi, {
  merkleTree,
  maxDepth: 14,
  maxBufferSize: 64,
})).sendAndConfirm(umi);

console.log('MERKLE_TREE_ADDRESS=', merkleTree.publicKey.toString());
```

## 3. Set the secrets

```bash
cd C:\Eventerz\Eventerz

# The tree address, and the authority secret in base58 (not the JSON array).
supabase secrets set MERKLE_TREE_ADDRESS=<the address printed above>
supabase secrets set TREE_AUTHORITY_SECRET=<base58 secret key>
supabase secrets set SOLANA_CLUSTER=devnet
supabase secrets set SITE_URL=https://www.eventerz.xyz

supabase functions deploy mint-cnft
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

To convert the keypair file to base58:

```bash
node -e "const b=require('bs58');console.log(b.encode(Uint8Array.from(require('./tree-authority.json'))))"
```

Optionally set `NEXT_PUBLIC_MERKLE_TREE_ADDRESS` on Vercel too - the website
reads it only to decide whether to *offer* minting in the UI. It is not the
address anything mints against; that one is the function secret above, so a
public value cannot be swapped for another tree.

---

## 4. Check it

```bash
curl -X POST "$SUPABASE_URL/functions/v1/mint-cnft" \
  -H "Authorization: Bearer <a real user JWT>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"ticket","id":"<a ticket uuid owned by that user>"}'
```

| Response | Meaning |
| --- | --- |
| `{"minted":true,"assetId":"..."}` | Done. Verify it on the explorer |
| `{"minted":false,"reason":"not-configured"}` | A secret is missing |
| `{"minted":false,"reason":"no-wallet"}` | That user has no linked wallet |
| `503` after setting secrets | Redeploy - secrets are read at boot |

The `assetId` should resolve on any DAS-aware explorer. If it does not, the
mint landed but the asset id was derived wrongly, which is a bug in
`parseLeafFromMintV1Transaction` handling - not in the tree.

---

## Notes on the metadata

`metadataUri()` currently points at the event page rather than a pinned JSON
file. That is a deliberate smaller commitment: an event page already renders
the title, date and banner, and it is what a holder actually wants to open.

A collection intended to be traded wants immutable metadata on Arweave or IPFS,
and a **verified collection NFT** so wallets group the tickets together. Both
are a one-line change in `mint-cnft/index.ts` once there is a pinning account
to pay for - `collection: none()` becomes the collection's address, and the
mint gains a `collectionAuthority` signer.

## Untested

`anchor test` and the SQL suite have never run on this machine, and neither has
this function against a real tree - there is no Rust toolchain, no Docker, and
no funded keypair here. The code is written and typechecks; it has not minted
anything. Treat the first run as part of provisioning, not as a formality.
