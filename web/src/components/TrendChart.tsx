import { useId } from 'react';
import { scoreColor } from '../lib/colors';
import type { MetricPolarity } from '../lib/types';

interface Props {
  values: (number | null)[];
  polarity: MetricPolarity;
  height?: number;
  showArea?: boolean;
  showDots?: boolean;
  className?: string;
}

const W = 320;
const PAD_X = 6;
const PAD_Y = 10;

export function TrendChart({ values, polarity, height = 56, showArea = true, showDots = false, className }: Props) {
  const id = useId().replace(/:/g, '');
  const H = height;
  const n = values.length;

  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);

  const x = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X));
  const y = (v: number) => H - PAD_Y - ((Math.min(10, Math.max(1, v)) - 1) / 9) * (H - 2 * PAD_Y);

  const last = points.at(-1);
  const color = scoreColor(last?.v ?? 5, polarity);

  if (points.length === 0) {
    return (
      <div className={className} style={{ height }}>
        <div className="h-full grid place-items-center text-xs text-ink-faint">keine Daten</div>
      </div>
    );
  }

  const line = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L ${x(points.at(-1)!.i).toFixed(1)} ${H} L ${x(points[0].i).toFixed(1)} ${H} Z`
      : '';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {showArea && area && <path d={area} fill={`url(#grad-${id})`} />}

      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {showDots &&
        points.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3} fill={scoreColor(p.v, polarity)} vectorEffect="non-scaling-stroke" />
        ))}

      {last && (
        <circle
          cx={x(last.i)}
          cy={y(last.v)}
          r={3.6}
          fill={color}
          stroke="rgb(var(--surface))"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
