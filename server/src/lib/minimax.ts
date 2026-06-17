import { config } from '../config.js';

/**
 * Minimaler MiniMax-Client (OpenAI-kompatibles Chat-Completions-Wire-Format)
 * über `fetch` (Node 18+ global, keine neue Dependency — wie anthropic.ts und
 * cloudflare_access.ts ohne Bibliothek auskommen).
 *
 * Genutzt für das nächtliche „Träumen" (die tägliche Auswertung). Anders als
 * die Anthropic-(kompatible) Diary-Integration spricht MiniMax hier das
 * OpenAI-Format:
 *
 *   Endpunkt:  POST {baseUrl}/chat/completions   (baseUrl endet auf .../v1)
 *   Header:    Authorization: Bearer <MINIMAX_API_KEY>, content-type
 *   Modell:    config.minimax.model (Default MiniMax-M3)
 *   Body:      { model, messages:[{role:'system'},{role:'user'}], max_tokens,
 *               temperature, thinking }
 *   Antwort:   choices[0].message.content
 *
 * MiniMax M3 ist ein Reasoning-Modell; Thinking ist standardmäßig an. Wir
 * senden `thinking: { type: 'adaptive' }` explizit (config.minimax.thinking),
 * um es aktiviert zu lassen. Das Modell kann seine Gedanken in `<think>…</think>`
 * in den Content einbetten oder in einem separaten `reasoning_content`-Feld
 * liefern — wir nehmen ausschließlich den finalen Antworttext (`content`) und
 * strippen etwaige `<think>`-Blöcke.
 */

/** Wird geworfen, wenn kein MiniMax-Key konfiguriert ist (Route → 503). */
export class MinimaxNotConfiguredError extends Error {
  constructor() {
    super('MINIMAX_API_KEY ist nicht konfiguriert — nächtliches Träumen deaktiviert.');
    this.name = 'MinimaxNotConfiguredError';
  }
}

/**
 * Antwort wurde durch das Token-Limit abgeschnitten (finish_reason='length')
 * und enthält keinen verwertbaren Text — bei einem Reasoning-Modell wie M3
 * frisst das Denken das `max_tokens`-Budget auf. NICHT retry-bar (gleiche
 * Parameter liefern dasselbe Ergebnis); der Aufrufer soll DREAM_MAX_TOKENS
 * erhöhen.
 */
export class MinimaxTruncatedError extends Error {
  constructor(maxTokens: number) {
    super(
      `MiniMax: Antwort durch Token-Limit abgeschnitten (finish_reason=length, max_tokens=${maxTokens}). ` +
        `DREAM_MAX_TOKENS erhöhen — das Denken des Reasoning-Modells hat das Budget verbraucht.`,
    );
    this.name = 'MinimaxTruncatedError';
  }
}

/** True, wenn ein MiniMax-Key hinterlegt ist. */
export function minimaxAvailable(): boolean {
  return !!config.minimax.apiKey;
}

export function minimaxModel(): string {
  return config.minimax.model;
}

interface ChatMessage {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
}

interface ChatChoice {
  message?: ChatMessage;
  finish_reason?: string | null;
}

interface ChatResponse {
  choices?: ChatChoice[];
  base_resp?: { status_code?: number; status_msg?: string };
}

interface ChatOptions {
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Entfernt `<think>…</think>`-Blöcke (Reasoning) aus dem Antworttext. */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Defensiv: ein unbalanciertes öffnendes/schließendes Tag.
    .replace(/<\/?think>/gi, '')
    .trim();
}

/**
 * Erzeugt die tägliche Auswertung über die Chat-Completions-API und liefert den
 * finalen Antworttext zurück. Wirft bei fehlendem Key, HTTP-Fehler, Timeout,
 * Token-Abbruch (`MinimaxTruncatedError`) oder leerer Antwort. Retries/Backoff
 * liegen beim Aufrufer (siehe `generateDream`).
 *
 * **Timeout (Pflicht):** Node's globales `fetch` hat KEINEN Default-Timeout für
 * langsam tröpfelnde/halb-offene Verbindungen. Ohne harten Abbruch könnte eine
 * hängende Anfrage (z. B. nachts 04:20 auf einem gerade aufwachenden Host) den
 * `withDreamLock`-Guard dauerhaft auf `busy` halten und den Scheduler nie wieder
 * neu armen. Darum bekommt jeder Versuch einen eigenen `AbortController` mit
 * `config.minimax.timeoutMs`; ein etwaiges Aufrufer-`signal` wird mit
 * verknüpft. Ein Timeout wird zur normalen Rejection → Retry/Backoff bzw. das
 * `finally`-Reschedule des Schedulers greifen wie vorgesehen.
 */
export async function dreamText({ system, user, maxTokens, signal }: ChatOptions): Promise<string> {
  const key = config.minimax.apiKey;
  if (!key) throw new MinimaxNotConfiguredError();

  const effectiveMaxTokens = maxTokens ?? config.minimax.maxTokens;
  const body: Record<string, unknown> = {
    model: config.minimax.model,
    max_tokens: effectiveMaxTokens,
    temperature: config.minimax.temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (config.minimax.thinking) body.thinking = config.minimax.thinking;

  const timeoutMs = config.minimax.timeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(`${config.minimax.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) {
        throw new Error(`MiniMax-API Timeout nach ${Math.round(timeoutMs / 1000)}s (keine Antwort).`);
      }
      if (signal?.aborted) throw new Error('MiniMax-Anfrage abgebrochen.');
      throw new Error(`MiniMax-API nicht erreichbar: ${(e as Error).message}`);
    }

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = (await res.json()) as {
          error?: { message?: string };
          base_resp?: { status_msg?: string };
        };
        detail = errBody?.error?.message ?? errBody?.base_resp?.status_msg ?? JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`MiniMax-API ${res.status}: ${detail || res.statusText}`);
    }

    const data = (await res.json()) as ChatResponse;
    // MiniMax meldet logische Fehler teils mit HTTP 200 + base_resp.status_code != 0.
    if (data.base_resp && typeof data.base_resp.status_code === 'number' && data.base_resp.status_code !== 0) {
      throw new Error(
        `MiniMax-API Fehler ${data.base_resp.status_code}: ${data.base_resp.status_msg ?? 'unbekannt'}`,
      );
    }

    const choice = data.choices?.[0];
    const raw = (choice?.message?.content ?? '').trim();
    const text = stripThinking(raw);
    if (!text) {
      // Reasoning-Modell: Denken kann das Token-Budget aufgebraucht haben →
      // leerer/abgeschnittener Content. Klarer, nicht retry-barer Fehler statt
      // generischem „leer" (spart die sinnlosen Backoff-Retries).
      if (choice?.finish_reason === 'length') throw new MinimaxTruncatedError(effectiveMaxTokens);
      throw new Error('Leere Antwort von MiniMax (kein Auswertungstext).');
    }
    return text;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onCallerAbort);
  }
}
