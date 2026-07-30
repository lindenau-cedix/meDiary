import { useId } from 'react';

/**
/**
 * Vertical daily bars (dose or count over time). Dependency-free, responsive
 * via `viewBox`. Optional: a dashed mean line and tap selection of a single day
 * (full-height hit area per bar).
 */
interface Props {
  values: number[];
  color: string;
  height?: number;
/** Mean line (same unit as `values`); null/omitted = none. */
  avg?: number | null;
  /** Override the y maximum (otherwise derived from the values). */
  max?: number;
  selectedIndex?: number | null;
  onSelect?: (i: number) => void;
}

const W = 320;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;

export function VBars({ values, color, height = 96, avg = null, max, selectedIndex = null, onSelect }: Props) {
  const id = useId().replace(/:/g, '');
  const H = height;
  const n = values.length;
  const top = Math.max(max ?? 0, ...values, 0.0001);
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const slotW = (W - 2 * PAD_X) / Math.max(n, 1);
  const barW = Math.min(slotW * 0.72, 14);
  const y = (v: number) => H - PAD_BOTTOM - (v / top) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id={`vb-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Baseline */}
      <line x1={0} y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="rgb(var(--hairline))" strokeWidth={1} vectorEffect="non-scaling-stroke" />

      {avg != null && avg > 0 && (
        <line
          x1={0}
          y1={y(avg)}
          x2={W}
          y2={y(avg)}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {values.map((v, i) => {
        const cx = PAD_X + slotW * (i + 0.5);
        const isSel = selectedIndex === i;
        return (
          <g key={i}>
{/* full-height hit area (keeps zero days tappable too) */}
            {onSelect && (
              <rect
                x={PAD_X + slotW * i}
                y={0}
                width={slotW}
                height={H}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(i)}
              />
            )}
            {isSel && (
              <rect x={PAD_X + slotW * i} y={0} width={slotW} height={H} fill={color} opacity={0.1} pointerEvents="none" />
            )}
            {v > 0 && (
              <rect
                x={cx - barW / 2}
                y={y(v)}
                width={barW}
                height={Math.max(H - PAD_BOTTOM - y(v), 1.5)}
                rx={1.5}
                fill={`url(#vb-${id})`}
                stroke={isSel ? color : 'none'}
                strokeWidth={isSel ? 1.5 : 0}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
