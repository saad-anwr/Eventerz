/**
 * Ticket pricing - the amount a host charges a guest, and the asset it is in.
 *
 * Not to be confused with `lib/solana/fees.ts`, which is what *Eventerz*
 * charges. Nothing here moves money or touches a wallet: a ticket price is a
 * value stored on the event and displayed to guests, and the two have been
 * worth keeping in separate files since one of them stopped existing for
 * event creation.
 *
 * Kept in step with `Eventerz dApp/src/store/create-event-store.ts`, which
 * holds the identical set and the identical composition rule. Both write the
 * same `price` column - `text`, per `0002_events.sql` - so a divergence here
 * is a price the other product cannot read back.
 */

/**
 * What a host may price a ticket in.
 *
 * SOL for the crypto-native case, USDC for the far more common one: a host who
 * thinks in dollars and does not want the gate price drifting 20% between
 * announcing an event and running it. Tickets are bought weeks ahead, which is
 * exactly the window in which SOL moves enough to matter.
 */
export const PRICE_CURRENCIES = ["SOL", "USDC"] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

/**
 * Keep only what can be part of a decimal amount.
 *
 * Filtering on the way in rather than validating on the way out: someone who
 * types a letter into a price field has made a mistake they can see and fix in
 * the same motion, where an error message under the field arrives a step later
 * and asks them to work out which character offended.
 *
 * The second dot is dropped rather than the input rejected - `1.2.5` is
 * someone reaching for `1.25`, and silently keeping `1.25` is closer to what
 * they meant than refusing the keystroke.
 */
export function sanitizeAmount(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

/**
 * The one place an amount and its unit are joined.
 *
 * An empty or zero amount is `"Free"` rather than `"0 SOL"`. A zero-priced
 * ticket reads as free to a guest while keeping every paid-path behaviour
 * behind it, so the two are collapsed here instead of downstream.
 */
export function formatPrice(amount: string, currency: PriceCurrency): string {
  const trimmed = amount.trim();
  if (!trimmed) return "Free";

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return "Free";

  return `${trimmed} ${currency}`;
}
