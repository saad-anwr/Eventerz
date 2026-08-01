/**
 * Wallet holdings: SOL plus the SPL tokens an address actually owns.
 *
 * The web half of the same feature the app has. It was built for mobile only,
 * which made "see what a friend holds" a thing the product did on a phone and
 * not in a browser - the sort of split that reads as a broken page rather than
 * a missing feature, because the wallet address is right there next to nothing.
 *
 * # Two paths, on purpose
 *
 * Plain `getTokenAccountsByOwner` works on any RPC and returns mint, amount and
 * decimals - enough to be correct, but a list of base58 mints is not something
 * anyone can read. Helius DAS `searchAssets` returns the same holdings *with*
 * symbol, name and image in one call.
 *
 * So: DAS when the configured RPC is Helius, the standard call otherwise. The
 * fallback is never worse than showing nothing, and a wallet with no tokens is
 * a normal answer rather than an error.
 *
 * # Why amounts are strings
 *
 * Raw token amounts are u64. A token with 9 decimals passes
 * `Number.MAX_SAFE_INTEGER` at ~9M units, so the raw value is kept as a string
 * and only the display value is a number - the same rule the payment path
 * follows.
 *
 * # Why this is not a privacy decision
 *
 * Nothing here is privileged. A wallet address is on-chain and its balances are
 * readable by any block explorer, so this reads exactly what anyone could read
 * anyway. The product's privacy boundary is the *address* - who gets to see
 * which wallet belongs to whom - and that boundary is unchanged. Once an
 * address is on screen, hiding its balance would be theatre.
 */

import { rpcEndpoint } from './cluster';

export interface TokenHolding {
  mint: string;
  /** Raw base units, as a string - see the note above. */
  amount: string;
  decimals: number;
  /** Human-readable amount, safe for display only. */
  uiAmount: number;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
  /** USD value when the RPC can price it. Null on the plain-RPC path. */
  usdValue: number | null;
}

export interface WalletHoldings {
  solBalance: number;
  /** Null when no price source was available - not zero. */
  solUsdValue: number | null;
  tokens: TokenHolding[];
}

const LAMPORTS_PER_SOL = 1_000_000_000;

const isHelius = (): boolean =>
  /helius/i.test(process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? '');

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(rpcEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'eventerz', method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} failed (${response.status})`);

  const body = (await response.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

/* ------------------------------------------------------------------ helius -- */

interface DasAsset {
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    price_info?: { total_price?: number };
  };
}

/**
 * Fungible holdings with metadata, in one call.
 *
 * `tokenType: 'fungible'` deliberately excludes NFTs: this powers a balance
 * list, and folding a hundred collectibles into it would bury the tokens.
 */
async function heliusHoldings(owner: string): Promise<TokenHolding[]> {
  const result = await rpc<{ items?: DasAsset[] }>('searchAssets', {
    ownerAddress: owner,
    tokenType: 'fungible',
    displayOptions: { showNativeBalance: false },
    limit: 100,
    page: 1,
  });

  return (result.items ?? [])
    .map((asset): TokenHolding | null => {
      const info = asset.token_info;
      if (!info?.balance) return null;

      const decimals = info.decimals ?? 0;
      return {
        mint: asset.id,
        amount: String(info.balance),
        decimals,
        uiAmount: info.balance / 10 ** decimals,
        symbol: info.symbol ?? asset.content?.metadata?.symbol ?? null,
        name: asset.content?.metadata?.name ?? null,
        imageUrl: asset.content?.links?.image ?? null,
        usdValue: info.price_info?.total_price ?? null,
      };
    })
    .filter((t): t is TokenHolding => t !== null && t.uiAmount > 0);
}

/* ------------------------------------------------------------- plain rpc --- */

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number | null;
          };
        };
      };
    };
  };
}

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

async function standardHoldings(owner: string): Promise<TokenHolding[]> {
  // Both token programs: a wallet can hold either, and querying only the
  // original silently hides Token-2022 balances.
  const perProgram = await Promise.all(
    [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map(async (programId) => {
      try {
        const res = await rpc<{ value?: ParsedTokenAccount[] }>(
          'getTokenAccountsByOwner',
          [owner, { programId }, { encoding: 'jsonParsed' }],
        );
        return res.value ?? [];
      } catch {
        return [];
      }
    }),
  );

  return perProgram
    .flat()
    .map(({ account }) => {
      const { mint, tokenAmount } = account.data.parsed.info;
      return {
        mint,
        amount: tokenAmount.amount,
        decimals: tokenAmount.decimals,
        uiAmount: tokenAmount.uiAmount ?? 0,
        // No metadata on this path. Null rather than a guessed symbol - the UI
        // shows a shortened mint, which is at least true.
        symbol: null,
        name: null,
        imageUrl: null,
        usdValue: null,
      };
    })
    .filter((t) => t.uiAmount > 0)
    .sort((a, b) => b.uiAmount - a.uiAmount);
}

/* --------------------------------------------------------------- public ---- */

/** SOL price in USD, or null. Shares the fee module's cache and sources. */
async function usdPerSolOrNull(): Promise<number | null> {
  try {
    const { quoteFee } = await import('./fees');
    // Any kind works - the quote carries the rate, which is what is wanted.
    return (await quoteFee('rsvp')).usdPerSol;
  } catch {
    return null;
  }
}

/**
 * Everything an address holds.
 *
 * Works for any wallet, not just the signed-in one - that is what makes a
 * friend's or an attendee's holdings viewable.
 */
export async function getWalletHoldings(owner: string): Promise<WalletHoldings> {
  const [lamports, tokens, usdPerSol] = await Promise.all([
    rpc<number | { value?: number }>('getBalance', [owner]).catch(() => 0),
    (isHelius() ? heliusHoldings(owner) : standardHoldings(owner)).catch(
      () => [] as TokenHolding[],
    ),
    /*
     * DAS prices SPL tokens but not native SOL, so without this the largest
     * holding on most profiles is the one line with no dollar value beside it.
     */
    usdPerSolOrNull(),
  ]);

  const solBalance =
    (typeof lamports === 'object' && lamports !== null
      ? (lamports.value ?? 0)
      : lamports) / LAMPORTS_PER_SOL;

  return {
    solBalance,
    // Null means "unknown", which the UI must not render as $0.
    solUsdValue: usdPerSol === null ? null : solBalance * usdPerSol,
    tokens: tokens.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
  };
}
