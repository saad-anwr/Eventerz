/**
 * Provision the Bubblegum Merkle tree that compressed tickets are minted onto.
 *
 * This replaces the Anchor program as the on-chain half of Eventerz. Nothing
 * here deploys code: Metaplex's Bubblegum program is already live on mainnet,
 * and this only allocates a tree account that our mints write leaves into. That
 * is why there is no Rust toolchain requirement and no upgrade authority to
 * secure - two problems that simply stop existing with this approach.
 *
 * It is still an on-chain account and it still costs real SOL, once. See the
 * quote this prints before it does anything.
 *
 *   node scripts/create-tree.mjs --keypair ./tree-authority.json            # devnet, the default
 *   node scripts/create-tree.mjs --keypair ./tree-authority.json --mainnet --yes
 *
 * Run it against devnet first. The output is the same shape, the mistakes are
 * free, and a tree cannot be resized after creation - if the depth is wrong the
 * only fix is a second tree and a migration.
 */

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

/* ------------------------------------------------------------------ args - */

function flag(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const keypairPath = flag('keypair');
const mainnet = flag('mainnet', false) === true;
const confirmed = flag('yes', false) === true;

/*
 * Depth 20 by default, not the 14 the old README suggested.
 *
 * A tree's rent is dominated by `maxBufferSize`, not by depth - the changelog is
 * `buffer * (32 + 32*depth + 8)` bytes and the buffer term is what costs. Live
 * mainnet quotes: depth 14 is 0.2222 SOL for 16,384 assets, depth 20 is 0.3091
 * SOL for 1,048,576. Paying 0.09 SOL more for 64x the capacity is not a close
 * call, and the capacity is fixed forever at creation.
 */
const maxDepth = Number(flag('depth', 20));
const maxBufferSize = Number(flag('buffer', 64));

/*
 * Canopy 0 by default.
 *
 * The canopy caches upper proof nodes on-chain so transfers carry a shorter
 * proof. It is the single most expensive knob - canopy 10 on a depth-14 tree
 * takes the rent from 0.22 to 0.68 SOL - and Eventerz tickets are largely
 * soulbound (`tickets.soulbound`), so the transfer path that a canopy makes
 * cheaper is the path most of them never take. Raise it if tickets become
 * freely tradable on marketplaces.
 */
const canopyDepth = Number(flag('canopy', 0));

if (!keypairPath || keypairPath === true) {
  console.error('Missing --keypair <path to the tree authority json>.\n');
  console.error('Create one with:');
  console.error('  solana-keygen new --outfile tree-authority.json --no-bip39-passphrase');
  exit(1);
}

const cluster = mainnet ? 'mainnet-beta' : 'devnet';

/* ------------------------------------------------------------------- rpc - */

/**
 * Prefer the project's Helius endpoint on mainnet. The public RPC rate-limits
 * hard enough that a confirmation poll can fail after the money is already
 * spent, which is the worst possible moment to lose the transaction.
 */
function rpcUrl() {
  if (!mainnet) return 'https://api.devnet.solana.com';
  try {
    const env = readFileSync(new URL('../../Eventerz dApp/.env', import.meta.url), 'utf8');
    const found = env.match(/^EXPO_PUBLIC_HELIUS_RPC_URL=(.+)$/m);
    if (found) return found[1].trim();
  } catch {
    /* fall through to the public endpoint */
  }
  return 'https://api.mainnet-beta.solana.com';
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** SPL account-compression layout, so the quote is exact rather than a guess. */
function treeAccountSize(depth, buffer, canopy) {
  const HEADER = 56;
  const changeLog = 32 + 32 * depth + 4 + 4;
  const rightMostPath = 32 * depth + 32 + 4 + 4;
  const tree = 8 + 8 + 8 + buffer * changeLog + rightMostPath;
  const canopyBytes = canopy > 0 ? (2 ** (canopy + 1) - 2) * 32 : 0;
  return HEADER + tree + canopyBytes;
}

/* ------------------------------------------------------------------ main - */

let umiPkg, bubblegumPkg, defaultsPkg;
try {
  umiPkg = await import('@metaplex-foundation/umi');
  bubblegumPkg = await import('@metaplex-foundation/mpl-bubblegum');
  defaultsPkg = await import('@metaplex-foundation/umi-bundle-defaults');
} catch {
  console.error('Missing the Metaplex packages. Install them as dev dependencies:\n');
  console.error('  npm i -D @metaplex-foundation/mpl-bubblegum@4.2.1 \\');
  console.error('           @metaplex-foundation/umi@0.9.2 \\');
  console.error('           @metaplex-foundation/umi-bundle-defaults@0.9.2\n');
  console.error('They are dev-only on purpose: no app code imports them, so they');
  console.error('never reach the browser bundle. `mint-cnft` pulls its own copies');
  console.error('from npm: specifiers inside Deno.');
  exit(1);
}

const { generateSigner, keypairIdentity } = umiPkg;
const { createTree, mplBubblegum } = bubblegumPkg;
const { createUmi } = defaultsPkg;

const size = treeAccountSize(maxDepth, maxBufferSize, canopyDepth);
const lamports = await rpc('getMinimumBalanceForRentExemption', [size]);
const sol = lamports / 1e9;

const umi = createUmi(rpcUrl()).use(mplBubblegum());

let secretBytes;
try {
  secretBytes = new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8')));
} catch (error) {
  console.error(`Could not read ${keypairPath}: ${error.message}`);
  exit(1);
}
const authority = umi.eddsa.createKeypairFromSecretKey(secretBytes);
umi.use(keypairIdentity(authority));

const balanceLamports = await rpc('getBalance', [authority.publicKey.toString()]);
const balance = balanceLamports / 1e9;

console.log('');
console.log('  Cluster        ', cluster);
console.log('  Tree authority ', authority.publicKey.toString());
console.log('  Balance        ', `${balance.toFixed(4)} SOL`);
console.log('');
console.log('  maxDepth       ', maxDepth, `(capacity ${(2 ** maxDepth).toLocaleString()})`);
console.log('  maxBufferSize  ', maxBufferSize);
console.log('  canopyDepth    ', canopyDepth);
console.log('  Account size   ', `${size.toLocaleString()} bytes`);
console.log('  One-time rent  ', `${sol.toFixed(4)} SOL`);
console.log('');

if (balance < sol + 0.01) {
  console.error(`Not enough SOL. Need about ${(sol + 0.01).toFixed(4)} including fees, have ${balance.toFixed(4)}.`);
  if (!mainnet) {
    console.error(`\n  solana airdrop 2 ${authority.publicKey.toString()} --url devnet`);
  }
  exit(1);
}

if (mainnet && !confirmed) {
  console.error('This spends real SOL and cannot be undone. Re-run with --yes to proceed.');
  exit(1);
}

console.log(`Creating the tree on ${cluster}...`);

const merkleTree = generateSigner(umi);
const builder = await createTree(umi, {
  merkleTree,
  maxDepth,
  maxBufferSize,
  canopyDepth,
});
await builder.sendAndConfirm(umi);

const address = merkleTree.publicKey.toString();

console.log('');
console.log('  Tree created:', address);
console.log('');
console.log('Set the function secrets, then redeploy - secrets are read at boot:');
console.log('');
console.log(`  npx supabase secrets set --project-ref zfijqnvzvnrchaemjfst \\`);
console.log(`    MERKLE_TREE_ADDRESS=${address} \\`);
console.log(`    TREE_AUTHORITY_SECRET=<base58 of ${keypairPath}> \\`);
console.log(`    SITE_URL=https://www.eventerz.xyz`);
console.log('');
console.log('  npx supabase functions deploy mint-cnft --project-ref zfijqnvzvnrchaemjfst --no-verify-jwt');
console.log('');
console.log('The authority secret in base58 (this key can mint Eventerz tickets - treat it like the service_role key):');
console.log(`  node -e "import('bs58').then(b=>console.log(b.default.encode(Uint8Array.from(require('./${keypairPath}')))))"`);
console.log('');
