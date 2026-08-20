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

Use `scripts/create-tree.mjs`, which quotes the cost from the cluster, checks the
payer can cover it, and refuses mainnet without an explicit `--yes`:

```bash
npm i -D @metaplex-foundation/mpl-bubblegum@4.2.1 \
         @metaplex-foundation/umi@0.9.2 \
         @metaplex-foundation/umi-bundle-defaults@0.9.2

node scripts/create-tree.mjs --keypair ./tree-authority.json              # devnet
node scripts/create-tree.mjs --keypair ./tree-authority.json --mainnet --yes
```

### Picking a depth

Live mainnet rent quotes, via `getMinimumBalanceForRentExemption` on the real
account size:

| maxDepth | canopy | Capacity | One-time rent |
| ---: | ---: | ---: | ---: |
| 14 | 0 | 16,384 | 0.2222 SOL |
| 20 | 0 | 1,048,576 | **0.3091 SOL** |
| 14 | 10 | 16,384 | 0.6779 SOL |

An earlier version of this file said to start at depth 14 and treat 20 as
something to grow into. The numbers say otherwise, and they are worth stating
plainly because the choice is permanent: **depth 20 buys 64x the capacity for
0.09 SOL more.** Rent is dominated by `maxBufferSize`, which sets the changelog
size (`buffer * (32 + 32*depth + 8)` bytes); depth only moves the smaller term.
Depth 20 is the default in the script.

The canopy is the expensive knob, not the depth - it caches upper proof nodes
on-chain so transfers carry shorter proofs. Eventerz tickets are largely
soulbound (`tickets.soulbound`), so the path a canopy optimises is the one most
tickets never take. Start at 0 and raise it only if tickets become freely
tradable on marketplaces.

Per mint there is no rent at all, only the transaction fee: 0.000005 SOL, so
10,000 tickets cost about 0.05 SOL to issue.

## 3. Set the secrets

```bash
cd C:\Solana\Eventerz\Eventerz

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
