import { Plus, Minus, ArrowRight } from 'lucide-react';
import type { DiffRow } from '../../lib/types';
import { cx } from '../../lib/cx';

/** Deutsche Spaltenbezeichner für die Diff-Felder. */
const FIELD_LABEL: Record<string, string> = {
  substance: 'Substanz',
  takenAt: 'Zeit',
  amount: 'Menge',
  notes: 'Notiz',
  name: 'Name',
  archived: 'Archiviert',
  isNightMed: 'Nachtmed',
};

function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

function Value({ value, tone }: { value: string | null; tone: 'add' | 'del' | 'plain' }) {
  if (value === null || value === '') {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span
      className={cx(
        'rounded px-1 py-px',
        tone === 'add' && 'bg-diff-add-soft text-diff-add',
        tone === 'del' && 'bg-diff-del-soft text-diff-del line-through decoration-diff-del/50',
        tone === 'plain' && 'text-ink',
      )}
    >
      {value}
    </span>
  );
}

/** Eine before→after-Zeile abhängig von der Operation. */
function SampleRow({ row }: { row: DiffRow }) {
  return (
    <div className="flex gap-2.5 px-3 py-2 border-b border-hairline last:border-0">
      <span
        className={cx(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px]',
          row.op === 'create' && 'bg-diff-add-soft text-diff-add',
          row.op === 'delete' && 'bg-diff-del-soft text-diff-del',
          row.op === 'update' && 'bg-diff-mod-soft text-diff-mod',
        )}
        aria-hidden
      >
        {row.op === 'create' ? <Plus size={11} strokeWidth={3} /> : row.op === 'delete' ? <Minus size={11} strokeWidth={3} /> : <ArrowRight size={11} strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate font-mono text-[12px] text-ink-muted">{row.label}</div>

        {/* Feld-Diffs */}
        {row.op === 'update' && (
          <div className="space-y-0.5 font-mono text-[12px]">
            {row.changedKeys.map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-faint">{fieldLabel(k)}</span>
                <Value value={row.before?.[k] ?? null} tone="del" />
                <ArrowRight size={11} className="text-ink-faint" />
                <Value value={row.after?.[k] ?? null} tone="add" />
              </div>
            ))}
          </div>
        )}

        {row.op === 'delete' && row.before && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px]">
            {Object.entries(row.before).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="text-ink-faint">{fieldLabel(k)}</span>
                <Value value={v} tone="del" />
              </span>
            ))}
          </div>
        )}

        {row.op === 'create' && row.after && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px]">
            {Object.entries(row.after)
              .filter(([, v]) => v !== null && v !== '')
              .map(([k, v]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="text-ink-faint">{fieldLabel(k)}</span>
                  <Value value={v} tone="add" />
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DiffTable({ samples, sampleTruncated, total }: { samples: DiffRow[]; sampleTruncated: boolean; total: number }) {
  if (samples.length === 0) {
    return <p className="px-3 py-3 font-mono text-[12px] text-ink-faint">Keine betroffenen Zeilen.</p>;
  }
  return (
    <div className="rounded-xl ring-1 ring-line overflow-hidden bg-bg/40">
      {samples.map((s, i) => (
        <SampleRow key={`${s.table}-${s.id ?? 'new'}-${i}`} row={s} />
      ))}
      {sampleTruncated && (
        <div className="px-3 py-1.5 font-mono text-[11px] text-ink-faint bg-surface2/50">
          … nur {samples.length} von {total} Zeilen gezeigt
        </div>
      )}
    </div>
  );
}
