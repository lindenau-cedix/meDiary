import { config } from '../config.js';

/**
 * Minimaler Anthropic-Messages-API-Client über `fetch` (Node 18+ global, keine
 * neue Dependency — wie die Cloudflare-Access-Prüfung node:crypto nutzt statt
 * einer Bibliothek). Genutzt für die KI-Tagebuch-Generierung.
 *
 * Endpunkt:  POST {baseUrl}/v1/messages
 * Header:    x-api-key, anthropic-version: 2023-06-01, content-type
 * Modell:    config.anthropic.model (Default claude-opus-4-8)
 *
 * Keine `temperature`/`thinking`-Parameter — auf Opus 4.8 sind Sampling-Parameter
 * entfernt (würden 400 liefern); adaptives Denken ist für kurzen Tagebuch-Text
 * nicht nötig.
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
export async function generateText({ system, prompt, maxTokens = 1024 }: GenerateOptions): Promise<string> {
  const key = config.anthropic.apiKey;
  if (!key) throw new AnthropicNotConfiguredError();

  let res: Response;
  try {
    res = await fetch(`${config.anthropic.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
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
  if (!text) throw new Error('Leere Antwort von der KI.');
  return text;
}
