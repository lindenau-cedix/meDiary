import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Text am Balkenende (Default: die Zahl selbst). */
  valueLabel?: string;
  /** Kleine Sekundärzeile (z. B. "an 12 Tagen"). */
  sub?: string;
  color: string;
  /** Führendes Element, z. B. ein `SubstanceSeal`. */
  leading?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

/**
 * Horizontale Rangbalken — bewusst als HTML (nicht SVG): Text, Seals und
 * Sekundärzeilen bleiben so gestochen scharf und barrierefrei. Balkenbreite =
 * `value / max`, direkt am Balken beschriftet (keine Achsen).
 */
export function HBars({ items, max }: { items: HBarItem[]; max?: number }) {
  const top = Math.max(max ?? 0, ...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const pct = Math.max(2, (it.value / top) * 100);
        const Row = it.onClick ? 'button' : 'div';
        return (
          <Row
            key={it.key}
            onClick={it.onClick}
            className={cx(
              'w-full flex items-center gap-2.5 text-left',
              it.onClick && 'press rounded-xl -mx-1 px-1 py-0.5 hover:bg-surface2 transition-colors',
              it.active && 'bg-surface2',
            )}
          >
            {it.leading}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-ink truncate">{it.label}</span>
                <span className="text-[13px] font-semibold text-ink tabular shrink-0">
                  {it.valueLabel ?? it.value}
                </span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-surface2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, backgroundColor: it.color }}
                />
              </div>
              {it.sub && <p className="text-[11px] text-ink-faint tabular mt-0.5">{it.sub}</p>}
            </div>
          </Row>
        );
      })}
    </div>
  );
}
