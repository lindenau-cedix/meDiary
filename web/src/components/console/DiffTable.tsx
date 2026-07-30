import { Plus, Minus, ArrowRight } from 'lucide-react';
import { useT, type MessageKey } from '../../lib/i18n';
import type { DiffRow } from '../../lib/types';
import { cx } from '../../lib/cx';
import { planFieldLabel } from '../../lib/plan';

/**
 * Map of diff field keys to the translation key that holds the user-facing
 * label. Falls back to `planFieldLabel()` for plan-known fields and to the
 * raw key for anything else (same shape as the previous `FIELD_LABELS`).
 */
const FIELD_LABEL_KEYS: Record<string, MessageKey | null> = {
  substance: 'console.diff.field.substance',
  takenAt: 'console.diff.field.takenAt',
  amount: 'console.diff.field.amount',
  notes: 'console.diff.field.notes',
  name: 'console.diff.field.name',
  archived: 'console.diff.field.archived',
  isNightMed: 'console.diff.field.isNightMed',
};

function fieldLabel(key: string, t: (k: MessageKey) => string): string {
  const mapKey = FIELD_LABEL_KEYS[key];
  if (mapKey) return t(mapKey);
  // Reuse the plan-field labels for plan columns (`morning`/`noon`/`strength`/…).
  const planLabel = planFieldLabel(key);
  if (planLabel !== key) return planLabel;
  return key;
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

/** A single before→after row, shaped by the operation. */
function SampleRow({ row }: { row: DiffRow }) {
  const t = useT();
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

        {/* Field diffs */}
        {row.op === 'update' && (
          <div className="space-y-0.5 font-mono text-[12px]">
            {row.changedKeys.map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-faint">{fieldLabel(k, t)}</span>
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
                <span className="text-ink-faint">{fieldLabel(k, t)}</span>
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
                  <span className="text-ink-faint">{fieldLabel(k, t)}</span>
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
  const t = useT();
  if (samples.length === 0) {
    return <p className="px-3 py-3 font-mono text-[12px] text-ink-faint">{t('console.diff.empty')}</p>;
  }
  return (
    <div className="rounded-xl ring-1 ring-line overflow-hidden bg-bg/40">
      {samples.map((s, i) => (
        <SampleRow key={`${s.table}-${s.id ?? 'new'}-${i}`} row={s} />
      ))}
      {sampleTruncated && (
        <div className="px-3 py-1.5 font-mono text-[11px] text-ink-faint bg-surface2/50">
          {t('console.diff.truncated', { shown: samples.length, total })}
        </div>
      )}
    </div>
  );
}