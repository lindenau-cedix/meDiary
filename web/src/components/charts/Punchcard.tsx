import { SubstanceSeal } from '../SubstanceSeal';
import { formatDayShort } from '../../lib/format';
import { cx } from '../../lib/cx';
import type { PunchRow } from '../../lib/analytics';

/**
 * Konsum-Kalender: Substanzen (Zeilen) × Tage (Spalten). Zellfarbe =
 * Substanzfarbe, Deckkraft = Einnahmen/Tag relativ zur eigenen Spitze — so
 * bleibt auch ein selten genutzter Stoff als Muster erkennbar. Der farbige
 * Streifen ist ein responsives, non-scaling SVG; getippte Zelle → `onSelect`.
 */
export interface PunchSelection {
  key: string;
  index: number;
}

interface Props {
  rows: PunchRow[];
  days: string[];
  selected?: PunchSelection | null;
  onSelect?: (sel: PunchSelection) => void;
}

const STRIP_H = 20;

export function Punchcard({ rows, days, selected, onSelect }: Props) {
  const n = days.length;
  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const c = row.stat.color;
        return (
          <div key={row.stat.key} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <SubstanceSeal name={row.stat.name} color={c} size="sm" />
              <span className="text-[12px] text-ink-muted truncate">{row.stat.name}</span>
            </div>
            <svg
              viewBox={`0 0 ${n} 1`}
              width="100%"
              height={STRIP_H}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${row.stat.name}: ${row.stat.count} Einnahmen`}
            >
              {row.cells.map((intensity, i) => {
                const isSel = selected?.key === row.stat.key && selected?.index === i;
                return (
                  <g key={i}>
                    <rect
                      x={i + 0.06}
                      y={0.08}
                      width={0.88}
                      height={0.84}
                      fill={intensity > 0 ? c : 'rgb(var(--hairline))'}
                      fillOpacity={intensity > 0 ? intensity : 0.5}
                      onClick={onSelect ? () => onSelect({ key: row.stat.key, index: i }) : undefined}
                      style={onSelect ? { cursor: 'pointer' } : undefined}
                    />
                    {isSel && (
                      <rect
                        x={i + 0.06}
                        y={0.08}
                        width={0.88}
                        height={0.84}
                        fill="none"
                        stroke="rgb(var(--text))"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}

      {/* Datums-Achse: Start · Mitte · Ende, ausgerichtet auf den Streifen. */}
      <div className="grid grid-cols-[5.5rem_1fr] gap-2 pt-0.5">
        <span />
        <div className="flex justify-between text-[10px] text-ink-faint tabular">
          <span>{formatDayShort(days[0])}</span>
          <span className={cx(n < 8 && 'sr-only')}>{formatDayShort(days[midIdx])}</span>
          <span>{formatDayShort(days[n - 1])}</span>
        </div>
      </div>
    </div>
  );
}
