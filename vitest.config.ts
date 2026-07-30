import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest for the pure logic layer.
 *
 * Scoped to `lib/**` on purpose. What is worth testing here is the code that
 * gets an answer *wrong* rather than merely *ugly*: the RSVP state machine,
 * lamport arithmetic, Anchor instruction encoding, ordinals. React components
 * that arrange those answers on screen are better checked by the typechecker and
 * by opening the app — a snapshot of a Tailwind class list fails on every design
 * tweak and catches nothing.
 *
 * The Postgres half of the guest flow — capacity races, waitlist promotion,
 * approval gating — cannot be tested from here at all, because it lives in
 * SECURITY DEFINER functions and RLS policies. That suite is SQL and runs against
 * a real database: see `supabase/tests/`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
