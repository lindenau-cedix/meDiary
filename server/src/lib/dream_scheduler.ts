import { config } from '../config.js';
import { generateDream, catchUpDreams, type GenerateDreamResult } from './dreams.js';
import { minimaxAvailable } from './minimax.js';

/**
 * In-process-Scheduler für das nächtliche „Träumen". Feuert täglich um
 * `config.dream.time` (HH:MM) **lokale Wand­uhr** — der Host läuft in
 * Europe/Berlin, konsistent mit dem Rest der App (`time.ts` speichert lokale
 * Zeiten ohne Offset). Die Berechnung des nächsten Feuerzeitpunkts über eine
 * lokale `Date`-Konstruktion ist **DST-sicher** (kein UTC fest verdrahtet):
 * `new Date(y, m, d, hh, mm)` liefert den korrekten Epoch-Zeitpunkt auch über
 * Sommer-/Winterzeit-Wechsel hinweg.
 *
 * - **Idempotenz**: ein Traum pro Konsum-Tag (DB-PK auf `dreams.date`); ein
 *   bereits vorhandener Traum wird übersprungen (kein `force`).
 * - **Lock/Guard**: `withDreamLock` serialisiert Scheduler UND manuellen
 *   Trigger, sodass nie zwei API-Calls parallel laufen (z. B. bei Restart).
 * - **Retries/Backoff**: in `generateDream` (3 Versuche, exponentiell).
 */

let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

/** Wird geworfen, wenn bereits eine Traum-Generierung läuft. */
export class DreamBusyError extends Error {
  constructor() {
    super('Es läuft bereits eine Traum-Generierung.');
    this.name = 'DreamBusyError';
  }
}

/**
 * Serialisiert alle Traum-Generierungen (Scheduler + manueller Trigger).
 * Wirft `DreamBusyError`, wenn schon eine läuft.
 */
export async function withDreamLock<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new DreamBusyError();
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

/** Ist gerade eine Generierung aktiv? */
export function dreamBusy(): boolean {
  return busy;
}

/** Parst "HH:MM" → {hour, minute}; Fallback 04:20 bei ungültigem Wert. */
function parseTime(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }
  console.warn(`[dream] Ungültige DREAM_TIME "${s}" — nutze 04:20.`);
  return { hour: 4, minute: 20 };
}

/** Millisekunden bis zur nächsten lokalen HH:MM-Gelegenheit (mind. 1s in der Zukunft). */
export function msUntilNext(hour: number, minute: number, from: Date = new Date()): number {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, minute, 0, 0);
  if (next.getTime() <= from.getTime() + 1000) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - from.getTime();
}

async function fireAndReschedule(hour: number, minute: number): Promise<void> {
  try {
    const res: GenerateDreamResult = await withDreamLock(() => generateDream());
    if (res.status === 'created') {
      console.log(`[dream] Traum für ${res.date} erzeugt (${res.attempts} Versuch(e)).`);
    } else if (res.status === 'skipped') {
      console.log(`[dream] Traum für ${res.date} existiert bereits — übersprungen.`);
    } else {
      console.log(`[dream] Tag ${res.date} ohne Inhalt — kein Traum erzeugt.`);
    }
  } catch (e) {
    // Datensparsam: nur die Fehlermeldung, keine Payloads.
    console.error(`[dream] Generierung fehlgeschlagen: ${(e as Error).message}`);
  } finally {
    schedule(hour, minute);
  }
}

function schedule(hour: number, minute: number): void {
  if (timer) clearTimeout(timer);
  const delay = msUntilNext(hour, minute);
  timer = setTimeout(() => void fireAndReschedule(hour, minute), delay);
  // Nicht den Event-Loop am Leben halten — der HTTP-Server tut das ohnehin.
  if (typeof timer.unref === 'function') timer.unref();
  const fireAt = new Date(Date.now() + delay);
  console.log(
    `[dream] Nächster Traum-Lauf: ${fireAt.toLocaleString('de-DE')} ` +
      `(${config.dream.tz}, in ${Math.round(delay / 60000)} min).`,
  );
}

/** Startet den Scheduler (no-op ohne Key oder wenn deaktiviert). */
export function startDreamScheduler(): void {
  if (!config.dream.schedulerEnabled) {
    console.log('[dream] Scheduler deaktiviert (DREAM_SCHEDULER_DISABLED=true).');
    return;
  }
  if (!minimaxAvailable()) {
    console.log('[dream] Kein MINIMAX_API_KEY — nächtliches Träumen inaktiv (Anzeige funktioniert weiter).');
    return;
  }
  const { hour, minute } = parseTime(config.dream.time);
  schedule(hour, minute);
  // Startup-Catch-up: verpasste Tage (Neustart über 04:20 hinweg) bzw. zwischen-
  // zeitlich nachgetragene Tage nachholen — fire-and-forget, blockiert den Start
  // nicht. Idempotenz (PK auf date) + Empty-Skip schützen vor Doppel-/Leerläufen.
  if (config.dream.catchUpDays > 0) void runCatchUp();
}

/** Holt fehlende Träume der jüngsten Tage nach (unter withDreamLock serialisiert). */
async function runCatchUp(): Promise<void> {
  try {
    const res = await withDreamLock(() => catchUpDreams({ days: config.dream.catchUpDays }));
    if (res.generated.length) {
      console.log(`[dream] Catch-up: ${res.generated.length} Tag(e) nachgeholt (${res.generated.join(', ')}).`);
    }
    if (res.failed) console.warn(`[dream] Catch-up: ${res.failed} Tag(e) fehlgeschlagen.`);
  } catch (e) {
    if (e instanceof DreamBusyError) return; // läuft bereits (z. B. paralleler Trigger) — ok
    console.error(`[dream] Catch-up fehlgeschlagen: ${(e as Error).message}`);
  }
}

/** Stoppt den Scheduler (für Tests / sauberes Herunterfahren). */
export function stopDreamScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
