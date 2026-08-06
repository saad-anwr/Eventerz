#!/usr/bin/env node
/**
 * Rasterise public/og.svg -> public/og.png.
 *
 * WHY THIS EXISTS: no social platform renders an SVG Open Graph image. X,
 * Facebook, LinkedIn, Discord, Slack, WhatsApp and iMessage all accept only
 * PNG/JPEG/WEBP/GIF, and every one of them silently drops an `image/svg+xml`
 * card image rather than reporting an error - which is what a "the preview is
 * broken everywhere, but the URL and title are fine" report looks like.
 *
 * So the SVG stays the editable source of truth and the PNG is the artefact
 * that actually ships. Run this after any edit to og.svg, and commit the PNG:
 *
 *     npm run og:build
 *
 * The PNG is committed rather than generated during `next build` on purpose.
 * sharp is only present here as a transitive dependency of Next.js - it is not
 * declared in package.json - so making a deploy depend on it would mean a
 * social card that breaks the next time that dependency tree shifts.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'public', 'og.svg');
const OUT = join(root, 'public', 'og.png');

// Fixed by the platforms, not by us: 1200x630 is the 1.91:1 large-card size.
const WIDTH = 1200;
const HEIGHT = 630;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error(
    'sharp is not installed.\n' +
      'It normally arrives with Next.js. If it has gone missing:\n' +
      '  npm install --no-save sharp\n' +
      'then re-run. public/og.png is committed, so this is only needed when ' +
      'og.svg changes.',
  );
  process.exit(1);
}

if (!existsSync(SRC)) {
  console.error(`missing source: ${SRC}`);
  process.exit(1);
}

const svg = readFileSync(SRC);

// density lifts the rasterisation resolution so text edges are not soft; the
// explicit resize pins the output to exactly 1200x630 regardless.
//
// `flatten` composites onto the brand background and drops the alpha channel.
// A card image is never shown over anything but an opaque timeline row, so
// transparency buys nothing - and several crawlers' image pipelines handle an
// RGBA PNG less predictably than an opaque one. Dropping the channel also cuts
// roughly a quarter of the bytes.
const png = await sharp(svg, { density: 288 })
  .resize(WIDTH, HEIGHT, { fit: 'contain', background: '#050816' })
  .flatten({ background: '#050816' })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(OUT, png);

const meta = await sharp(png).metadata();
const kb = (png.length / 1024).toFixed(1);

if (meta.width !== WIDTH || meta.height !== HEIGHT) {
  console.error(`wrong size: ${meta.width}x${meta.height}, expected ${WIDTH}x${HEIGHT}`);
  process.exit(1);
}

if (meta.hasAlpha) {
  console.error('output still has an alpha channel; flatten() did not apply');
  process.exit(1);
}

// X rejects card images over 5 MB.
if (png.length > 5 * 1024 * 1024) {
  console.error(`too large for X: ${kb} KB, limit 5 MB`);
  process.exit(1);
}

console.log(`public/og.png  ${meta.width}x${meta.height}  ${meta.format}  ${kb} KB`);
