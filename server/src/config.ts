import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

/**
 * `thinking`-Parameter für die Tagebuch-Generierung (DIARY_THINKING).
 *  - leer / `adaptive` / `on` / `true`  → `{ type: 'adaptive' }` (Default)
 *  - `off` / `none` / `disabled` / `false` / `0` → kein thinking-Feld (weggelassen)
 *  - positive Zahl N → `{ type: 'enabled', budget_tokens: N }` (nur ältere Modelle)
 *
 * Adaptives Denken (`{ type: 'adaptive' }`) ist gültig sowohl auf der offiziellen
 * Anthropic-API (Opus 4.6+/Sonnet 4.6) ALS AUCH auf Anthropic-kompatiblen
 * Drittanbietern wie MiniMax (`ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`),
 * deren Modelle dasselbe `thinking: { type: 'adaptive' }` akzeptieren. Nur
 * `{ type: 'enabled', budget_tokens }` und Sampling-Parameter würden auf Opus 4.8
 * mit 400 abgelehnt — adaptive nicht. Daher ist `adaptive` ein sicherer Default.
 */
function parseThinking(raw: string | undefined): { type: string; budget_tokens?: number } | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'adaptive' || v === 'on' || v === 'true') return { type: 'adaptive' };
  if (['off', 'none', 'disabled', 'false', '0', 'no'].includes(v)) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return { type: 'enabled', budget_tokens: Math.floor(n) };
  return { type: 'adaptive' }; // Unbekannter Wert → sicherer Default
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
  /**
   * Path to a built web frontend (web/dist) to serve statically.
   *
   * Precedence:
   *  1. WEB_DIST aus der .env (relativ zu process.cwd(), absolut wie angegeben).
   *  2. Auto-Erkennung: ein neben dem Server-Build liegendes `web/dist`
   *     (`SERVER_ROOT/web/dist`). Das Build-Layout (`build.sh`) legt das
   *     Frontend genau dorthin, also funktioniert `GET /` nach `npm run deploy`
   *     auch OHNE WEB_DIST in der .env — „Cannot GET /" kann so nicht
   *     stillschweigend wiederkehren. Im Dev-Modus (`SERVER_ROOT = server/`)
   *     existiert dieser Pfad nicht, daher läuft die API dort weiter solo,
   *     während Vite das Frontend auf :5173 ausliefert.
   *  3. Sonst null (API solo).
   */
  webDist: (() => {
    if (process.env.WEB_DIST) return resolveFromRoot(process.env.WEB_DIST);
    const colocated = path.join(SERVER_ROOT, 'web', 'dist');
    return fs.existsSync(colocated) ? colocated : null;
  })(),
  /** Pfad zur Tagebuch-Markdown-Datei (KI-generierte Volltext-Einträge). */
  diaryPath: (() => {
    if (process.env.DIARY_PATH) return resolveFromRoot(process.env.DIARY_PATH);
    return path.join(DEFAULT_DATA_DIR, 'diary.md');
  })(),
  /**
   * Anthropic-(kompatible) API für die KI-Tagebuch-Generierung
   * (POST /api/diary/generate). Ohne `apiKey` liefert die Generieren-Route 503
   * (das Kurz-Tagebuch und das Anzeigen vorhandener Einträge funktionieren auch
   * ohne Key).
   *
   * **MiniMax-Abo statt Anthropic-Key:** MiniMax bietet einen
   * Anthropic-kompatiblen Endpunkt — einfach `ANTHROPIC_BASE_URL`,
   * `ANTHROPIC_API_KEY` (normaler API-Key, KEIN OAuth) und `DIARY_MODEL` (z. B.
   * `MiniMax-M2`) in der `.env` setzen. Das Wire-Format (`POST /v1/messages`,
   * `x-api-key`, `anthropic-version`, `thinking: { type: 'adaptive' }`) ist
   * identisch, daher braucht es keinen anderen Client.
   */
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    /** Standardmodell; via DIARY_MODEL überschreibbar (Anthropic: claude-haiku-4-5; MiniMax: MiniMax-M2). */
    model: process.env.DIARY_MODEL?.trim() || 'claude-opus-4-8',
    baseUrl: (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, ''),
    /**
     * Maximale Output-Tokens pro Tag (DIARY_MAX_TOKENS). Großzügiger Default,
     * damit adaptives Denken plus der kurze Tagebuchtext nicht abgeschnitten
     * werden — „so viele Tokens wie möglich". Bei MiniMax-Modellen mit
     * niedrigerem Output-Limit ggf. herabsetzen (eine zu hohe Vorgabe meldet
     * die API mit einem klaren Fehler).
     */
    maxTokens: (() => {
      const n = Number(process.env.DIARY_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 32000;
    })(),
    /** `thinking`-Parameter (DIARY_THINKING, Default `{ type: 'adaptive' }`); siehe parseThinking(). */
    thinking: parseThinking(process.env.DIARY_THINKING),
  },
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
