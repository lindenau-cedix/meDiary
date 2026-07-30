import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import {
  db,
  insertChangeSet,
  changeSetById,
  listChangeSets,
  latestAppliedChangeSet,
  markChangeSetApplied,
  markChangeSetUndone,
  markChangeSetDiscarded,
  type ChatChangeSetRow,
} from '../db.js';
import { nowLocalISO } from '../lib/time.js';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import { runChatAgent, chatAvailable, chatModel, ChatNotConfiguredError } from '../lib/chat_agent.js';
import {
  runInspectSchema,
  previewOperations,
  applyOperations,
  restoreSnapshot,
  validateOperations,
  type ChangeSnapshot,
} from '../lib/chat_tools.js';

export const chatRouter = Router();

/**
 * "Data console" (Chat with your data) — agentic natural-language console.
 *
 * Security model (see lib/chat_tools.ts): reads run read-only; writes ONLY
 * happen through typed, pre-validated change-sets that the human confirms in
 * the UI. The mutating endpoints (model call, apply, undo, discard) are — like
 * `POST /api/intakes/text` — protected by Cloudflare Access (fail-closed;
 * `CF_ACCESS_DISABLED=true` as an explicit local bypass) and additionally
 * rate-limited. The read endpoints (status, list) are open like the rest of
 * the private API.
 */

// ───────────────────────── Serialisation ─────────────────────────

function serializeChangeSet(row: ChatChangeSetRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    undoneAt: row.undone_at,
    status: row.status,
    prompt: row.prompt,
    title: row.title,
    summary: row.summary,
    affected: row.affected,
    operations: safeParse(row.operations) ?? [],
    preview: safeParse(row.preview),
  };
}

function safeParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ───────────────────────── System prompt ─────────────────────────

/**
 * Builds the system prompt with the LIVE introspected schema. M3 has a
 * 1M context window, so the full schema fits comfortably in the prompt; the
 * `inspect_schema` tool remains available for detail questions.
 */
function buildSystemPrompt(): string {
  const schema = runInspectSchema();
  const today = nowLocalISO().slice(0, 10);
  const schemaText = schema.tables
    .map(
      (t) =>
        `- ${t.name} (${t.rowCount} Zeilen): ` +
        t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' PK' : ''}`).join(', '),
    )
    .join('\n');

  return [
    'Du bist die Daten-Konsole von „meDiary", einem persönlichen Medikations-Tagebuch (Einzelnutzer).',
    'Du hilfst, Daten zu untersuchen und Massen-Korrekturen vorzunehmen, die über die normale UI nicht ',
    'möglich sind (Substanzen zusammenführen, Einnahmen nachtragen/löschen/verschieben, Zeitzonen-Fehler ',
    'korrigieren, in Mengen umbenennen). Antworte knapp, präzise und auf Deutsch.',
    '',
    `Heutiges Datum: ${today} (lokale Zeit, Europe/Berlin).`,
    '',
    'DB-Schema (Lesen frei über run_read_query; Schreiben NUR über propose_change_set):',
    schemaText,
    '',
    'Wichtige Semantik:',
    ...schema.notes.map((n) => `- ${n}`),
    '',
    'Arbeitsweise:',
    '1. Verstehe die Anfrage. Bei Unklarheit (welche Substanz? welcher Zeitraum?) FRAGE NACH, statt destruktiv zu raten.',
    '2. Untersuche mit run_read_query die betroffenen Zeilen, BEVOR du Änderungen vorschlägst — so wird die Vorschau korrekt.',
    '3. Für reine Fragen genügt Lesen + eine klare Antwort (Zahlen ggf. als kompakte Liste).',
    '4. Für Änderungen rufe genau EINMAL propose_change_set mit typisierten Operationen auf. Du führst nichts aus — ',
    '   der Mensch sieht eine Vorschau (betroffene Zeilen + before→after) und bestätigt selbst. Schreibe vorher kurz, was du vorschlägst.',
    '5. Wähle Filter so eng wie die Anfrage es verlangt. Ein leerer Filter trifft ALLE Einnahmen.',
    '',
    'Du kannst KEIN Schreib-SQL ausführen und keine Daten ohne Bestätigung verändern. Sicherheit ist garantiert ',
    'durch das Design — verhalte dich entsprechend vertrauenswürdig und transparent.',
  ].join('\n');
}

// ───────────────────────── Status ─────────────────────────

chatRouter.get('/status', (_req, res) => {
  res.json({ available: chatAvailable(), model: chatAvailable() ? chatModel() : null });
});

// ───────────────────────── Read change sets ─────────────────────────

chatRouter.get('/change-sets', (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const rows = listChangeSets({ limit: Number.isFinite(limit) ? limit : 30 });
  const latest = latestAppliedChangeSet();
  res.json({
    changeSets: rows.map(serializeChangeSet),
    latestAppliedId: latest?.id ?? null,
    available: chatAvailable(),
  });
});

chatRouter.get('/change-sets/:id', (req, res) => {
  const row = changeSetById(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Change-Set nicht gefunden' });
  res.json({ changeSet: serializeChangeSet(row), latestAppliedId: latestAppliedChangeSet()?.id ?? null });
});

// ───────────────────────── Chat message (SSE) ─────────────────────────

let lastMessageAt = 0;

const messageSchema = z.object({
  message: z.string().trim().min(1, 'Message must not be empty').max(4000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .max(40)
    .optional(),
});

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post('/message', requireCloudflareAccess, async (req, res) => {
  if (!chatAvailable()) {
    return res.status(503).json({
      error: 'Data console not configured. Set CHAT_API_KEY (or MINIMAX_API_KEY) in the .env.',
    });
  }

  const minInterval = config.chat.minIntervalMs;
  if (minInterval > 0) {
    const since = Date.now() - lastMessageAt;
    if (since < minInterval) {
      return res.status(429).json({
        error: `Too many requests — please wait.`,
        retryAfterMs: minInterval - since,
      });
    }
  }
  lastMessageAt = Date.now();

  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { message, history } = parsed.data;

  // Set SSE headers and flush immediately.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // against proxy buffering (nginx)
  res.flushHeaders?.();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  // History (text turns only) + new message → messages.
  const messages = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.text })),
    { role: 'user' as const, content: message },
  ];

  try {
    const result = await runChatAgent(
      buildSystemPrompt(),
      messages,
      {
        onText: (delta) => sse(res, 'token', { text: delta }),
        onThinking: (delta) => sse(res, 'thinking', { text: delta }),
        onToolStart: (name, info) => sse(res, 'tool', { phase: 'start', name, info }),
        onToolResult: (name, summary) => sse(res, 'tool', { phase: 'result', name, summary }),
        onProposal: async ({ title, summary, operations }) => {
          try {
            const preview = previewOperations(operations);
            const row = insertChangeSet({
              prompt: message,
              title,
              summary,
              operations,
              preview,
              affected: preview.totalAffected,
            });
            sse(res, 'changeset', { changeSet: serializeChangeSet(row) });
            return { id: row.id, affected: preview.totalAffected };
          } catch (e) {
            return { error: `Preview could not be computed: ${(e as Error).message}` };
          }
        },
      },
      controller.signal,
    );
    sse(res, 'done', { finalText: result.finalText, proposals: result.proposals });
  } catch (e) {
    if (e instanceof ChatNotConfiguredError) sse(res, 'error', { error: e.message });
    else if (controller.signal.aborted) {
      /* Client gone — nothing more to send. */
    } else sse(res, 'error', { error: (e as Error).message });
  } finally {
    res.end();
  }
});

// ───────────────────────── Apply / Undo / Discard ─────────────────────────

/** Status conflict (e.g. already applied / no longer most recent) → HTTP 409. */
class ChangeSetConflict extends Error {}

/**
 * Apply in ONE (nested) transaction. The status and validity check happens
 * AUTHORITATIVELY INSIDE the transaction — the pre-check in the route only
 * returns the friendly error message. This ensures a change-set cannot be
 * applied twice even with (future) concurrent/async callers (TOCTOU closed):
 * whoever loses the race sees status≠'proposed' and aborts.
 */
const applyChangeSetTxn = db.transaction((id: number) => {
  const row = changeSetById(id);
  if (!row) throw new ChangeSetConflict('Change set not found.');
  if (row.status !== 'proposed') {
    throw new ChangeSetConflict(`Change set is already "${row.status}" — cannot apply again.`);
  }
  const validated = validateOperations(safeParse(row.operations));
  if (!validated.ok) throw new Error(validated.error);
  const { affected, snapshot } = applyOperations(validated.operations);
  markChangeSetApplied(id, snapshot, affected);
  return affected;
});

chatRouter.post('/change-sets/:id/apply', requireCloudflareAccess, (req, res) => {
  const id = Number(req.params.id);
  const row = changeSetById(id);
  if (!row) return res.status(404).json({ error: 'Change set not found' });
  if (row.status !== 'proposed') {
    return res.status(409).json({ error: `Change set is already "${row.status}" — cannot apply again.` });
  }
  const validated = validateOperations(safeParse(row.operations));
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  try {
    const affected = applyChangeSetTxn(id);
    res.json({
      changeSet: serializeChangeSet(changeSetById(id)!),
      affected,
      latestAppliedId: latestAppliedChangeSet()?.id ?? null,
    });
  } catch (e) {
    if (e instanceof ChangeSetConflict) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: `Apply failed: ${(e as Error).message}` });
  }
});

/**
 * Undo in ONE transaction with authoritative re-check: status must still be
 * 'applied' AND it must be the most recently applied set. This closes the
 * window in which two parallel undos would both pass the pre-check and
 * restoreSnapshot would run twice.
 */
const undoChangeSetTxn = db.transaction((id: number) => {
  const row = changeSetById(id);
  if (!row || row.status !== 'applied') throw new ChangeSetConflict('Change set is not (or no longer) applied.');
  const latest = latestAppliedChangeSet();
  if (!latest || latest.id !== id) {
    throw new ChangeSetConflict('Only the most recently applied change can be undone.');
  }
  const snapshot = safeParse(row.undo_snapshot) as ChangeSnapshot | null;
  if (!snapshot) throw new Error('No undo snapshot present.');
  restoreSnapshot(snapshot);
  markChangeSetUndone(id);
});

chatRouter.post('/change-sets/:id/undo', requireCloudflareAccess, (req, res) => {
  const id = Number(req.params.id);
  const row = changeSetById(id);
  if (!row) return res.status(404).json({ error: 'Change set not found' });
  if (row.status !== 'applied') {
    return res.status(409).json({ error: `Only applied change sets can be undone (status: ${row.status}).` });
  }
  const latest = latestAppliedChangeSet();
  if (!latest || latest.id !== id) {
    return res.status(409).json({ error: 'Only the most recently applied change can be undone.' });
  }

  try {
    undoChangeSetTxn(id);
    res.json({
      changeSet: serializeChangeSet(changeSetById(id)!),
      latestAppliedId: latestAppliedChangeSet()?.id ?? null,
    });
  } catch (e) {
    if (e instanceof ChangeSetConflict) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: `Undo failed: ${(e as Error).message}` });
  }
});

chatRouter.post('/change-sets/:id/discard', requireCloudflareAccess, (req, res) => {
  const id = Number(req.params.id);
  const row = changeSetById(id);
  if (!row) return res.status(404).json({ error: 'Change set not found' });
  if (row.status !== 'proposed') {
    return res.status(409).json({ error: `Change set is "${row.status}" — nothing to discard.` });
  }
  markChangeSetDiscarded(id);
  res.json({ changeSet: serializeChangeSet(changeSetById(id)!) });
});
