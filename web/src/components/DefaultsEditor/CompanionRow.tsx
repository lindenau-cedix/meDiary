import { useMemo, useState } from 'react';
import { Trash2, ChevronDown, Plus } from 'lucide-react';
import { Field, TextInput } from '../ui/inputs';
import { Button } from '../ui/Button';
import { cx } from '../../lib/cx';
import { useSubstances } from '../../lib/queries';
import type { DefaultsSectionCompanion } from '../../lib/types';

interface CompanionRowProps {
  value: DefaultsSectionCompanion;
  onChange: (next: DefaultsSectionCompanion) => void;
  onRemove: () => void;
}

/**
 * Eine `Mit:`-Zeile als kleines Formular: Name (mit Autocomplete aus
 * `substances`), Menge, Notiz, Lösch-Button. Freie Eingaben bleiben erlaubt
 * — passende Substanzen werden auf Tab/Enter / Auswahl komfortabel
 * eingefügt, aber unbekannte Namen werden 1:1 übernommen und können beim
 * Eintragen via `findOrCreateSubstance()` automatisch als Kachel
 * nachgepflegt werden.
 */
export function CompanionRow({ value, onChange, onRemove }: CompanionRowProps) {
  const { data: subs = [] } = useSubstances(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value.name);

  const suggestions = useMemo(() => {
    const q = name.trim().toLocaleLowerCase('de');
    if (!q) return subs.filter((s) => !s.archived).slice(0, 8);
    return subs
      .filter((s) => !s.archived)
      .filter((s) => s.name.toLocaleLowerCase('de').includes(q))
      .slice(0, 8);
  }, [subs, name]);

  const pick = (n: string) => {
    setName(n);
    onChange({ ...value, name: n });
    setOpen(false);
  };

  return (
    <div className="rounded-2xl bg-surface2/60 ring-1 ring-line p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 relative">
          <Field label="Mit-Name">
            <TextInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                onChange({ ...value, name: e.target.value });
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Begleitstoff, z. B. Lemon Balm"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {open && suggestions.length > 0 && (
            <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-2xl bg-surface ring-1 ring-line shadow-float">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.name)}
                  className="press flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                >
                  <span
                    className="size-3 rounded-full ring-1 ring-line shrink-0"
                    style={{ background: s.color ?? '#888' }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.isNightMed ? (
                    <span className="text-[10px] uppercase tracking-wide text-ink-faint">Nacht</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="press grid size-12 place-items-center rounded-2xl bg-surface2 text-ink-muted hover:text-ink ring-1 ring-line shrink-0 mt-7"
          aria-label="Vorschläge anzeigen"
          title="Vorschläge"
        >
          <ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <div className="flex items-end gap-2">
        <Field label="Menge" className="flex-1">
          <TextInput
            value={value.amount ?? ''}
            onChange={(e) => onChange({ ...value, amount: e.target.value || null })}
            placeholder="z. B. 100 mg"
            spellCheck={false}
          />
        </Field>
        <Field label="Notiz" className="flex-1">
          <TextInput
            value={value.note ?? ''}
            onChange={(e) => onChange({ ...value, note: e.target.value || null })}
            placeholder="optional"
            spellCheck={false}
          />
        </Field>
        <Button
          type="button"
          variant="danger"
          size="md"
          icon={<Trash2 size={16} />}
          onClick={onRemove}
          aria-label="Mit-Zeile entfernen"
          title="Mit-Zeile entfernen"
        />
      </div>
    </div>
  );
}

/** Plus-Button zum Hinzufügen einer leeren `Mit:`-Zeile. */
export function CompanionAddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="soft" size="sm" icon={<Plus size={15} />} onClick={onClick}>
      Mit-Zeile hinzufügen
    </Button>
  );
}
