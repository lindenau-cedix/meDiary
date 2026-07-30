import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * "Effective root" — the directory relative paths (DB_PATH, DEFAULTS_PATH,
 * WEB_DIST) are resolved against.
 *
 * In dev mode (tsx watch), `__dirname` lives under `server/src/`, so
 * `__dirname/..` = `server/` — which is what the code historically expected.
 *
 * After the build (TS → JS in `dist/`), `__dirname` lives under
 * `<runtime-root>/dist/` and `__dirname/..` = `<runtime-root>` (e.g. `/app`).
 * If the parent's `package.json` carries the server name, we are in dev mode;
 * otherwise it is the install root and we take that as the root.
 *
 * If neither works, we fall back to `__dirname/..`.
 */
function findServerRoot(): string {
  const candidate = path.resolve(__dirname, '..');
  // Dev mode: `server/package.json` with "name": "mediary-server"
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
 * Path to `system_prompt.md` (system prompt for the nightly "dreaming").
 * Read fresh from disk on EVERY generation (no cache), so the user can edit
 * the prompt without restarting the server.
 *
 * Resolution (first existing match wins):
 *   1. DREAM_SYSTEM_PROMPT_PATH from .env (absolute or relative to cwd).
 *   2. <cwd>/system_prompt.md            — Dev: repo root; Docker: /app.
 *   3. <SERVER_ROOT>/system_prompt.md    — next to the built server.
 *   4. <SERVER_ROOT>/../system_prompt.md — dev fallback (server/ → repo root).
 * If none exist, (2) is used as the default — generation then throws a clear
 * error ("system_prompt.md not found").
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
  return { type: 'adaptive' }; // Unknown value → safe default
}

/**
 * `thinking` parameter for **MiniMax M3** (OpenAI-compatible
 * `/chat/completions` endpoint). Per the MiniMax docs, M3 accepts for
 * `thinking.type` EXCLUSIVELY `'adaptive'` or `'disabled'` (NO `budget_tokens`
 * like the Anthropic Messages API — hence a separate, doc-faithful function
 * rather than `parseThinking`). When the field is omitted, thinking defaults
 * to ON; we therefore ALWAYS send it explicitly so that `DREAM_THINKING=off`
 * reliably disables it (otherwise thinking would stay on despite "off").
 *  - empty / `adaptive` / `on` / `true` / number / unknown → `{ type: 'adaptive' }` (default)
 *  - `off` / `none` / `disabled` / `false` / `0` / `no`    → `{ type: 'disabled' }`
 *
 * Source: platform.minimax.io "OpenAI SDK" / chat-completions reference:
 * "Controls MiniMax-M3 thinking. type can be disabled or adaptive; when omitted,
 * thinking is on by default."
 */
function parseMinimaxThinking(raw: string | undefined): { type: 'adaptive' | 'disabled' } {
  const v = (raw ?? '').trim().toLowerCase();
  if (['off', 'none', 'disabled', 'false', '0', 'no'].includes(v)) return { type: 'disabled' };
  return { type: 'adaptive' };
}

/**
 * Output language for the three long-text AI features (nightly "dreaming",
 * AI diary full-text entries, AI ingredient profiles). Default `de` = prior
 * behavior. `en` prepends a clear language directive to the model and
 * translates the few German prompt-scaffolding lines (section headers like
 * "## Einnahmen") so the model is not thrown off by mixed-language input.
 * Other strings (substance names, intake notes, METRIC labels, Hermes
 * reports …) stay unchanged — those are user/domain data, not output
 * language.
 *
 * `AI_LANGUAGE=de` (default) | `en`. Unknown values → `de`.
 */
function parseAiLanguage(raw: string | undefined): 'de' | 'en' {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  return 'de';
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * Output language of the AI long-text generators (AI_LANGUAGE). Default `de`.
   * See `parseAiLanguage` above — unknown values fall back to `de`.
   */
  aiLanguage: parseAiLanguage(process.env.AI_LANGUAGE),
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
   * If the server runs without Docker, the starting user's home is used.
   */
  defaultsPath: (() => {
    if (process.env.DEFAULTS_PATH) return resolveFromRoot(process.env.DEFAULTS_PATH);
    return path.join(DEFAULT_DATA_DIR, 'DEFAULTS.md');
  })(),
  /**
   * Path to a built web frontend (web/dist) to serve statically.
   *
   * Precedence:
   *  1. WEB_DIST from .env (relative to process.cwd(), absolute as given).
   *  2. Auto-detection: a `web/dist` colocated with the server build
   *     (`SERVER_ROOT/web/dist`). The Docker image additionally sets
   *     `WEB_DIST=/app/web/dist`, so `GET /` reliably serves the frontend
   *     inside the container. In dev mode (`SERVER_ROOT = server/`) this
   *     path does not exist, so the API runs alone while Vite serves the
   *     frontend on :5173.
   *  3. Otherwise null (API only).
   */
  webDist: (() => {
    if (process.env.WEB_DIST) return resolveFromRoot(process.env.WEB_DIST);
    const colocated = path.join(SERVER_ROOT, 'web', 'dist');
    return fs.existsSync(colocated) ? colocated : null;
  })(),
  /** Path to the diary markdown file (AI-generated full-text entries). */
  diaryPath: (() => {
    if (process.env.DIARY_PATH) return resolveFromRoot(process.env.DIARY_PATH);
    return path.join(DEFAULT_DATA_DIR, 'diary.md');
  })(),
  /**
   * Anthropic-(compatible) API for AI diary generation
   * (POST /api/diary/generate). Without `apiKey`, the generate route returns 503
   * (the short diary and listing existing entries still work without a key).
   *
   * **MiniMax subscription instead of an Anthropic key:** MiniMax offers an
   * Anthropic-compatible endpoint — simply set `ANTHROPIC_BASE_URL`,
   * `ANTHROPIC_API_KEY` (a regular API key, NOT OAuth) and `DIARY_MODEL` (e.g.
   * `MiniMax-M2`) in `.env`. The wire format (`POST /v1/messages`, `x-api-key`,
   * `anthropic-version`, `thinking: { type: 'adaptive' }`) is identical, so no
   * separate client is needed.
   */
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    /** Default model; overridable via DIARY_MODEL (Anthropic: claude-haiku-4-5; MiniMax: MiniMax-M2). */
    model: process.env.DIARY_MODEL?.trim() || 'claude-opus-4-8',
    baseUrl: (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, ''),
    /**
     * Maximum output tokens per day (DIARY_MAX_TOKENS). Generous default so
     * adaptive thinking plus the short diary text do not get cut off —
     * "as many tokens as possible". Lower it for MiniMax models with a
     * smaller output limit if needed (the API will report an over-high value
     * with a clear error).
     */
    maxTokens: (() => {
      const n = Number(process.env.DIARY_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 32000;
    })(),
    /** `thinking` parameter (DIARY_THINKING, default `{ type: 'adaptive' }`); see parseThinking(). */
    thinking: parseThinking(process.env.DIARY_THINKING),
  },
  /**
   * MiniMax M3 (OpenAI-compatible endpoint) for the nightly "dreaming"
   * (the daily assessment). Unlike the Anthropic-compatible diary
   * integration, MiniMax here uses the **OpenAI wire-format** endpoint
   * `POST {baseUrl}/chat/completions` with `Authorization: Bearer` and a
   * response in `choices[0].message.content`. Without `apiKey`, the scheduler
   * does not start and the manual trigger returns 503.
   */
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY?.trim() || null,
    /** Model ID; overridable via MINIMAX_MODEL (default MiniMax-M3). */
    model: process.env.MINIMAX_MODEL?.trim() || 'MiniMax-M3',
    /** Base URL (default https://api.minimax.io/v1); trailing slash stripped. */
    baseUrl: (process.env.MINIMAX_BASE_URL?.trim() || 'https://api.minimax.io/v1').replace(/\/$/, ''),
    /**
     * Maximum output tokens (DREAM_MAX_TOKENS). Generous, because M3 is a
     * reasoning model and its thinking falls within this budget — too tight
     * would cut off the actual assessment. Lower it for accounts with a
     * smaller output limit if needed (the API will report an over-high value
     * clearly).
     */
    maxTokens: (() => {
      const n = Number(process.env.DREAM_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40000;
    })(),
    /** Sampling temperature (DREAM_TEMPERATURE, default 0.6 as in the reference call). */
    temperature: (() => {
      const n = Number(process.env.DREAM_TEMPERATURE);
      return Number.isFinite(n) && n >= 0 ? n : 0.6;
    })(),
    /**
     * Hard timeout per MiniMax call (DREAM_HTTP_TIMEOUT_MS, default 120000 =
     * 2 min). Node's `fetch` has no default timeout for hanging/half-open
     * connections; without a hard abort a stuck call could permanently block
     * the `withDreamLock` guard (scheduler never re-arms).
     */
    timeoutMs: (() => {
      const n = Number(process.env.DREAM_HTTP_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120000;
    })(),
    /**
     * `thinking` switch for dream generation (env **DREAM_THINKING**).
     * Default `{ type: 'adaptive' }` (doc-compliant for M3, improves analysis).
     * `DREAM_THINKING=off` → `{ type: 'disabled' }` (explicit, since omitting
     * the field means ON for M3). See `parseMinimaxThinking`.
     */
    thinking: parseMinimaxThinking(process.env.DREAM_THINKING),
  },
  /**
   * "Data Console" (Chat with your data) — agentic natural-language console
   * for bulk corrections that the normal UI cannot perform (merge substances,
   * backfill/delete intakes, fix timezone shifts …). Unlike "dreaming"
   * (OpenAI wire format), the console uses the **Anthropic-compatible**
   * MiniMax endpoint (`/v1/messages` with tool use) because the agent loop
   * (run read-tools immediately, only propose `propose_change_set`) requires
   * the Messages tool format.
   *
   * The key is used exclusively server-side (NEVER sent to the client).
   * Without a key, `GET /api/chat/status` returns `available:false` and the
   * UI shows a clear hint; `POST /api/chat/message` returns 503. The default
   * key is the already-set `MINIMAX_API_KEY`, so the console runs on the
   * existing MiniMax subscription with no extra configuration; a separate
   * `CHAT_API_KEY` takes precedence.
   */
  chat: {
    apiKey: process.env.CHAT_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim() || null,
    /** Model ID; overridable via CHAT_MODEL (default MiniMax-M3). */
    model: process.env.CHAT_MODEL?.trim() || 'MiniMax-M3',
    /**
     * Anthropic-compatible base URL (default https://api.minimax.io/anthropic;
     * CN region: https://api.minimaxi.com/anthropic). Trailing slash stripped.
     * The client appends `/v1/messages`.
     */
    baseUrl: (process.env.CHAT_BASE_URL?.trim() || 'https://api.minimax.io/anthropic').replace(/\/$/, ''),
    /** Max output tokens per model round (CHAT_MAX_TOKENS, default 8000). */
    maxTokens: (() => {
      const n = Number(process.env.CHAT_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8000;
    })(),
    /**
     * "thinking" parameter (CHAT_THINKING). Default `{ type: 'adaptive' }`
     * (valid on Anthropic & MiniMax; see parseThinking). Activated thinking
     * noticeably improves operation planning. `off` disables it.
     */
    thinking: parseThinking(process.env.CHAT_THINKING),
    /**
     * Hard timeout per model call in ms (CHAT_HTTP_TIMEOUT_MS, default 120000).
     * Node's `fetch` has no default timeout; without a hard abort a stuck
     * call could leave the SSE response open indefinitely.
     */
    timeoutMs: (() => {
      const n = Number(process.env.CHAT_HTTP_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120000;
    })(),
    /** Max agent rounds (tool-loop iterations) per request (CHAT_MAX_STEPS, default 12). */
    maxSteps: (() => {
      const n = Number(process.env.CHAT_MAX_STEPS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
    })(),
    /** Row upper limit for `run_read_query` (CHAT_MAX_ROWS, default 500). */
    maxRows: (() => {
      const n = Number(process.env.CHAT_MAX_ROWS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
    })(),
    /** Minimum spacing between two chat requests in ms (CHAT_MIN_INTERVAL_MS, default 1500). */
    minIntervalMs: (() => {
      const n = Number(process.env.CHAT_MIN_INTERVAL_MS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1500;
    })(),
    /**
     * Row threshold at which a change set is considered "large" and triggers
     * an additional confirmation in the UI (CHAT_LARGE_OP_THRESHOLD, default 100).
     */
    largeOpThreshold: (() => {
      const n = Number(process.env.CHAT_LARGE_OP_THRESHOLD);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
    })(),
  },
  /**
   * AI ingredient analysis for the "Active-Ingredient Balance" statistics
   * (total caffeine & co. across all sources). Like the data console, it
   * uses the **MiniMax subscription** by default via the Anthropic-compatible
   * endpoint (`x-api-key`, `POST {baseUrl}/v1/messages`); same wire format as
   * the AI diary, so `generateText` is sufficient. The key is used exclusively
   * server-side. Precedence (first set wins): INGREDIENTS_API_KEY >
   * CHAT_API_KEY > MINIMAX_API_KEY — i.e. with the existing MiniMax key the
   * analysis runs WITHOUT extra configuration. Without a key, `GET /api/ingredients`
   * returns `available:false` and `POST /api/ingredients/analyze` returns 503.
   */
  ingredients: {
    apiKey:
      process.env.INGREDIENTS_API_KEY?.trim() ||
      process.env.CHAT_API_KEY?.trim() ||
      process.env.MINIMAX_API_KEY?.trim() ||
      null,
    /** Model ID (INGREDIENTS_MODEL > CHAT_MODEL > MiniMax-M3 — same as the data console). */
    model: process.env.INGREDIENTS_MODEL?.trim() || process.env.CHAT_MODEL?.trim() || 'MiniMax-M3',
    /** Anthropic-compatible base URL (INGREDIENTS_BASE_URL > CHAT_BASE_URL > MiniMax); client appends `/v1/messages`. */
    baseUrl: (
      process.env.INGREDIENTS_BASE_URL?.trim() ||
      process.env.CHAT_BASE_URL?.trim() ||
      'https://api.minimax.io/anthropic'
    ).replace(/\/$/, ''),
    /**
     * Max output tokens per chunk (INGREDIENTS_MAX_TOKENS, default 24000).
     * Generous, because M3 is a reasoning model and its thinking falls within
     * this budget — too tight would cut off the JSON.
     */
    maxTokens: (() => {
      const n = Number(process.env.INGREDIENTS_MAX_TOKENS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 24000;
    })(),
    /** `thinking` parameter (INGREDIENTS_THINKING > CHAT_THINKING > `{ type:'adaptive' }`). */
    thinking: parseThinking(process.env.INGREDIENTS_THINKING ?? process.env.CHAT_THINKING),
  },
  /** Nightly "dreaming" — scheduler & manual trigger. */
  dream: {
    /** Time "HH:MM" (local wall-clock = Europe/Berlin). Default 04:20. */
    time: (process.env.DREAM_TIME?.trim() || '04:20'),
    /** Timezone (informational; the host runs in Europe/Berlin like the rest of the app). */
    tz: process.env.DREAM_TZ?.trim() || 'Europe/Berlin',
    /** true (default) = enable scheduler on server start (when a key is present). */
    schedulerEnabled: process.env.DREAM_SCHEDULER_DISABLED !== 'true',
    /**
     * Number of recent consumption days checked and backfilled for missing
     * dreams on server start (DREAM_CATCHUP_DAYS, default 7; 0 = off). Catches
     * restarts across the 04:20 window and backfilled data.
     */
    catchUpDays: (() => {
      const n = Number(process.env.DREAM_CATCHUP_DAYS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 7;
    })(),
    /**
     * Minimum spacing (ms) between two generations triggered over HTTP
     * (DREAM_MIN_INTERVAL_MS, default 10000). Simple rate-limit protection
     * against token-cost abuse (generate→DELETE→generate loop); the
     * in-process scheduler is unaffected.
     */
    minIntervalMs: (() => {
      const n = Number(process.env.DREAM_MIN_INTERVAL_MS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10000;
    })(),
    /**
     * Optional token for the manual trigger endpoint
     * (POST /api/dreams/generate), compared in constant time. **Primary auth
     * means.** The in-process scheduler does NOT need it — it calls
     * `generateDream` directly, without going through HTTP.
     */
    triggerToken: process.env.DREAM_TRIGGER_TOKEN?.trim() || null,
    /**
     * Accept loopback (127.0.0.1) as auth (DREAM_TRUST_LOOPBACK, default
     * **false** = fail-closed). **Important:** behind a reverse proxy /
     * cloudflared tunnel on the same host, EVERY external request arrives via
     * 127.0.0.1 — then the trigger would be world-open. Hence loopback is by
     * default NOT auth; a `DREAM_TRIGGER_TOKEN` is required. Only set to true
     * for genuine local-only deployments (no tunnel/proxy in front) — the
     * deliberate dev/local bypass, analogous to CF_ACCESS_DISABLED.
     */
    trustLoopback: process.env.DREAM_TRUST_LOOPBACK === 'true',
    /** Path to system_prompt.md (read fresh per generation). */
    systemPromptPath: findSystemPromptPath(),
  },
  /**
   * ElevenLabs TTS for dream delivery (voice note via WhatsApp). The API key
   * is used exclusively server-side (NEVER sent to the client). Without a
   * key, `GET /api/delivery/status` returns `elevenlabsAvailable:false` and
   * the voice pipeline returns 503. `voiceId` has a default so the
   * `elevenlabsAvailable()` function can distinguish true/false cleanly
   * without a key — the actual send attempt then throws
   * `ElevenLabsNotConfiguredError`.
   */
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY?.trim() || null,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || 'OO0WT3lY2gVNwzZMAjAI',
    model: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2',
    baseUrl: (process.env.ELEVENLABS_BASE_URL?.trim() || 'https://api.elevenlabs.io').replace(/\/$/, ''),
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || 'mp3_22050_32',
    timeoutMs: (() => {
      const n = Number(process.env.ELEVENLABS_HTTP_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60_000;
    })(),
  },
  /**
   * WhatsApp Web connection (Baileys). `enabled` is on by default and can be
   * switched off with `WHATSAPP_DISABLED=true` (e.g. when the server is meant
   * to run without WhatsApp setup). `sessionPath` is Baileys' multi-file auth
   * directory — defaults to the user's home so local dev setups work without
   * `.env`; the Docker image sets `WHATSAPP_SESSION_PATH=/data/whatsapp-session`.
   */
  whatsapp: {
    enabled: process.env.WHATSAPP_DISABLED !== 'true',
    sessionPath: (() => {
      if (process.env.WHATSAPP_SESSION_PATH) {
        const raw = process.env.WHATSAPP_SESSION_PATH.trim();
        return path.isAbsolute(raw) ? raw : resolveFromRoot(raw);
      }
      return path.join(DEFAULT_DATA_DIR, 'whatsapp-session');
    })(),
  },
  /**
   * Dream delivery — global toggles + limits. `enabled` is on by default
   * (DREAM_DELIVERY_DISABLED=true switches off), `maxAttempts`/`retentionDays`
   * govern the retry/backoff layer, `ffmpegTimeoutMs` the transcode step,
   * `voiceMaxChars` truncates the dream text before TTS so no 5-minute voice
   * note is produced.
   */
  delivery: {
    enabled: process.env.DREAM_DELIVERY_DISABLED !== 'true',
    maxAttempts: (() => {
      const n = Number(process.env.DREAM_DELIVERY_MAX_ATTEMPTS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
    })(),
    retentionDays: (() => {
      const n = Number(process.env.DREAM_DELIVERY_RETRY_DAYS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
    })(),
    ffmpegTimeoutMs: (() => {
      const n = Number(process.env.DREAM_VOICE_TIMEOUT_MS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60_000;
    })(),
    voiceMaxChars: (() => {
      const n = Number(process.env.DREAM_VOICE_MAX_CHARS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1500;
    })(),
  },
  /**
   * Admin UI toggle (WhatsApp QR panel, delivery status etc.). Default
   * **off** — only with `ADMIN_UI_ENABLED=true` does the UI expose the
   * corresponding tabs/endpoints. Prevents accidental pairing.
   */
  admin: {
    enabled: process.env.ADMIN_UI_ENABLED === 'true',
  },
  /**
   * Cloudflare Access (Zero Trust) for protected endpoints (e.g.
   * POST /api/intakes/text). Without teamDomain+aud, protected endpoints
   * respond with 503 (fail-closed); CF_ACCESS_DISABLED=true is the explicit
   * bypass for local development / smoke tests.
   */
  cfAccess: {
    /** Team domain: "myteam", "myteam.cloudflareaccess.com" or full URL. */
    teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN?.trim() || null,
    /** AUD tag of the Access application (Zero Trust → Access → Applications). */
    aud: process.env.CF_ACCESS_AUD?.trim() || null,
    /** Override of the JWKS URL (default: <team>/cdn-cgi/access/certs; for tests only). */
    certsUrl: process.env.CF_ACCESS_CERTS_URL?.trim() || null,
    disabled: process.env.CF_ACCESS_DISABLED === 'true',
  },
};
