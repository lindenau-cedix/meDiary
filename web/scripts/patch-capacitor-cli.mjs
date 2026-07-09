// Self-healing patch for @capacitor/cli's compiled template.js.
//
// Why this exists: web/package.json pins `tar` to 7.5.16 via an npm
// override to clear the 2025/2026 GHSA-* advisories against tar<=7.5.15
// (transitive via @capacitor/cli@6.2.1, which would otherwise require a
// Capacitor major upgrade to fix). But tar@7 changed its module shape:
// `require("tar")` now returns an object with `__esModule: true` and
// `.extract` directly — there is no `.default`. The compiled CLI uses
// `tslib.__importDefault(require("tar")).default.extract(...)`, which
// works for tar@6 (where `__importDefault` wraps the module as
// `{ default: tar }`) but blows up for tar@7 (where `__importDefault`
// returns the module as-is, so `.default` is undefined). The result is
// `npx cap sync android` crashing with:
//   TypeError: Cannot read properties of undefined (reading 'extract')
//     at extractTemplate (…/@capacitor/cli/dist/util/template.js:9:25)
//     at async removePluginsNativeFiles (…/@capacitor/cli/dist/android/update.js:298:5)
//
// This script rewrites that one line to fall back to the module object
// itself when `.default` is missing, so it works for both tar@6 and
// tar@7. Runs as a `postinstall` hook — idempotent (no-op if already
// patched, or if a fixed Capacitor version is installed upstream).
// Only uses Node built-ins, because node_modules may be in flux when
// postinstall fires.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(
  webDir,
  'node_modules',
  '@capacitor',
  'cli',
  'dist',
  'util',
  'template.js',
);

if (!existsSync(target)) {
  // Capacitor isn't installed in this environment (e.g. CI without the
  // @capacitor/cli dependency). Nothing to patch — exit cleanly.
  process.exit(0);
}

const originalLine = '    await tar_1.default.extract({ file: src, cwd: dir });';
const patchedLine = '    await (tar_1.default || tar_1).extract({ file: src, cwd: dir });';
const marker = '// PATCHED: tar@7 fallback — see web/scripts/patch-capacitor-cli.mjs';

const source = readFileSync(target, 'utf8');

// Already patched (either by us on a previous install, or by an upstream
// Capacitor release that adopted the same fix). Idempotent no-op.
if (source.includes(marker)) {
  process.exit(0);
}

// Upstream fix landed — drop the patch by checking that .default.extract
// no longer appears. Leave the file alone so we don't shadow a real fix.
if (!source.includes(originalLine)) {
  console.log(
    '[patch-capacitor-cli] original line not found — Capacitor likely fixed this upstream; skipping.',
  );
  process.exit(0);
}

const patched = source.replace(originalLine, `${marker}\n${patchedLine}`);
writeFileSync(target, patched, 'utf8');
console.log('[patch-capacitor-cli] patched @capacitor/cli/dist/util/template.js for tar@7 compatibility.');
