import { ChevronRight } from 'lucide-react';

/**
 * Echter Leerzustand mit konkreten Beispiel-Kommandos (medikations-spezifisch) —
 * bewusst KEIN „Wie kann ich helfen?". Anklicken füllt die Eingabe.
 */
const EXAMPLES = [
  'Führe „Magnesiumcitrat" und „Magnesium" zu einer Substanz zusammen und behalte alle Einnahmen.',
  'Ich habe vergessen, Vitamin D einzutragen — trag es an jedem Werktag der letzten zwei Wochen um 09:00 nach.',
  'Lösche alle Einnahmen vor dem 01.01.2026.',
  'Meine Einnahmen von der Reise sind wegen der Zeitzone einen Tag zu spät — verschiebe alle mit Notiz „Tokio" um 24 Stunden zurück.',
  'Welche Substanzen habe ich seit über einem Monat nicht mehr eingetragen?',
];

export function ConsoleEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="py-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-faint">Beispiele</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
        Untersuche deine Daten oder beschreibe eine Korrektur in eigenen Worten. Änderungen werden dir als
        Vorschau gezeigt — nichts wird ohne deine Bestätigung geschrieben.
      </p>

      <ul className="mt-4 space-y-1.5">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              onClick={() => onPick(ex)}
              className="group flex w-full items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-left ring-1 ring-line transition-colors hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="mt-0.5 font-mono text-primary/70" aria-hidden>
                ›
              </span>
              <span className="flex-1 text-[13px] leading-snug text-ink">{ex}</span>
              <ChevronRight
                size={15}
                className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
