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
 * `<runtime-root>/dist/` und `__dirname/..` = `<runtime-root>` (z. B. `/app`).
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
 *     In Docker this is `/app`, so `/app/web/dist` or `./web/dist` resolve
 *     to the built frontend correctly.
 *
 * Historically this used `SERVER_ROOT`, which is correct for `npm run dev`
 * (code lives in `server/src/`, so `SERVER_ROOT = server/`) but wrong for
 * the built dist (where `__dirname = <install>/dist/`, so
 * `SERVER_ROOT = <install>/`). The fix routes everything through
 * process.cwd() — which is `/app` in Docker and the repo root under
 * `npm run dev`. Both contexts then expect relative paths from their runtime
 * working directory (e.g. `WEB_DIST=./web/dist` outside Docker).
 */
function resolveFromRoot(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

/**
 * Pfad zu `system_prompt.md` (System-Prompt für das nächtliche „Träumen").
 * Wird zur Laufzeit bei JEDER Generierung frisch gelesen (kein Cache), damit
 * der Nutzer den Prompt ändern kann, ohne den Server neu zu starten.
 *
 * Auflösung (erster existierender Treffer gewinnt):
 *   1. DREAM_SYSTEM_PROMPT_PATH aus der .env (absolut oder relativ zu cwd).
 *   2. <cwd>/system_prompt.md            — Dev: Repo-Root; Docker: /app.
 *   3. <SERVER_ROOT>/system_prompt.md    — neben dem gebauten Server.
 *   4. <SERVER_ROOT>/../system_prompt.md — Dev-Fallback (server/ → Repo-Root).
 * Existiert keiner, gilt (2) als Default — die Generierung wirft dann einen
 * klaren Fehler („system_prompt.md nicht gefunden").
 */
function findSystemPromptPath(): string {
  if (process.env.DREAM_SYSTEM_PROMPT_PATH) {
    return resolveFromRoot(process.env.DREAM_SYSTEM_PROMPT_PATH);
  }
  const candidates = [
    path.resolve(process.cwd(), 'system_prompt.md'),
    path.join(SERVER_ROOT, 'system_prompt.md'),
    path.resolve(SERVER_ROOT, '..', 'system_prompt.md'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
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

/**
 * `thinking`-Parameter für **MiniMax M3** (OpenAI-kompatibler
 * `/chat/completions`-Endpunkt). Laut MiniMax-Doku akzeptiert M3 für `thinking.type`
 * AUSSCHLIESSLICH `'adaptive'` oder `'disabled'` (KEIN `budget_tokens` wie die
 * Anthropic-Messages-API — daher eine eigene, doku-treue Funktion statt
 * `parseThinking`). Wird das Feld weggelassen, ist Thinking standardmäßig AN;
 * wir senden es deshalb IMMER explizit, damit `DREAM_THINKING=off` verlässlich
 * abschaltet (sonst bliebe Thinking trotz „off" an).
 *  - leer / `adaptive` / `on` / `true` / Zahl / unbekannt → `{ type: 'adaptive' }` (Default)
 *  - `off` / `none` / `disabled` / `false` / `0` / `no`    → `{ type: 'disabled' }`
 *
 * Quelle: platform.minimax.io „OpenAI SDK" / Chat-Completions-Referenz:
 * „Controls MiniMax-M3 thinking. type can be disabled or adaptive; when omitted,
 * thinking is on by default."
 */
function parseMinimaxThinking(raw: string | undefined): { type: 'adaptive' | 'disabled' } {
  const v = (raw ?? '').trim().toLowerCase();
  if (['off', 'none', 'disabled', 'false', '0', 'no'].includes(v)) return { type: 'disabled' };
  return { type: 'adaptive' };
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
   * Falls der Server ohne Docker läuft, gilt das Home des startenden Users.
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
   *     (`SERVER_ROOT/web/dist`). Das Docker-Image setzt zusätzlich
   *     `WEB_DIST=/app/web/dist`, sodass `GET /` im Container zuverlässig
   *     das Frontend ausliefert. Im Dev-Modus (`SERVER_ROOT = server/`)
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
   * MiniMax M3 (OpenAI-kompatibler Endpunkt) für das nächtliche „Träumen"
   * (die tägliche Auswertung). Anders als die Anthropic-kompatible Diary-
   * Integration nutzt MiniMax hier den **OpenAI-Wire-Format**-Endpunkt
   * `POST {baseUrl}/chat/completions` mit `Authorization: Bearer` und Antwort
   * in `choices[0].message.content`. Ohne `apiKey` läuft der Scheduler nicht
   * an und der manuelle Trigger liefert 503.
   */
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY?.trim() || null,
    /** Modell-ID; via MINIMAX_MODEL überschreibbar (Default MiniMax-M3). */
    model: process.env.MINIMAX_MODEL?.trim() || 'MiniMax-M3',
    /** Basis-URL (Default https://api.minimax.io/v1); trailing slash entfernt. */
    baseUrl: (process.env.MINIMAX_BASE_URL?.trim() || 'https://api.minimax.io/v1').replace(/\/$/, ''),
    /**
     * Maximale Output-Tokens (DREAM_MAX_TOKENS). Großzügig, weil M3 ein
     * Reasoning-Modell ist und sein Denken in dieses Budget fällt — zu knapp
     * würde die eigentliche Auswertung abschneiden. Bei Accounts mit niedrigerem
     * Output-Limit ggf. herabsetzen (die API meldet eine zu hohe Vorgabe klar).
     */
    maxTokens: (() => {
      const n = Number(process.env.DREAM_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40000;
    })(),
    /** Sampling-Temperatur (DREAM_TEMPERATURE, Default 0.6 wie im Referenz-Call). */
    temperature: (() => {
      const n = Number(process.env.DREAM_TEMPERATURE);
      return Number.isFinite(n) && n >= 0 ? n : 0.6;
    })(),
    /**
     * Harter Timeout pro MiniMax-Call (DREAM_HTTP_TIMEOUT_MS, Default 120000 =
     * 2 min). Node's `fetch` hat keinen Default-Timeout für hängende/halb-offene
     * Verbindungen; ohne harten Abbruch könnte ein hängender Call den
     * `withDreamLock`-Guard dauerhaft blockieren (Scheduler armt nie neu).
     */
    timeoutMs: (() => {
      const n = Number(process.env.DREAM_HTTP_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120000;
    })(),
    /**
     * `thinking`-Switch für die Traum-Generierung (Env **DREAM_THINKING**).
     * Default `{ type: 'adaptive' }` (Doku-konform für M3, verbessert die
     * Analyse). `DREAM_THINKING=off` → `{ type: 'disabled' }` (explizit, da
     * Weglassen bei M3 = AN). Siehe `parseMinimaxThinking`.
     */
    thinking: parseMinimaxThinking(process.env.DREAM_THINKING),
  },
  /**
   * „Daten-Konsole" (Chat with your data) — agentische Natürlichsprache-Konsole
   * für Massenkorrekturen, die über die normale UI nicht möglich sind
   * (Substanzen zusammenführen, Einnahmen rückwirkend nachtragen/löschen,
   * Zeitzonen-Verschiebungen korrigieren …). Anders als das „Träumen"
   * (OpenAI-Wire-Format) nutzt die Konsole den **Anthropic-kompatiblen**
   * MiniMax-Endpunkt (`/v1/messages` mit Tool-Use), weil die Agent-Schleife
   * (read-Tools sofort ausführen, `propose_change_set` nur vorschlagen) das
   * Messages-Tool-Format braucht.
   *
   * Der Schlüssel wird ausschließlich serverseitig verwendet (NIE an den
   * Client). Ohne Key liefert `GET /api/chat/status` `available:false` und die
   * UI zeigt einen klaren Hinweis; `POST /api/chat/message` antwortet 503.
   * Default-Key ist der ohnehin gesetzte `MINIMAX_API_KEY`, sodass die Konsole
   * mit dem bestehenden MiniMax-Abo ohne Zusatzkonfiguration läuft; ein
   * separater `CHAT_API_KEY` hat Vorrang.
   */
  chat: {
    apiKey: process.env.CHAT_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim() || null,
    /** Modell-ID; via CHAT_MODEL überschreibbar (Default MiniMax-M3). */
    model: process.env.CHAT_MODEL?.trim() || 'MiniMax-M3',
    /**
     * Anthropic-kompatible Basis-URL (Default https://api.minimax.io/anthropic;
     * CN-Region: https://api.minimaxi.com/anthropic). Trailing slash entfernt.
     * Der Client hängt `/v1/messages` an.
     */
    baseUrl: (process.env.CHAT_BASE_URL?.trim() || 'https://api.minimax.io/anthropic').replace(/\/$/, ''),
    /** Max. Output-Tokens pro Modell-Runde (CHAT_MAX_TOKENS, Default 8000). */
    maxTokens: (() => {
      const n = Number(process.env.CHAT_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8000;
    })(),
    /**
     * „thinking"-Parameter (CHAT_THINKING). Default `{ type: 'adaptive' }`
     * (gültig auf Anthropic & MiniMax; siehe parseThinking). Aktiviertes Denken
     * verbessert die Planung der Operationen merklich. `off` schaltet es ab.
     */
    thinking: parseThinking(process.env.CHAT_THINKING),
    /**
     * Harter Timeout pro Modell-Call in ms (CHAT_HTTP_TIMEOUT_MS, Default 120000).
     * Node's `fetch` hat keinen Default-Timeout; ohne harten Abbruch könnte ein
     * hängender Call die SSE-Antwort dauerhaft offen halten.
     */
    timeoutMs: (() => {
      const n = Number(process.env.CHAT_HTTP_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120000;
    })(),
    /** Max. Agent-Runden (Tool-Loop-Durchläufe) pro Anfrage (CHAT_MAX_STEPS, Default 12). */
    maxSteps: (() => {
      const n = Number(process.env.CHAT_MAX_STEPS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
    })(),
    /** Zeilen-Obergrenze für `run_read_query` (CHAT_MAX_ROWS, Default 500). */
    maxRows: (() => {
      const n = Number(process.env.CHAT_MAX_ROWS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
    })(),
    /** Mindestabstand zwischen zwei Chat-Anfragen in ms (CHAT_MIN_INTERVAL_MS, Default 1500). */
    minIntervalMs: (() => {
      const n = Number(process.env.CHAT_MIN_INTERVAL_MS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1500;
    })(),
    /**
     * Zeilen-Schwelle, ab der ein Change-Set als „groß" gilt und in der UI eine
     * zusätzliche Bestätigung verlangt (CHAT_LARGE_OP_THRESHOLD, Default 100).
     */
    largeOpThreshold: (() => {
      const n = Number(process.env.CHAT_LARGE_OP_THRESHOLD);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
    })(),
  },
  /** Nächtliches „Träumen" — Scheduler & manueller Trigger. */
  dream: {
    /** Uhrzeit "HH:MM" (lokale Wand­uhr = Europe/Berlin). Default 04:20. */
    time: (process.env.DREAM_TIME?.trim() || '04:20'),
    /** Zeitzone (informativ; der Host läuft in Europe/Berlin wie der Rest der App). */
    tz: process.env.DREAM_TZ?.trim() || 'Europe/Berlin',
    /** true (Default) = Scheduler beim Serverstart aktivieren (wenn ein Key da ist). */
    schedulerEnabled: process.env.DREAM_SCHEDULER_DISABLED !== 'true',
    /**
     * Anzahl jüngster Konsum-Tage, die beim Serverstart auf fehlende Träume
     * geprüft und nachgeholt werden (DREAM_CATCHUP_DAYS, Default 7; 0 = aus).
     * Fängt Neustarts über das 04:20-Fenster hinweg und nachgetragene Daten ab.
     */
    catchUpDays: (() => {
      const n = Number(process.env.DREAM_CATCHUP_DAYS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 7;
    })(),
    /**
     * Mindestabstand (ms) zwischen zwei Generierungen über den HTTP-Trigger
     * (DREAM_MIN_INTERVAL_MS, Default 10000). Einfacher Rate-Limit-Schutz gegen
     * Token-Kosten-Missbrauch (generate→DELETE→generate-Schleife); der
     * In-Process-Scheduler ist davon nicht betroffen.
     */
    minIntervalMs: (() => {
      const n = Number(process.env.DREAM_MIN_INTERVAL_MS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10000;
    })(),
    /**
     * Optionales Token für den manuellen Trigger-Endpoint
     * (POST /api/dreams/generate), verglichen in konstanter Zeit. **Primäres
     * Auth-Mittel.** Der In-Process-Scheduler braucht es NICHT — er ruft
     * `generateDream` direkt auf, ohne über HTTP zu gehen.
     */
    triggerToken: process.env.DREAM_TRIGGER_TOKEN?.trim() || null,
    /**
     * Loopback (127.0.0.1) als Auth akzeptieren (DREAM_TRUST_LOOPBACK, Default
     * **false** = fail-closed). **Wichtig:** Hinter einem Reverse-Proxy /
     * cloudflared-Tunnel auf demselben Host kommt JEDE externe Anfrage über
     * 127.0.0.1 herein — dann wäre der Trigger weltoffen. Darum ist Loopback
     * standardmäßig KEINE Auth; ein `DREAM_TRIGGER_TOKEN` ist Pflicht. Nur für
     * echte Nur-lokal-Deployments (kein Tunnel/Proxy davor) auf true setzen —
     * analog zu CF_ACCESS_DISABLED als bewusster Dev/Local-Bypass.
     */
    trustLoopback: process.env.DREAM_TRUST_LOOPBACK === 'true',
    /** Pfad zu system_prompt.md (frisch je Generierung gelesen). */
    systemPromptPath: findSystemPromptPath(),
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
