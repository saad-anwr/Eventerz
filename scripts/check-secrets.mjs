#!/usr/bin/env node
/**
 * Refuse to commit a credential, or a binary that has one baked into it.
 *
 *   node scripts/check-secrets.mjs            check what is staged (pre-commit)
 *   node scripts/check-secrets.mjs --all      check every tracked file
 *
 * # Why this exists
 *
 * Something on this machine commits and pushes all three repositories on a
 * timer - the `update_DD/MM_HH:MM` commits in every log. Nothing pauses for
 * review, so anything written into a working tree reaches a public repository
 * within minutes. That is how a Helius key pasted into the dApp's `eas.json`
 * ended up public, and it is why `.gitignore` is the only control standing
 * between a file and publication.
 *
 * Nothing has leaked from *this* repository. The guard is here because the
 * exposure that did happen was a process failure, not a repository-specific
 * one, and this repo holds the service-role key's name in its env template.
 *
 * A `.gitignore` entry only helps for paths somebody thought of in advance.
 * This checks the *content* of what is actually about to be committed, so a
 * credential pasted into a file nobody predicted still gets stopped.
 *
 * Exits non-zero on any finding, which aborts the commit.
 *
 * Escape hatch, for the rare true false positive:
 *
 *   ALLOW_SECRETS=1 git commit ...
 *
 * Prefer fixing the file. A suppressed finding is indistinguishable from a leak
 * the next time somebody reads the log.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

if (process.env.ALLOW_SECRETS === '1') {
  console.log(c.yellow('check-secrets: skipped (ALLOW_SECRETS=1)'));
  process.exit(0);
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const all = process.argv.includes('--all');

/* --------------------------------------------------------------------------
 * What never belongs in a commit, by path
 *
 * A compiled bundle is the subtle one: `NEXT_PUBLIC_*` (and the dApp's
 * `EXPO_PUBLIC_*`) values are inlined at build time, so a shipped bundle hands
 * every build-time value to anyone who can `grep` it. The key that leaked was
 * extractable from a committed APK exactly this way.
 * ----------------------------------------------------------------------- */
const FORBIDDEN_PATHS = [
  { re: /\.(apk|aab|ipa)$/i, why: 'compiled app - NEXT_PUBLIC_*/EXPO_PUBLIC_* values are inlined at build time' },
  { re: /\.(jks|keystore|p12|p8|mobileprovision)$/i, why: 'signing material' },
  { re: /(^|\/)\.env($|\.(?!example))/i, why: 'real environment values' },
  { re: /(^|\/)(id_rsa|id_ed25519|.*\.pem)$/i, why: 'private key' },
];

/* --------------------------------------------------------------------------
 * What never belongs in a commit, by content
 * ----------------------------------------------------------------------- */
const RULES = [
  {
    name: 'RPC provider key in a URL',
    // Helius and friends: ?api-key=<something long enough to be real>
    re: /api[-_]?key=[A-Za-z0-9][A-Za-z0-9-]{15,}/gi,
  },
  {
    name: 'JWT literal (Supabase anon or service-role key)',
    re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g,
  },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Stripe secret key', re: /sk_(live|test)_[A-Za-z0-9]{20,}/g },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  {
    name: 'Assigned secret with a literal value',
    // FOO_SECRET = "…" / API_KEY: '…' - long enough that a placeholder is unlikely
    re: /\b[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|SERVICE_ROLE)[A-Z0-9_]*\s*[:=]\s*['"][^'"\s]{16,}['"]/g,
  },
];

/*
 * Files whose whole purpose is to *describe* the shape of a credential.
 * `.env.example` carries empty placeholders; docs quote key names and the word
 * `service_role` (it is a Postgres role, and every RLS migration mentions it).
 */
const DOC_LIKE = /(^|\/)(\.env\.example|.*\.md)$/i;

/** A value that is obviously a stand-in rather than a live credential. */
const PLACEHOLDER =
  /^(<.*>|\.{3}|x{4,}|y{4,}|your[-_ ]|placeholder|example|changeme|redacted|dummy|test|abc123|\$\{|process\.env)/i;

/**
 * Per-line escape hatch: `check-secrets: allow <reason>`, in a comment on the
 * offending line or the one directly above it.
 *
 * `ALLOW_SECRETS=1` was the only way past this scanner, and it switches off
 * every rule for every file in the commit. So a test fixture named `SECRET`
 * would also wave through a real key pasted into a different file in the same
 * commit - the failure mode this whole script exists to prevent. This narrows
 * the exemption to one line and puts it in the diff, where review can see it.
 *
 * The reason is mandatory: `allow` on its own does not match. An unexplained
 * suppression is indistinguishable from a leak the next time somebody reads it.
 *
 * Suppressions are always printed, including on a clean run. A silent exemption
 * is one nobody re-examines.
 */
const ALLOW_PRAGMA = /check-secrets:\s*allow\s+(\S.*?)\s*$/;

const isBinary = (buf) => buf.includes(0);

function filesToCheck() {
  if (all) {
    return git('ls-files', '-z').split('\0').filter(Boolean);
  }
  // Staged adds/copies/modifies/renames only - not deletions.
  return git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
    .split('\0')
    .filter(Boolean);
}

const findings = [];
const suppressed = [];
const files = filesToCheck();

for (const file of files) {
  for (const { re, why } of FORBIDDEN_PATHS) {
    if (re.test(file)) {
      findings.push({ file, line: 0, rule: `forbidden file - ${why}`, snippet: file });
    }
  }

  if (!existsSync(file)) continue;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;

  const buf = readFileSync(file);

  /*
   * Binaries still get scanned, just not line by line. A key compiled into a
   * bundle is plain ASCII inside the file; that is precisely how the leaked
   * key was recoverable from the committed APK.
   */
  if (isBinary(buf)) {
    const text = buf.toString('latin1');
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(text);
      if (m) {
        findings.push({
          file,
          line: 0,
          rule: `${rule.name} (inside a binary)`,
          snippet: redact(m[0]),
        });
      }
    }
    continue;
  }

  if (DOC_LIKE.test(file)) continue;

  const lines = buf.toString('utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    // The pragma may sit on the line itself or on the one above it - a long
    // literal is usually already at the line-length limit without a comment.
    const allow = ALLOW_PRAGMA.exec(text) ?? (i > 0 ? ALLOW_PRAGMA.exec(lines[i - 1]) : null);

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text))) {
        const value = m[0];
        const after = value.split(/[=:]/).slice(1).join('=').replace(/['"]/g, '').trim();
        if (after && PLACEHOLDER.test(after)) continue;
        if (allow) {
          suppressed.push({ file, line: i + 1, rule: rule.name, reason: allow[1] });
          continue;
        }
        findings.push({ file, line: i + 1, rule: rule.name, snippet: redact(value) });
      }
    }
  });
}

/** Keep enough to recognise the value, never enough to use it. */
function redact(s) {
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 10)}…${s.slice(-4)}  ${c.dim(`(${s.length} chars)`)}`;
}

if (suppressed.length > 0) {
  console.error(
    c.yellow(
      `check-secrets: ${suppressed.length} finding${suppressed.length === 1 ? '' : 's'} suppressed by pragma`,
    ),
  );
  for (const s of suppressed) {
    console.error(c.dim(`  - ${s.file}:${s.line}  ${s.rule} - ${s.reason}`));
  }
}

if (findings.length === 0) {
  console.log(
    c.green(`check-secrets: clean`) + c.dim(` (${files.length} file${files.length === 1 ? '' : 's'})`),
  );
  process.exit(0);
}

console.error(c.bold(c.red('\ncheck-secrets: refusing to commit\n')));
for (const f of findings) {
  const at = f.line ? `${f.file}:${f.line}` : f.file;
  console.error(`  ${c.red('✗')} ${at}`);
  console.error(`      ${f.rule}`);
  console.error(`      ${f.snippet}\n`);
}
console.error(
  c.dim(
    'Move the value into a gitignored .env (or a Vercel environment variable) and\n' +
      'reference it by name. If the value has already been committed once, it is\n' +
      'public: rotate it at the source rather than only deleting it.\n\n' +
      'Genuine false positive - a test fixture, a sample payload? Exempt the one\n' +
      'line, with a reason, so the next reader can tell it apart from a real leak:\n' +
      '  // check-secrets: allow fixed test fixture, not a live credential\n\n' +
      'ALLOW_SECRETS=1 git commit ... still exists, but it disables every rule for\n' +
      'every file in the commit. Prefer the pragma.\n',
  ),
);
process.exit(1);
