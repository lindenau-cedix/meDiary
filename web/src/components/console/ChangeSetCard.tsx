import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X, Undo2, AlertTriangle, CircleSlash, ShieldCheck } from 'lucide-react';
import type { ChangeSet } from '../../lib/types';
import { cx } from '../../lib/cx';
import { DiffTable } from './DiffTable';

/** Ab dieser Zeilenzahl gilt ein Change-Set als „groß" → zweite Bestätigung. */
const LARGE_THRESHOLD = 100;

const STATUS: Record<ChangeSet['status'], { label: string; cls: string }> = {
  proposed: { label: 'Vorschlag', cls: 'bg-accent-soft text-accent' },
  applied: { label: 'Angewandt', cls: 'bg-good/15 text-good' },
  undone: { label: 'Rückgängig', cls: 'bg-surface2 text-ink-muted' },
  discarded: { label: 'Verworfen', cls: 'bg-surface2 text-ink-faint' },
};

interface Props {
  changeSet: ChangeSet;
  canUndo: boolean;
  busy: boolean;
  onApply: (id: number) => void;
  onUndo: (id: number) => void;
  onDiscard: (id: number) => void;
}

export function ChangeSetCard({ changeSet: cs, canUndo, busy, onApply, onUndo, onDiscard }: Props) {
  const reduce = useReducedMotion();
  const [confirmLarge, setConfirmLarge] = useState(false);
  const preview = cs.preview;
  const total = preview?.totalAffected ?? cs.affected;
  const isLarge = total >= LARGE_THRESHOLD;
  const status = STATUS[cs.status];

  const handleApply = () => {
    if (isLarge && !confirmLarge) {
      setConfirmLarge(true);
      return;
    }
    onApply(cs.id);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl ring-1 ring-line bg-surface shadow-soft overflow-hidden"
    >
      {/* Kopf */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-hairline">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface2 text-ink-muted">
            <ShieldCheck size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{cs.title}</h4>
              <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', status.cls)}>
                {status.label}
              </span>
            </div>
            {cs.summary && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{cs.summary}</p>}
            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              <span className="tabular text-ink-muted">{total}</span> Zeile{total === 1 ? '' : 'n'} betroffen
              {preview && preview.operations.length > 1 && <> · {preview.operations.length} Operationen</>}
            </p>
          </div>
        </div>

        {/* Operations-Chips */}
        {preview && preview.operations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.operations.map((op, i) => (
              <span
                key={i}
                className={cx(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px]',
                  op.warning ? 'bg-warn/12 text-warn' : 'bg-surface2 text-ink-muted',
                )}
                title={op.warning}
              >
                {op.warning && <AlertTriangle size={10} />}
                {op.label}
                <span className="tabular text-ink-faint">· {op.affected}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Diff */}
      {preview && (
        <div className="p-3">
          <DiffTable samples={preview.samples} sampleTruncated={preview.sampleTruncated} total={total} />
        </div>
      )}

      {/* Aktionen */}
      <div className="px-3.5 py-2.5 border-t border-hairline bg-surface2/30">
        {cs.status === 'proposed' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              disabled={busy}
              className={cx(
                'press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:opacity-50',
                confirmLarge ? 'bg-bad text-white' : 'bg-primary text-primary-fg',
              )}
            >
              {confirmLarge ? (
                <>
                  <AlertTriangle size={15} /> Wirklich {total} Zeilen ändern?
                </>
              ) : (
                <>
                  <Check size={16} /> Bestätigen
                </>
              )}
            </button>
            <button
              onClick={() => onDiscard(cs.id)}
              disabled={busy}
              className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-ink-muted hover:bg-surface2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X size={15} /> Verwerfen
            </button>
          </div>
        )}

        {cs.status === 'applied' && (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-good">
              <Check size={15} /> Angewandt
              {cs.appliedAt && <span className="font-mono text-[11px] text-ink-faint">{cs.appliedAt.slice(11, 16)}</span>}
            </span>
            {canUndo ? (
              <button
                onClick={() => onUndo(cs.id)}
                disabled={busy}
                className="press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-surface2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Undo2 size={15} /> Rückgängig
              </button>
            ) : (
              <span className="font-mono text-[11px] text-ink-faint">nur jüngste Änderung umkehrbar</span>
            )}
          </div>
        )}

        {cs.status === 'undone' && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
            <Undo2 size={15} /> Rückgängig gemacht
          </span>
        )}
        {cs.status === 'discarded' && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
            <CircleSlash size={15} /> Verworfen
          </span>
        )}
      </div>
    </motion.div>
  );
}
