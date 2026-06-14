import { config } from '../config.js';

/**
 * Minimaler Anthropic-(kompatibler) Messages-API-Client über `fetch` (Node 18+
 * global, keine neue Dependency — wie die Cloudflare-Access-Prüfung node:crypto
 * nutzt statt einer Bibliothek). Genutzt für die KI-Tagebuch-Generierung.
 *
 * Funktioniert sowohl gegen die offizielle Anthropic-API als auch gegen
 * Anthropic-kompatible Drittanbieter wie MiniMax (gleiches Wire-Format) —
 * gesteuert über `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` + `DIARY_MODEL`.
 *
 * Endpunkt:  POST {baseUrl}/v1/messages
 * Header:    x-api-key (normaler API-Key, KEIN OAuth-Bearer), anthropic-version,
 *            content-type
 * Modell:    config.anthropic.model (Default claude-opus-4-8; für MiniMax z. B.
 *            DIARY_MODEL=MiniMax-M2)
 *
 * `thinking`: per `config.anthropic.thinking` (Default `{ type: 'adaptive' }`).
 * Adaptives Denken ist gültig auf Anthropic (Opus 4.6+/Sonnet 4.6) UND auf
 * MiniMax — nur `{ type: 'enabled', budget_tokens }` und Sampling-Parameter
 * (`temperature`/`top_p`) würden auf Opus 4.8 mit 400 abgelehnt; adaptive nicht.
 * Etwaige `thinking`-Blöcke in der Antwort werden ignoriert — wir extrahieren
 * nur die `text`-Blöcke.
 * `max_tokens`: per `config.anthropic.maxTokens` (DIARY_MAX_TOKENS).
 */

const ANTHROPIC_VERSION = '2023-06-01';

/** Wird geworfen, wenn kein API-Key konfiguriert ist (Route → 503). */
export class AnthropicNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY ist nicht konfiguriert — KI-Tagebuch deaktiviert.');
    this.name = 'AnthropicNotConfiguredError';
  }
}

/** True, wenn ein API-Key hinterlegt ist (für UI-Hinweis / Route-Vorprüfung). */
export function anthropicAvailable(): boolean {
  return !!config.anthropic.apiKey;
}

export function anthropicModel(): string {
  return config.anthropic.model;
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string } | null;
}

interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Erzeugt Text über die Messages-API und liefert den zusammengefügten
 * Text-Block zurück. Wirft bei fehlendem Key, HTTP-Fehler, Refusal oder leerer
 * Antwort (die Aufrufer behandeln das pro Tag).
 */
export async function generateText({ system, prompt, maxTokens }: GenerateOptions): Promise<string> {
  const key = config.anthropic.apiKey;
  if (!key) throw new AnthropicNotConfiguredError();

  const body: Record<string, unknown> = {
    model: config.anthropic.model,
    max_tokens: maxTokens ?? config.anthropic.maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  // Adaptives Denken (oder per DIARY_THINKING konfiguriert); weggelassen, wenn null.
  if (config.anthropic.thinking) body.thinking = config.anthropic.thinking;

  let res: Response;
  try {
    res = await fetch(`${config.anthropic.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Anthropic-API nicht erreichbar: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Anthropic-API ${res.status}: ${detail || res.statusText}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  // Safety-Klassifikator kann ablehnen (HTTP 200, stop_reason "refusal").
  if (data.stop_reason === 'refusal') {
    throw new Error('Die KI hat die Erzeugung für diesen Tag abgelehnt (Sicherheitsfilter).');
  }
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  if (!text) {
    // Mit adaptivem Denken kann ein zu knappes max_tokens komplett ins Denken
    // fließen, sodass kein Text mehr übrig bleibt (stop_reason "max_tokens").
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        'Antwort abgeschnitten, bevor Text kam (max_tokens erreicht) — DIARY_MAX_TOKENS erhöhen.',
      );
    }
    throw new Error('Leere Antwort von der KI.');
  }
  return text;
}
