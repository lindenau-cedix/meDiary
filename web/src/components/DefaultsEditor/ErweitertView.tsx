import { TextArea } from '../ui/inputs';
import type { DefaultsSection } from '../../lib/types';

interface ErweitertViewProps {
  /** Live-Edit-Puffer im Raw-Modus. */
  value: string;
  onChange: (next: string) => void;
  /** Vorschau-Parsing: was die aktuell im Buffer stehenden Sections nach
   *  dem nächsten Save ergeben würden. Read-only. */
  parsedSections: DefaultsSection[];
}

/**
 * Raw-Markdown-Editor. Bewusst plain, ohne Syntax-Highlighter —
 * bleibt dependency-frei und spiegelt das aktuelle Verhalten der
 * in-page-Textarea in SettingsScreen. Wird ergänzend zum strukturierten
 * Editor angeboten, damit NACH:/Vorbehalts-Blöcke verlustfrei gepflegt
 * werden können.
 */
export function ErweitertView({ value, onChange, parsedSections }: ErweitertViewProps) {
  return (
    <div className="space-y-3">
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-mono text-[13px] leading-relaxed"
        placeholder={'## Substanzname\nMenge: …\nNotiz: …\nMit: … | … | …'}
      />

      <div className="rounded-3xl bg-surface ring-1 ring-line p-4 space-y-2">
        <p className="text-sm font-medium text-ink">Aktuell geparst</p>
        {parsedSections.length === 0 ? (
          <p className="text-xs text-ink-faint">Keine Sektionen erkannt.</p>
        ) : (
          <ul className="text-xs text-ink-muted space-y-1 font-mono">
            {parsedSections.map((s, idx) => (
              <li key={idx}>
                ## {s.name}
                {s.amount && <span className="text-good"> · Menge {s.amount}</span>}
                {s.note && <span className="text-accent"> · Notiz</span>}
                {s.companions.length > 0 && (
                  <span className="text-primary"> · {s.companions.length} Mit:</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-faint leading-relaxed">
        Pro Substanz eine <code className="text-ink-muted">## Substanzname</code>-Überschrift, darunter optional
        <code className="text-ink-muted"> Menge:</code>, <code className="text-ink-muted">Notiz:</code> und
        <code className="text-ink-muted"> Mit:</code>. Menge/Notiz werden beim Eintragen übernommen, wenn sie nicht selbst
        angegeben wurden. <code className="text-ink-muted">Mit: Name | Menge | Notiz</code> trägt die genannte
        Begleitsubstanz automatisch als eigene Einnahme mit ein. Wird bei jedem Eintrag frisch gelesen.
      </p>
    </div>
  );
}
