import { config } from '../config.js';
import {
  DB_TOOLS,
  runInspectSchema,
  runReadQuery,
  validateOperations,
  type ChangeOperation,
} from './chat_tools.js';

/**
 * Agentische Anthropic-Messages-Schleife gegen den **Anthropic-kompatiblen**
 * MiniMax-Endpunkt (`POST {baseUrl}/v1/messages`, baseUrl endet auf `/anthropic`).
 * Hand-gerollt über `fetch` — bewusst dependency-frei, konsistent mit
 * `lib/anthropic.ts` und `lib/minimax.ts`.
 *
 * Korrekt umgesetzte M3-Stolperfallen (siehe Skill-Brief):
 *  - **Agent-Loop selbst fahren:** bei `tool_use` das Werkzeug ausführen (NUR
 *    Lese-Tools; `propose_change_set` führt nichts aus), `tool_result` anhängen
 *    und erneut aufrufen, bis das Modell ohne weiteres Tool antwortet.
 *  - **Vollständigen `content` an die Historie anhängen** (ALLE Blöcke), nicht
 *    nur den Text.
 *  - **`thinking`-Blöcke unverändert bewahren** (inkl. `signature`), sonst
 *    bricht die Kette in Folge-Runden.
 *  - `mcp_servers` wird ignoriert → Tools sind hier direkt implementiert.
 *  - `top_k`/`stop_sequences` werden ignoriert → wir verlassen uns nicht darauf.
 *  - **Streaming** an die UI: bevorzugt echtes SSE vom Endpunkt; liefert er
 *    stattdessen eine JSON-Antwort, degradiert der Parser sauber (ein
 *    `onText`-Aufruf mit dem Volltext).
 */

const ANTHROPIC_VERSION = '2023-06-01';

export class ChatNotConfiguredError extends Error {
  constructor() {
    super('Daten-Konsole nicht konfiguriert — CHAT_API_KEY oder MINIMAX_API_KEY in der .env setzen.');
    this.name = 'ChatNotConfiguredError';
  }
}

export function chatAvailable(): boolean {
  return !!config.chat.apiKey;
}

export function chatModel(): string {
  return config.chat.model;
}

// ───────────────────────── Anthropic-Content-Typen ─────────────────────────

interface TextBlock {
  type: 'text';
  text: string;
}
interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | (ContentBlock | ToolResultBlock)[];
}

interface StreamResult {
  content: ContentBlock[];
  stopReason: string | null;
}

// ───────────────────────── Ein Modell-Aufruf (streamend) ─────────────────────────

interface CallOptions {
  system: string;
  messages: Message[];
  onText: (delta: string) => void;
  onThinking?: (delta: string) => void;
  signal?: AbortSignal;
}

/**
 * Ein Messages-Call. Sendet `stream:true`; parst die SSE-Antwort inkrementell
 * (und ruft `onText` je Text-Delta). Liefert der Endpunkt stattdessen
 * `application/json`, wird die Antwort als gewöhnliche Messages-Antwort gelesen.
 * Gibt den rekonstruierten `content` (alle Blöcke, inkl. thinking mit signature)
 * plus `stop_reason` zurück.
 */
async function callMessages({ system, messages, onText, onThinking, signal }: CallOptions): Promise<StreamResult> {
  const key = config.chat.apiKey;
  if (!key) throw new ChatNotConfiguredError();

  const body: Record<string, unknown> = {
    model: config.chat.model,
    max_tokens: config.chat.maxTokens,
    system,
    tools: DB_TOOLS,
    messages,
    stream: true,
  };
  if (config.chat.thinking) body.thinking = config.chat.thinking;

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.chat.timeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(`${config.chat.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) throw new Error(`Modell-Timeout nach ${Math.round(config.chat.timeoutMs / 1000)}s.`);
      if (signal?.aborted) throw new Error('Anfrage abgebrochen.');
      throw new Error(`Modell-API nicht erreichbar: ${(e as Error).message}`);
    }

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        detail = errBody?.error?.message ?? JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`Modell-API ${res.status}: ${detail || res.statusText}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !res.body) {
      // Degradierter Pfad: gewöhnliche JSON-Antwort.
      return parseJsonResponse(await res.json(), onText, onThinking);
    }
    return await parseSseStream(res.body, onText, onThinking);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** Nicht-streamende Messages-Antwort in unser StreamResult überführen. */
function parseJsonResponse(
  data: unknown,
  onText: (s: string) => void,
  onThinking?: (s: string) => void,
): StreamResult {
  const d = data as { content?: unknown[]; stop_reason?: string };
  const content: ContentBlock[] = [];
  for (const raw of d.content ?? []) {
    const b = raw as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      content.push({ type: 'text', text: b.text });
      onText(b.text);
    } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
      const tb: ThinkingBlock = { type: 'thinking', thinking: b.thinking };
      if (typeof b.signature === 'string') tb.signature = b.signature;
      content.push(tb);
      onThinking?.(b.thinking);
    } else if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
      content.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} });
    }
  }
  return { content, stopReason: d.stop_reason ?? null };
}

/** Inkrementeller SSE-Parser für das Anthropic-Streaming-Event-Format. */
async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onText: (s: string) => void,
  onThinking?: (s: string) => void,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Blöcke nach Stream-Index; `_json` akkumuliert tool_use-Argumente.
  const blocks: (ContentBlock & { _json?: string })[] = [];
  let stopReason: string | null = null;

  const handleEvent = (dataStr: string) => {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(dataStr);
    } catch {
      return;
    }
    const type = evt.type as string;
    if (type === 'content_block_start') {
      const idx = evt.index as number;
      const cb = evt.content_block as Record<string, unknown>;
      if (cb.type === 'text') blocks[idx] = { type: 'text', text: '' };
      else if (cb.type === 'thinking') blocks[idx] = { type: 'thinking', thinking: '', signature: '' };
      else if (cb.type === 'tool_use')
        blocks[idx] = { type: 'tool_use', id: String(cb.id), name: String(cb.name), input: {}, _json: '' };
    } else if (type === 'content_block_delta') {
      const idx = evt.index as number;
      const delta = evt.delta as Record<string, unknown>;
      const block = blocks[idx];
      if (!block) return;
      if (delta.type === 'text_delta' && block.type === 'text') {
        block.text += String(delta.text ?? '');
        onText(String(delta.text ?? ''));
      } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
        block.thinking += String(delta.thinking ?? '');
        onThinking?.(String(delta.thinking ?? ''));
      } else if (delta.type === 'signature_delta' && block.type === 'thinking') {
        block.signature = (block.signature ?? '') + String(delta.signature ?? '');
      } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
        block._json = (block._json ?? '') + String(delta.partial_json ?? '');
      }
    } else if (type === 'content_block_stop') {
      const idx = evt.index as number;
      const block = blocks[idx];
      if (block?.type === 'tool_use') {
        try {
          block.input = block._json ? JSON.parse(block._json) : {};
        } catch {
          block.input = {};
        }
        delete block._json;
      }
    } else if (type === 'message_delta') {
      const delta = evt.delta as { stop_reason?: string } | undefined;
      if (delta?.stop_reason) stopReason = delta.stop_reason;
    } else if (type === 'error') {
      const err = evt.error as { message?: string } | undefined;
      throw new Error(`Modell-Stream-Fehler: ${err?.message ?? 'unbekannt'}`);
    }
  };

  // SSE: Events durch Leerzeile getrennt; jede `data:`-Zeile trägt JSON.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      // Mehrere data:-Zeilen eines Events gemäß SSE-Spec mit \n verbinden,
      // dann das (Anthropic-typische Einzeilen-)JSON einmal verarbeiten.
      const dataLines: string[] = [];
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.replace(/\r$/, '');
        if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).replace(/^ /, ''));
      }
      if (dataLines.length) handleEvent(dataLines.join('\n'));
    }
  }

  const content: ContentBlock[] = blocks
    .filter(Boolean)
    .map((b) => {
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      if (b.type === 'thinking') {
        const tb: ThinkingBlock = { type: 'thinking', thinking: b.thinking };
        if (b.signature) tb.signature = b.signature; // nur mit echter Signatur weiterreichen
        return tb;
      }
      return { type: 'text', text: b.text };
    });
  return { content, stopReason };
}

// ───────────────────────── Agent-Schleife ─────────────────────────

export interface ProposalInput {
  title: string;
  summary: string | null;
  operations: ChangeOperation[];
}

export interface AgentCallbacks {
  /** Text-Delta des Modells (an die UI streamen). */
  onText: (delta: string) => void;
  /** Reasoning-Delta (optional, für eine dezente „denkt nach"-Anzeige). */
  onThinking?: (delta: string) => void;
  /** Ein Lese-/Vorschlags-Werkzeug startet. */
  onToolStart: (name: string, info: string) => void;
  /** Ergebnis eines Lese-Werkzeugs (kurze Zusammenfassung für die UI). */
  onToolResult: (name: string, summary: string) => void;
  /**
   * Gültiges Change-Set wurde vorgeschlagen. Der Router persistiert es,
   * berechnet die Vorschau und liefert die id zurück (oder einen Fehler, der
   * dem Modell als tool_result zur Korrektur zurückgegeben wird).
   */
  onProposal: (p: ProposalInput) => Promise<{ id: number; affected: number } | { error: string }>;
}

export interface AgentRunResult {
  finalText: string;
  proposals: number;
  steps: number;
}

/**
 * Fährt die Agent-Schleife: ruft das Modell, führt Lese-Tools aus, reicht
 * Vorschläge an den Router weiter und wiederholt, bis das Modell ohne Tool-Use
 * antwortet (oder `maxSteps`/Proposal-Limit erreicht ist).
 */
export async function runChatAgent(
  system: string,
  initialMessages: Message[],
  cb: AgentCallbacks,
  signal?: AbortSignal,
): Promise<AgentRunResult> {
  const messages: Message[] = [...initialMessages];
  let finalText = '';
  let proposals = 0;
  let steps = 0;
  const MAX_PROPOSALS = 4;

  for (steps = 1; steps <= config.chat.maxSteps; steps++) {
    const { content } = await callMessages({
      system,
      messages,
      onText: cb.onText,
      onThinking: cb.onThinking,
      signal,
    });

    // Vollständigen Assistant-Content an die Historie anhängen (alle Blöcke).
    messages.push({ role: 'assistant', content });

    const toolUses = content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    finalText = content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (toolUses.length === 0) break; // finale Textantwort

    const toolResults: ToolResultBlock[] = [];
    for (const tu of toolUses) {
      toolResults.push(await executeTool(tu, cb, () => proposals, () => proposals++, MAX_PROPOSALS));
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { finalText: finalText.trim(), proposals, steps };
}

async function executeTool(
  tu: ToolUseBlock,
  cb: AgentCallbacks,
  getProposals: () => number,
  incProposals: () => void,
  maxProposals: number,
): Promise<ToolResultBlock> {
  const ok = (content: string): ToolResultBlock => ({ type: 'tool_result', tool_use_id: tu.id, content });
  const err = (content: string): ToolResultBlock => ({ type: 'tool_result', tool_use_id: tu.id, content, is_error: true });

  try {
    if (tu.name === 'inspect_schema') {
      cb.onToolStart('inspect_schema', 'Schema lesen');
      const schema = runInspectSchema();
      cb.onToolResult('inspect_schema', `${schema.tables.length} Tabellen`);
      return ok(JSON.stringify(schema));
    }

    if (tu.name === 'run_read_query') {
      const sql = String((tu.input as { sql?: unknown })?.sql ?? '').trim();
      cb.onToolStart('run_read_query', sql);
      const result = runReadQuery(sql);
      cb.onToolResult('run_read_query', `${result.rowCount} Zeile${result.rowCount === 1 ? '' : 'n'}`);
      return ok(JSON.stringify(result));
    }

    if (tu.name === 'propose_change_set') {
      const input = tu.input as { title?: unknown; summary?: unknown; operations?: unknown };
      if (getProposals() >= maxProposals) {
        return err('Maximale Anzahl Vorschläge pro Anfrage erreicht. Bitte das bestehende Change-Set zuerst prüfen.');
      }
      const validated = validateOperations(input.operations);
      if (!validated.ok) {
        cb.onToolStart('propose_change_set', 'ungültig');
        return err(validated.error);
      }
      const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Änderung';
      const summary = typeof input.summary === 'string' && input.summary.trim() ? input.summary.trim() : null;
      cb.onToolStart('propose_change_set', title);
      const res = await cb.onProposal({ title, summary, operations: validated.operations });
      if ('error' in res) return err(res.error);
      incProposals();
      return ok(
        `Change-Set #${res.id} wurde erstellt und wird der Person zur Bestätigung angezeigt ` +
          `(${res.affected} betroffene Zeile${res.affected === 1 ? '' : 'n'}). Schlage keine weiteren Änderungen vor; ` +
          `fasse in einem Satz zusammen, was zu prüfen ist.`,
      );
    }

    return err(`Unbekanntes Werkzeug: ${tu.name}`);
  } catch (e) {
    cb.onToolResult(tu.name, `Fehler: ${(e as Error).message}`);
    return err(`Fehler beim Ausführen von ${tu.name}: ${(e as Error).message}`);
  }
}
