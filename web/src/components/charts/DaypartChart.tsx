import { DAYPART_DEFS, daypartOf, type DaypartDistribution, type Daypart } from '../../lib/analytics';

/** Warme, unterscheidbare Tagesabschnitts-Farben (Morgen→Nacht). */
export const DAYPART_COLORS: Record<Daypart, string> = {
  morning: '#E0A458',
  noon: '#C97E54',
  evening: '#9C5C8A',
  night: '#4A5A8C',
};

const HIST_H = 56;

/**
 * Tageszeit-Muster: eine segmentierte Anteils-Leiste (Morgens/Mittags/Abends/
 * Nachts) als sofort lesbare Headline, darunter ein feines 24-Stunden-
 * Histogramm (Balken in der Farbe ihres Tagesabschnitts).
 */
export function DaypartChart({ dist, labels }: { dist: DaypartDistribution; labels: Record<Daypart, string> }) {
  const total = Math.max(dist.total, 1);
  const histMax = Math.max(1, ...dist.hours);

  return (
    <div className="space-y-3">
      {/* Anteils-Leiste */}
      <div className="flex h-3.5 rounded-full overflow-hidden bg-surface2">
        {DAYPART_DEFS.map((d) => {
          const share = dist.counts[d.key] / total;
          if (share <= 0) return null;
          return (
            <div
              key={d.key}
              style={{ width: `${share * 100}%`, backgroundColor: DAYPART_COLORS[d.key] }}
              title={`${labels[d.key]}: ${dist.counts[d.key]}`}
            />
          );
        })}
      </div>

      {/* Legende mit Zahlen */}
      <div className="grid grid-cols-4 gap-2">
        {DAYPART_DEFS.map((d) => {
          const count = dist.counts[d.key];
          const pct = Math.round((count / total) * 100);
          return (
            <div key={d.key} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: DAYPART_COLORS[d.key] }} />
                <span className="text-[12px] font-medium text-ink truncate">{labels[d.key]}</span>
              </div>
              <p className="font-display text-lg leading-tight text-ink tabular mt-0.5">
                {count}
                <span className="text-[11px] font-sans text-ink-faint ml-1">{pct}%</span>
              </p>
              <p className="text-[10px] text-ink-faint tabular">{d.range}</p>
            </div>
          );
        })}
      </div>

      {/* 24-Stunden-Histogramm */}
      <div>
        <svg viewBox={`0 0 24 ${HIST_H}`} width="100%" height={HIST_H} preserveAspectRatio="none" role="img">
          <line x1={0} y1={HIST_H - 1} x2={24} y2={HIST_H - 1} stroke="rgb(var(--hairline))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {dist.hours.map((v, h) => {
            const bh = v === 0 ? 0 : Math.max(2, (v / histMax) * (HIST_H - 6));
            return (
              <rect
                key={h}
                x={h + 0.12}
                y={HIST_H - 1 - bh}
                width={0.76}
                height={bh}
                rx={0.15}
                fill={DAYPART_COLORS[daypartOf(`2000-01-01T${String(h).padStart(2, '0')}:00`)]}
                fillOpacity={0.9}
              />
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] text-ink-faint tabular px-0.5">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  );
}
