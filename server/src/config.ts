import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

<<<<<<< HEAD
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** server/ root directory (one level up from src/) */
export const SERVER_ROOT = path.resolve(__dirname, '..');
=======
/**
 * "Effective root" — das Verzeichnis, gegen das relative Pfade aufgelöst
 * werden (DB_PATH, DEFAULTS_PATH, WEB_DIST).
 *
 * Beim Dev-Start (tsx watch) liegt `__dirname` unter `server/src/`, also
 * ist `__dirname/..` = `server/` — das ist, was der Code historisch erwartet.
 *
 * Beim Build (TS → JS in `dist/`) liegt `__dirname` aber unter
 * `<install>/dist/` und `__dirname/..` = `<install>/` (z. B. `~/mediary`).
 * Wenn `package.json` im Parent den Server-Namen trägt, sind wir im
 * Dev-Modus; sonst ist es der Install-Root und wir nehmen ihn als Root.
 *
 * Wenn keines von beidem klappt, fallen wir auf `__dirname/..` zurück.
 */
function findServerRoot(): string {
  const candidate = path.resolve(__dirname, '..');
  // Dev-Modus: `server/package.json` mit "name": "mediary-server"
  try {
    const pkgPath = path.join(candidate, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = fs.readFileSync(pkgPath, 'utf8');
      if (/"name"\s*:\s*"mediary-server"/.test(pkg)) return candidate;
    }
  } catch {
    /* fall through */
  }
  return candidate;
}

/** server/ root directory (Dev: server/, Build: <install>/) */
export const SERVER_ROOT = findServerRoot();
>>>>>>> 06ee54f83ca0cdee99946f88a8ef6e5e49ea009c

/** Default data directory: ~/.local/share/mediary */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.local', 'share', 'mediary');

/**
 * Resolve a path from .env. Precedence:
 *  1. Absolute paths are returned as-is.
 *  2. Relative paths are resolved against process.cwd() (NOT SERVER_ROOT).
 *     Under systemd --user this is the install root, e.g. ~/mediary, so
 *     `WEB_DIST=./web/dist` lands on ~/mediary/web/dist correctly.
 *
 * Historically this used `SERVER_ROOT`, which is correct for `npm run dev`
 * (code lives in `server/src/`, so `SERVER_ROOT = server/`) but wrong for
 * the built dist (where `__dirname = <install>/dist/`, so
 * `SERVER_ROOT = <install>/`). The fix routes everything through
 * process.cwd() — which is the install root under systemd, and the repo
 * root under `npm run dev`. Both contexts then expect the same relative
 * path in the .env (e.g. `WEB_DIST=./web/dist`).
 */
function resolveFromRoot(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * Database path. Default: ~/.local/share/mediary/data/mediary.db
   * When WEB_DIST is set, the DB dir is auto-created if it doesn't exist.
   */
  dbPath: (() => {
    if (process.env.DB_PATH) return resolveFromRoot(process.env.DB_PATH);
    return path.join(DEFAULT_DATA_DIR, 'data', 'mediary.db');
  })(),
  /**
   * DEFAULTS.md path. Default: ~/.local/share/mediary/DEFAULTS.md
   * Falls一辈子 der Server als root läuft, gilt immernoch das Home des
   * startenden Users – systemd setzt via User= den richtigen.
   */
  defaultsPath: (() => {
    if (process.env.DEFAULTS_PATH) return resolveFromRoot(process.env.DEFAULTS_PATH);
    return path.join(DEFAULT_DATA_DIR, 'DEFAULTS.md');
  })(),
  /** Optional path to a built web frontend (web/dist) to serve statically. */
  webDist: process.env.WEB_DIST ? resolveFromRoot(process.env.WEB_DIST) : null,
  /**
   * Cloudflare Access (Zero Trust) für geschützte Endpunkte (z. B.
   * POST /api/intakes/text). Ohne teamDomain+aud antworten geschützte
   * Endpunkte mit 503 (fail-closed); CF_ACCESS_DISABLED=true ist der
   * explizite Bypass für lokale Entwicklung/Smoke-Tests.
   */
  cfAccess: {
    /** Team-Domain: "meinteam", "meinteam.cloudflareaccess.com" oder volle URL. */
    teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN?.trim() || null,
    /** AUD-Tag der Access-Application (Zero Trust → Access → Applications). */
    aud: process.env.CF_ACCESS_AUD?.trim() || null,
    /** Override der JWKS-URL (Standard: <team>/cdn-cgi/access/certs; nur für Tests). */
    certsUrl: process.env.CF_ACCESS_CERTS_URL?.trim() || null,
    disabled: process.env.CF_ACCESS_DISABLED === 'true',
  },
};
