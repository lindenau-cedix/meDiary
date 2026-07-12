/**
 * Traum-Zustellung — Orchestrator zwischen `dreams` (Inhalt) und
 * `whatsapp` + `elevenlabs` (Versand). Reine text-only Zustellung ist
 * möglich; die Sprachnotiz (ElevenLabs MP3 → OGG/Opus) ist ein optionaler,
 * zweiter Schritt, dessen Fehler die Text-Zustellung NICHT rückgängig macht
 * (voice_status='failed', status='sent').
 *
 * Idempotenz: pro (dream_date, target_id) gibt es GENAU EINE Zeile in
 * `dream_deliveries` (uq-Index). Wiederholte Triggers (Scheduler + manueller
 * CLI + Admin-„redeliver") erhöhen nur `attempts` und überschreiben status.
 *
 * Failure-Containment: kein Promise in dieser Datei wirft nach oben — Fehler
 * werden in der DB-Zeile festgehalten und datensparsam geloggt (keine
 * Empfänger-PN, keine Inhalte).
 */
import { config } from '../config.js';
import {
  dreamFor,
  listDeliveryTargets,
  getDeliveryTargetById,
  insertOrGetDelivery,
  updateDeliveryResult,
  listDeliveries,
  failedDeliveriesToRetry,
  nowLocalISO,
  type DreamRow,
  type DeliveryTargetRow,
  type DreamDeliveryRow,
} from '../db.js';
import * as whatsapp from './whatsapp.js';
import * as elevenlabs from './elevenlabs.js';

/* ------------------------------------------------------------------ *
 * Typen für den Format-Transformer
 * ------------------------------------------------------------------ */

export interface DreamSection {
  type: 'heading' | 'paragraph' | 'list' | 'quote';
  text: string;
}

export interface FormattedDream {
  text: string;
  sections: DreamSection[];
  truncated: boolean;
}

/* ------------------------------------------------------------------ *
 * Format-Transformer (Markdown → WhatsApp)
 * ------------------------------------------------------------------ */

/**
 * Bereitet den Traum-Text für WhatsApp auf. Reine Funktion — keine I/O, kein
 * State. Liefert sowohl den versendbaren Text (WhatsApp-Markdown via `*…*`,
 * `~…~`, ``` `…` ```) als auch eine leichte Struktur-Sektionen-Liste, falls
 * der Aufrufer sie für Vorschau/UI braucht.
 *
 * Pipeline:
 *   1. CRLF → LF
 *   2. `<think>…</think>`-Blöcke entfernen (defense-in-depth — die
 *      Dream-Generierung filtert das schon, aber wir sind paranoid).
 *   3. Pro Zeile: Code-Fences (` ``` `) erhalten ihren Inhalt unverändert.
 *      Überschriften werden zu `*…*` (WhatsApp-Bold). Listen werden auf
 *      `- …` normalisiert. Zitate bleiben `> …`.
 *   4. 3+ Leerzeilen → 2 Leerzeilen.
 *   5. Harter Cut bei > 4000 Zeichen am letzten Satz-/Paragraph-Ende, mit
 *      `… (gekürzt)`-Marker.
 */
export function formatDreamForWhatsApp(content: string): FormattedDream {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<\/?think>/g, '');

  const outLines: string[] = [];
  const sections: DreamSection[] = [];
  let inFence = false;

  for (const rawLine of normalized.split('\n')) {
    // Code-Fence-Toggle: ``` oder ```lang — wir geben den fence unverändert
    // aus und überspringen die Section-Erfassung, solange wir drin sind.
    const fenceMatch = /^```(\w*)\s*$/.exec(rawLine);
    if (fenceMatch) {
      inFence = !inFence;
      outLines.push(rawLine);
      continue;
    }
    if (inFence) {
      outLines.push(rawLine);
      continue;
    }

    const line = rawLine.replace(/[ \t]+$/, '');

    // Überschrift: # … ###### … → *…* (WhatsApp-Bold).
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      outLines.push(`*${text}*`);
      sections.push({ type: 'heading', text });
      continue;
    }

    // Innerhalb einer Zeile **bold** → *bold*. Wir greifen VOR der Listen-
    // Erkennung, damit eine `* … *`-Aufzählung (selten, aber valide) nicht
    // fälschlicherweise als Bold interpretiert wird.
    let line2 = line.replace(/\*\*([\s\S]+?)\*\*/g, '*$1*');

    // Ungeordnete Liste: `- …` oder `* …` (aber NICHT `*…*`-Inline-Bold).
    // Heuristik: Bullet muss am Zeilenanfang nach Whitespace stehen.
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line2);
    if (bullet) {
      const text = `- ${bullet[1].trim()}`;
      outLines.push(text);
      sections.push({ type: 'list', text });
      continue;
    }

    // Geordnete Liste: 1. … / 2. …
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line2);
    if (ordered) {
      const text = ordered[0].trim();
      outLines.push(text);
      sections.push({ type: 'list', text });
      continue;
    }

    // Zitat: > …
    const quote = /^>\s?(.*)$/.exec(line2);
    if (quote) {
      const text = quote[0].trim();
      outLines.push(text);
      sections.push({ type: 'quote', text });
      continue;
    }

    if (line2.trim() === '') {
      outLines.push('');
      continue;
    }

    sections.push({ type: 'paragraph', text: line2.trim() });
    outLines.push(line2);
  }

  // 3+ Leerzeilen → 2 Leerzeilen.
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const l of outLines) {
    if (l === '') {
      blankRun++;
      if (blankRun > 2) continue;
    } else {
      blankRun = 0;
    }
    collapsed.push(l);
  }
  // Trim trailing blanks (sonst hagelt es Leerzeilen ans Ende).
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();

  let text = collapsed.join('\n');
  let truncated = false;
  if (text.length > 4000) {
    const CUT = 3985;
    const window = text.slice(0, CUT);
    // Letzte sinnvolle Grenze: doppelte Newline (Paragraph), sonst Satzende.
    let cutAt = window.lastIndexOf('\n\n');
    if (cutAt < 200) cutAt = window.lastIndexOf('. ');
    if (cutAt < 200) cutAt = CUT;
    else cutAt += 2; // nach ".\s" o. "\n\n"
    text = text.slice(0, cutAt).trimEnd() + `\n\n… (gekürzt)`;
    truncated = true;
  }

  return { text, sections, truncated };
}

/**
 * Wandelt WhatsApp-Formatierung in Klartext für TTS. Caps bei
 * `config.delivery.voiceMaxChars` (Default 1500) und schneidet am letzten
 * Satzende, damit keine halbe Sprachnotiz entsteht.
 */
export function toSpeechText(text: string): string {
  const stripped = text
    .replace(/\*([^*\n]+)\*/g, '$1') // bold + italic
    .replace(/~([^~\n]+)~/g, '$1') // strikethrough
    .replace(/`([^`\n]+)`/g, '$1') // inline code
    .trim();

  const cap = (config.delivery?.voiceMaxChars ?? 1500) | 0;
  if (stripped.length <= cap) return stripped;
  const window = stripped.slice(0, cap);
  const lastDot = window.lastIndexOf('. ');
  const cutAt = lastDot >= 200 ? lastDot + 1 : cap;
  return window.slice(0, cutAt).trimEnd() + ' …';
}

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export interface DeliverySummary {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Verteilt einen fertigen Traum an alle aktiven Empfänger. Niemals throw —
 * Fehler pro Empfänger werden in der DB-Zeile festgehalten und im Log
 * datensparsam zusammengefasst.
 */
export async function enqueueDelivery(dream: DreamRow): Promise<DeliverySummary> {
  if (!config.delivery?.enabled) {
    console.log('[delivery] disabled — skipping');
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const targets = listDeliveryTargets(true);
  if (targets.length === 0) {
    console.log(`[delivery] no enabled targets — dream ${dream.date} gespeichert, nicht versendet`);
    return { attempted: 0, sent: 0, failed: 0 };
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (const target of targets) {
    attempted++;
    try {
      const row = await deliverDream(dream, target);
      if (row.status === 'sent') sent++;
      else if (row.status === 'failed') failed++;
    } catch (e) {
      failed++;
      console.error(
        `[delivery] unerwarteter Fehler für ${dream.date} → ${target.phone.slice(0, 4)}***: ${(e as Error).message}`,
      );
    }
  }

  console.log(
    `[delivery] ${dream.date}: ${sent}/${attempted} sent${failed ? `, ${failed} failed` : ''}`,
  );
  return { attempted, sent, failed };
}

/**
 * Verschickt einen Traum an EINEN Empfänger. Liefert die (aktualisierte)
 * DB-Zeile zurück. Bei bereits `status='sent'` ohne Retry-Signal ist die
 * Funktion ein No-Op (idempotent).
 *
 * Reihenfolge:
 *   1. Text senden (Pflicht). Schlägt fehl → status='failed', voice nicht
 *      versucht.
 *   2. Voice (optional): ElevenLabs MP3 → OGG/Opus → WhatsApp-Voice-Note.
 *      Schlägt fehl → status='sent', voice_status='failed' (Text ist da).
 */
export async function deliverDream(
  dream: DreamRow,
  target: DeliveryTargetRow,
): Promise<DreamDeliveryRow> {
  const formatted = formatDreamForWhatsApp(dream.content);
  const delivery = insertOrGetDelivery(dream.date, target.id, target.phone);

  // Idempotenz: bereits erfolgreich zugestellt → keine erneute Aktion.
  if (delivery.status === 'sent') {
    return delivery;
  }

  const now = nowLocalISO();
  const attempts = delivery.attempts + 1;
  // Vor dem Versuch auf pending setzen (UI sieht "läuft"), ohne sent_at zu
  // verlieren — das wird beim Erfolg unten neu gesetzt.
  updateDeliveryResult(delivery.id, {
    status: 'pending',
    attempts,
    error: null,
  });

  const jid = whatsapp.toJid(target.phone);
  let textErr: string | null = null;
  let voiceErr: string | null = null;

  // ---- Text ----
  try {
    await whatsapp.sendText(jid, formatted.text);
  } catch (e) {
    textErr = (e as Error).message;
  }

  // ---- Voice (nur wenn Text durch ist) ----
  if (textErr == null) {
    try {
      if (!elevenlabs.elevenlabsAvailable()) {
        throw new Error('ElevenLabs nicht konfiguriert (ELEVENLABS_API_KEY fehlt)');
      }
      const speech = toSpeechText(formatted.text);
      const mp3 = await elevenlabs.synthesize({ text: speech });
      const ogg = await elevenlabs.mp3ToOpusOgg(mp3);
      await whatsapp.sendVoiceNote(jid, ogg);
    } catch (e) {
      voiceErr = (e as Error).message;
    }
  }

  // ---- Final state ----
  let status: string;
  let voiceStatus: string;
  let error: string | null;
  let sentAt: string | null;

  if (textErr != null) {
    status = 'failed';
    voiceStatus = 'none';
    error = textErr;
    sentAt = null;
  } else if (voiceErr != null) {
    status = 'sent';
    voiceStatus = 'failed';
    error = voiceErr;
    sentAt = now;
  } else {
    status = 'sent';
    voiceStatus = 'sent';
    error = null;
    sentAt = now;
  }

  const updated = updateDeliveryResult(delivery.id, {
    status,
    voice_status: voiceStatus,
    attempts,
    error,
    sent_at: sentAt,
  });

  console.log(
    `[delivery] ${dream.date} → ${target.phone.slice(0, 4)}***: ${status}${
      voiceErr ? ` (voice: ${voiceErr.slice(0, 80)})` : ''
    }`,
  );

  return updated;
}

/**
 * Sweep beim Boot: alle `failed`-Zeilen innerhalb des Retry-Fensters, die
 * noch Versuche übrig haben, erneut anstoßen. Niemand muss dafür in der
 * UI klicken — das fängt Server-Restarts über der Nacht ab.
 */
export async function retryFailedDeliveries(): Promise<{
  retried: number;
  sent: number;
  abandoned: number;
}> {
  if (!config.delivery?.enabled) {
    return { retried: 0, sent: 0, abandoned: 0 };
  }

  // Boot-Race-Fix: Der Boot-Retry-Sweep läuft direkt nach app.listen(), also
  // fast gleichzeitig zum feuer-und-vergess `whatsapp.connect()` weiter oben.
  // Wenn wir jetzt schon deliverDream aufrufen, ist `state` noch `connecting`
  // und jeder sendText/sendVoiceNote wirft `WhatsappNotConnectedError`. Wir
  // warten bis zu 30 s auf den Handshake — danach ist der Sweep nur noch
  // für die nächste Boot-Runde sinnvoll (Skipping = idle fail-fast).
  try {
    const { connect, getStatus } = await import('./whatsapp.js');
    if (config.whatsapp?.enabled) {
      await connect();
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const s = await getStatus();
        if (s.state === 'connected' || s.state === 'disconnected') break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } catch (e) {
    console.warn('[delivery] WhatsApp-Connect vor Retry-Sweep fehlgeschlagen:', (e as Error).message);
  }

  const maxAttempts = config.delivery.maxAttempts | 0;
  const retentionDays = config.delivery.retentionDays | 0;
  const sinceMs = Date.now() - Math.max(1, retentionDays) * 86_400_000;
  const sinceIso = new Date(sinceMs).toISOString();

  const rows = failedDeliveriesToRetry(maxAttempts, sinceIso);
  let retried = 0;
  let sent = 0;
  let abandoned = 0;

  for (const row of rows) {
    const dream = dreamFor(row.dream_date);
    if (!dream) {
      console.warn(`[delivery] retry-skip ${row.dream_date}: Traum fehlt (gelöscht?)`);
      continue;
    }
    if (row.target_id == null) {
      console.warn(`[delivery] retry-skip ${row.dream_date}: keine target_id`);
      continue;
    }
    const target = getDeliveryTargetById(row.target_id);
    if (!target) {
      console.warn(`[delivery] retry-skip ${row.dream_date}: target_id=${row.target_id} unbekannt`);
      continue;
    }
    retried++;
    try {
      const updated = await deliverDream(dream, target);
      if (updated.status === 'sent') sent++;
      else if (updated.attempts >= maxAttempts) abandoned++;
    } catch (e) {
      console.error(
        `[delivery] retry-uncaught ${row.dream_date} → ${target.phone.slice(0, 4)}***: ${(e as Error).message}`,
      );
    }
  }

  console.log(
    `[delivery] retry sweep: ${retried} retried, ${sent} sent, ${abandoned} abandoned`,
  );
  return { retried, sent, abandoned };
}