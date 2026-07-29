import { scoreColor } from '../../lib/colors';
import type { MetricPolarity } from '../../lib/types';

/**
 * Dual-axis overlay for substance × wellbeing: daily dose as bars (substance
 * colour, implicit left axis) plus the selected 1–10 scale as a line with
 * colour-coded points (`scoreColor`, right axis 1–10). Days without a scale
 * value break the line (no invented interpolation across gaps).
 */
interface Props {
  dose: number[];
  metric: (number | null)[];
  doseColor: string;
  polarity: MetricPolarity;
  height?: number;
}

const W = 320;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

export function DualAxis({ dose, metric, doseColor, polarity, height = 120 }: Props) {
  const H = height;
  const n = Math.max(dose.length, metric.length);
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const doseMax = Math.max(0.0001, ...dose);
  const slotW = (W - 2 * PAD_X) / Math.max(n, 1);
  const barW = Math.min(slotW * 0.6, 12);
  const cx = (i: number) => PAD_X + slotW * (i + 0.5);
  const yDose = (v: number) => H - PAD_BOTTOM - (v / doseMax) * innerH;
  const yMetric = (v: number) => H - PAD_BOTTOM - ((Math.min(10, Math.max(1, v)) - 1) / 9) * innerH;

  // Split the line into contiguous segments (gaps at null values).
  const segments: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  metric.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push({ i, v });
    }
  });
  if (cur.length) segments.push(cur);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      <line x1={0} y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="rgb(var(--hairline))" strokeWidth={1} vectorEffect="non-scaling-stroke" />

      {/* Dose bars */}
      {dose.map((v, i) =>
        v > 0 ? (
          <rect
            key={i}
            x={cx(i) - barW / 2}
            y={yDose(v)}
            width={barW}
            height={Math.max(H - PAD_BOTTOM - yDose(v), 1.5)}
            rx={1.5}
            fill={doseColor}
            fillOpacity={0.32}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}

      {/* Scale line */}
      {segments.map((seg, si) => (
        <path
          key={si}
          d={seg.map((p, k) => `${k === 0 ? 'M' : 'L'} ${cx(p.i).toFixed(1)} ${yMetric(p.v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="rgb(var(--text))"
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {metric.map((v, i) =>
        v == null ? null : (
          <circle key={i} cx={cx(i)} cy={yMetric(v)} r={2.8} fill={scoreColor(v, polarity)} vectorEffect="non-scaling-stroke" />
        ),
      )}
    </svg>
  );
}
