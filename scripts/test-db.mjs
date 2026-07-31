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
 * It also does not require `psql` on your PATH. The normal way to have a local
 * Supabase is `supabase start`, which runs Postgres in a container that already
 * contains psql - so demanding a second, host-side copy of the client is asking
 * for an install nobody needs. If psql is on the PATH we use it; otherwise we run
 * the one inside the container. Both paths execute the identical file.
 *
 * psql specifically, and not a generic client: the suite opens with `\set
 * ON_ERROR_STOP on` and uses `\echo`. Those are psql meta-commands, parsed by the
 * client rather than the server, so a driver that only speaks SQL silently skips
 * them - and the suite would then report success after a failed assertion.
 *
 * The suite itself is `supabase/tests/guest_flow_test.sql`. It runs in one
 * transaction and rolls back, so it is safe against a database you are also
 * using by hand - though `supabase db reset` first is what makes a run
 * reproducible.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suite = join(root, 'supabase', 'tests', 'guest_flow_test.sql');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * The local stack's default. Supabase pins this port and password for every
 * `supabase start`, so hard-coding it is the documented behaviour rather than a
 * guess - and `DATABASE_URL` overrides it for anyone running elsewhere.
 */
const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const url = process.env.DATABASE_URL || LOCAL_URL;

if (!existsSync(suite)) {
  console.error(red('Suite not found:'), suite);
  process.exit(1);
}

/** Is this executable callable? Distinguishes "missing" from "present but angry". */
function have(bin) {
  const probe = spawnSync(bin, ['--version'], { stdio: 'ignore' });
  return !(probe.error && probe.error.code === 'ENOENT');
}

/**
 * The Supabase database container, if one is running.
 *
 * Named `supabase_db_<project_id>`, where project_id comes from config.toml - so
 * we match on the prefix rather than assuming this project's name, which also
 * means a developer with two Supabase projects gets told about the ambiguity
 * instead of silently testing against the wrong one.
 */
function supabaseContainer(engine) {
  const ps = spawnSync(
    engine,
    ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  if (ps.error || ps.status !== 0) return { names: [] };
  const names = (ps.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { names };
}

const hasPsql = have('psql');
// The Supabase CLI runs on either engine, so this should too - they are
// command-line compatible for `ps` and `exec`.
const engine = ['docker', 'podman'].find(have);

let result;
let ranVia;

if (hasPsql) {
  ranVia = `psql -> ${url}`;
  result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', suite], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
} else if (engine) {
  const { names } = supabaseContainer(engine);

  if (names.length === 0) {
    console.error(red('\nNo Supabase database container is running.'));
    console.error(`${engine} is installed, so the stack just needs starting:\n`);
    console.error(dim('  npx supabase start'));
    console.error(dim('  npx supabase db reset      # apply every migration\n'));
    process.exit(1);
  }

  if (names.length > 1) {
    console.error(red('\nMore than one Supabase database container is running:'));
    for (const n of names) console.error(dim(`  ${n}`));
    console.error(
      '\nStop the ones you are not testing, or point DATABASE_URL at the right port.\n',
    );
    process.exit(1);
  }

  const container = names[0];
  ranVia = `${engine} exec ${container} psql`;
  console.log(dim(`Using the psql inside ${container} (none on PATH).\n`));

  // -f cannot be used here: the file lives on the host, not in the container.
  // Piping it to stdin is equivalent - psql still parses the \set and \echo
  // meta-commands, which is the whole reason this has to be psql.
  result = spawnSync(
    engine,
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: readFileSync(suite), stdio: ['pipe', 'inherit', 'inherit'] },
  );
} else {
  // Neither route exists. Say exactly what is missing rather than naming one
  // tool and leaving the developer to discover the other is absent too.
  console.error(red('\nCannot run the suite: no Postgres client available.'));
  console.error('This machine has neither of the two things that could run it:\n');
  console.error(`  ${red('✗')} ${bold('docker')} (or podman) - needed by ${dim('supabase start')}, which is how you get a local database`);
  console.error(`  ${red('✗')} ${bold('psql')}             - the PostgreSQL client, if you would rather point at a database yourself\n`);
  console.error(bold('The shorter path is a container engine:'));
  console.error(dim('  1. Install Docker Desktop (or Podman) and start it'));
  console.error(dim('  2. npm run db:start'));
  console.error(dim('  3. npm run db:reset'));
  console.error(dim('  4. npm run test:db\n'));
  console.error(
    `That also gets you psql for free - step 2 runs a container that contains one,\nand this script will find and use it.\n`,
  );
  console.error(
    dim('Already have a database elsewhere? Set DATABASE_URL and install the psql client.\n'),
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(red('\nThe guest-flow suite failed.'));
  console.error(
    'If this is a connection error rather than an assertion, start the stack first:',
  );
  console.error(dim('\n  npx supabase start\n  npx supabase db reset\n'));
  console.error(dim(`Ran via: ${ranVia}`));
  process.exit(result.status ?? 1);
}

console.log(green('\n✓ guest-flow suite passed'));
console.log(dim(`  via ${ranVia}`));
