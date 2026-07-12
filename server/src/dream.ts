/**
 * Manueller Trigger für das nächtliche „Träumen" (zum Testen, ohne auf 04:20
 * zu warten). Läuft im selben Prozess-Kontext wie der Server (gleiche DB,
 * gleiche Config), umgeht also den HTTP-Endpoint.
 *
 * Aufruf:
 *   npm --prefix server run dream                       # Konsum-Vortag
 *   npm --prefix server run dream -- --date=2026-06-16  # bestimmter Tag
 *   npm --prefix server run dream -- --force            # vorhandenen überschreiben
 *   npm --prefix server run dream -- --date=2026-06-16 --force
 *
 * Voraussetzung: MINIMAX_API_KEY in der .env (sonst 503-Äquivalent: Fehler).
 *
 * Hinweis zur Serialisierung: `withDreamLock` ist ein In-Process-Lock und wird
 * von DIESEM separaten CLI-Prozess NICHT mit dem laufenden Server geteilt. Die
 * CLI sollte daher nicht zeitgleich zum Scheduler/HTTP-Trigger auf denselben
 * Tag laufen (der DB-Upsert ist last-writer-wins, aber es entstünden doppelte
 * API-Kosten). Echte Cross-Prozess-Serialisierung bräuchte einen DB-/Datei-Lock.
 */
import { generateDream, dreamTargetDate, dreamAvailable } from './lib/dreams.js';
import { withDreamLock } from './lib/dream_scheduler.js';
import { minimaxModel } from './lib/minimax.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const date = argValue('date');
  const force = hasFlag('force');

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`[dream] Ungültiges --date "${date}" (erwartet YYYY-MM-DD).`);
    process.exit(2);
  }

  if (!dreamAvailable()) {
    console.error('[dream] MINIMAX_API_KEY ist nicht konfiguriert — kann nicht träumen.');
    process.exit(3);
  }

  const target = date ?? dreamTargetDate();
  console.log(`[dream] Generiere Traum für ${target} (Modell ${minimaxModel()})${force ? ' [force]' : ''} …`);

  try {
    const res = await withDreamLock(() => generateDream({ date, force }));
    if (res.status === 'created') {
      console.log(`[dream] ✓ Traum für ${res.date} erzeugt (${res.attempts} Versuch(e)).`);
      console.log('────────────────────────────────────────────────────────');
      console.log(res.dream?.content ?? '');
      console.log('────────────────────────────────────────────────────────');
      // Delivery anhängen (Text+Voice an alle aktiven Empfänger). Kein
      // throw — wenn WhatsApp/ElevenLabs nicht konfiguriert sind, geben
      // wir einen klaren Hinweis und beenden mit 0.
      if (res.dream) {
        try {
          const { enqueueDelivery } = await import('./lib/dream_delivery.js');
          const r = await enqueueDelivery(res.dream);
          console.log(`[dream-cli] delivery: ${r.sent}/${r.attempted} sent, ${r.failed} failed`);
        } catch (e) {
          console.error('[dream-cli] delivery-enqueue failed:', (e as Error).message);
        }
      }
    } else if (res.status === 'skipped') {
      console.log(`[dream] ⏭  Traum für ${res.date} existiert bereits — übersprungen (--force zum Überschreiben).`);
    } else {
      console.log(`[dream] ∅ Tag ${res.date} hat keinen Inhalt (keine Einnahmen/Tagesbild/Wachzeit) — nichts zu träumen.`);
    }
    process.exit(0);
  } catch (e) {
    console.error(`[dream] ✗ Fehlgeschlagen: ${(e as Error).message}`);
    process.exit(1);
  }
}

void main();
