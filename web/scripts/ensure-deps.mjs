// Self-healing dependency guard — runs as the `prebuild` hook.
//
// Why this exists: the font packages in main.tsx are added over time
// (jetbrains-mono @5.2.8 came after fraunces/hanken-grotesk @5.1.0).
// A machine that installed deps BEFORE a package was added and then only
// pulled new code — without re-running `npm install` — has a stale
// node_modules. Rollup then fails with exactly:
//   "failed to resolve import '@fontsource-variable/jetbrains-mono/wght.css'"
// (the two older fonts resolve fine, only the newly-added one is missing).
//
// This guard detects that state and reinstalls, so `npm run build` repairs
// itself instead of failing and requiring a manual `npm install` that the
// build automation never performs. It only uses Node built-ins, because
// node_modules may be incomplete when it runs.

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nodeModules = join(webDir, 'node_modules');
const pkg = JSON.parse(readFileSync(join(webDir, 'package.json'), 'utf8'));

const required = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};

// A dependency counts as "installed" only if its own package.json is present.
const missing = Object.keys(required).filter(
  (name) => !existsSync(join(nodeModules, name, 'package.json')),
);

if (!existsSync(nodeModules) || missing.length > 0) {
  const reason = !existsSync(nodeModules)
    ? 'node_modules is absent'
    : `node_modules is out of sync — missing: ${missing.join(', ')}`;
  const hasLock = existsSync(join(webDir, 'package-lock.json'));
  const cmd = hasLock ? 'npm ci' : 'npm install';
  console.log(`[ensure-deps] ${reason}. Running \`${cmd}\`…`);
  execSync(cmd, { cwd: webDir, stdio: 'inherit' });
  console.log('[ensure-deps] dependencies restored.');
}
