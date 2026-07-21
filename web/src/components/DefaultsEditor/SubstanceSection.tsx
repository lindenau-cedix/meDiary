import { Trash2, FileText, AlertTriangle } from 'lucide-react';
import { Field, TextInput, TextArea } from '../ui/inputs';
import { Button } from '../ui/Button';
import { Badge } from '../ui/feedback';
import { cx } from '../../lib/cx';
import { CompanionRow, CompanionAddButton } from './CompanionRow';
import { haptics } from '../../lib/haptics';
import type { DefaultsSection, DefaultsSectionCompanion } from '../../lib/types';

interface SubstanceSectionProps {
  section: DefaultsSection;
  /** Aktuelle Section-Schlüssel im Compliance-Bericht (gematchter `nameKey`-Style-Key). */
  complianceKey?: string;
  /** Substanz taucht im Compliance-Bericht unter "missing" auf? */
  isMissing?: boolean;
  onChange: (next: DefaultsSection) => void;
  onRemove: () => void;
}

/** Formular für eine Substanz-Sektion: Name + Menge + Notiz + Mit:-Liste + Löschen. */
export function SubstanceSection({ section, complianceKey, isMissing, onChange, onRemove }: SubstanceSectionProps) {
  const hasAny =
    !!section.amount ||
    !!section.note ||
    section.companions.length > 0 ||
    section.preLines.length > 0 ||
    section.postLines.length > 0;

  const updateCompanion = (idx: number, next: DefaultsSectionCompanion) => {
    const companions = section.companions.slice();
    companions[idx] = next;
    onChange({ ...section, companions });
  };
  const removeCompanion = (idx: number) => {
    onChange({ ...section, companions: section.companions.filter((_, i) => i !== idx) });
  };
  const addCompanion = () => {
    onChange({ ...section, companions: [...section.companions, { name: '', amount: null, note: null }] });
    haptics.light();
  };
  const onDelete = () => {
    haptics.warning();
    if (window.confirm(`Sektion "${section.name}" wirklich entfernen?`)) {
      onRemove();
    }
  };

  return (
    <article
      data-compliance-key={complianceKey}
      className={cx(
        'rounded-3xl bg-surface ring-1 ring-line shadow-soft p-4 space-y-3 transition-shadow',
        !hasAny && 'ring-warn/60',
      )}
    >
      <header className="flex items-start gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-surface2 text-primary shrink-0">
          <FileText size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <Field label="Substanzname">
            <TextInput
              value={section.name}
              onChange={(e) => onChange({ ...section, name: e.target.value })}
              placeholder="z. B. Modafinil"
              spellCheck={false}
              autoCapitalize="off"
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="danger"
          size="md"
          icon={<Trash2 size={16} />}
          onClick={onDelete}
          aria-label="Sektion löschen"
          title="Sektion löschen"
        />
      </header>

      {isMissing && (
        <div className="flex items-center gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            Diese Substanz hat aktuell keinen Eintrag in DEFAULTS.md — beim Speichern wird die Liste ergänzt.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Menge" hint="Optional. Wird beim Eintragen übernommen, wenn nicht selbst angegeben.">
          <TextInput
            value={section.amount ?? ''}
            onChange={(e) => onChange({ ...section, amount: e.target.value || null })}
            placeholder="z. B. 100 mg"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Notiz"
          hint="Optional. Wird beim Eintragen übernommen, wenn nicht selbst angegeben."
          className="sm:row-span-2"
        >
          <TextArea
            rows={3}
            value={section.note ?? ''}
            onChange={(e) => onChange({ ...section, note: e.target.value || null })}
            placeholder="z. B. morgens, vor dem Frühstück"
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="font-semibold uppercase tracking-wide">Mit:</span>
          <span>Begleitstoffe, die automatisch miterfasst werden</span>
        </div>
        {section.companions.length > 0 && (
          <div className="space-y-2">
            {section.companions.map((c, idx) => (
              <CompanionRow
                key={idx}
                value={c}
                onChange={(next) => updateCompanion(idx, next)}
                onRemove={() => removeCompanion(idx)}
              />
            ))}
          </div>
        )}
        <CompanionAddButton onClick={addCompanion} />
      </div>

      {(section.preLines.length > 0 || section.postLines.length > 0) && (
        <details className="rounded-2xl bg-surface2/40 ring-1 ring-line px-3 py-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink">
            <Badge tone="warn" className="mr-2 inline-flex">
              NACH-/Vorbehalt
            </Badge>
            Verlustfreie Kommentarzeilen ({section.preLines.length + section.postLines.length})
          </summary>
          <div className="mt-2 space-y-2">
            {section.preLines.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">Vor den Feldern</p>
                <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                  {section.preLines.join('\n')}
                </pre>
              </div>
            )}
            {section.postLines.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">Nach den Feldern</p>
                <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                  {section.postLines.join('\n')}
                </pre>
              </div>
            )}
            <p className="text-ink-faint text-[11px]">
              Diese Zeilen werden im Raw-Editor unter „Erweitert" angezeigt und beim Speichern 1:1 übernommen.
            </p>
          </div>
        </details>
      )}
    </article>
  );
}
