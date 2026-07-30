#!/usr/bin/env node
/**
 * Run the SQL guest-flow suite against a local Supabase.
 *
 *   npm run test:db
 *
 * Why a wrapper rather than a bare `psql` line in package.json: the failure this
 * has to explain well is "you have not started Supabase", and that is worth more
 * than four words of shell. A developer who gets `psql: could not connect` has to
 * go and find out what the connection string should have been; a developer who
 * gets the message below already knows.
 *
 * The suite itself is `supabase/tests/guest_flow_test.sql`. It runs in one
 * transaction and rolls back, so it is safe against a database you are also
 * using by hand — though `supabase db reset` first is what makes a run
 * reproducible.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suite = join(root, 'supabase', 'tests', 'guest_flow_test.sql');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * The local stack's default. Supabase pins this port and password for every
 * `supabase start`, so hard-coding it is the documented behaviour rather than a
 * guess — and `DATABASE_URL` overrides it for anyone running elsewhere.
 */
const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const url = process.env.DATABASE_URL || LOCAL_URL;

if (!existsSync(suite)) {
  console.error(red('Suite not found:'), suite);
  process.exit(1);
}

const psql = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', suite], {
  stdio: 'inherit',
  encoding: 'utf8',
});

if (psql.error?.code === 'ENOENT') {
  console.error(red('\n`psql` is not on your PATH.'));
  console.error(
    'Install the PostgreSQL client tools, or run the suite inside the Supabase container:',
  );
  console.error(
    dim(
      '\n  docker exec -i supabase_db_<project> psql -U postgres ' +
        '< supabase/tests/guest_flow_test.sql\n',
    ),
  );
  process.exit(1);
}

if (psql.status !== 0) {
  console.error(red('\nThe guest-flow suite failed.'));
  console.error(
    'If this is a connection error rather than an assertion, start the stack first:',
  );
  console.error(dim('\n  supabase start\n  supabase db reset\n'));
  console.error(`Connecting to: ${url}`);
  process.exit(psql.status ?? 1);
}

console.log(green('\n✓ guest-flow suite passed'));
