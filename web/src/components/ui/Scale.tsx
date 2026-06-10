import { useRef } from 'react';
import { cx } from '../../lib/cx';
import { scoreColor } from '../../lib/colors';
import { haptics } from '../../lib/haptics';
import type { MetricPolarity } from '../../lib/types';

interface ScaleProps {
  value: number | null;
  onChange: (v: number) => void;
  polarity: MetricPolarity;
  ariaLabel?: string;
}

/** 1–10 Segment-Skala, per Tipp oder Wischen bedienbar. */
export function Scale({ value, onChange, polarity, ariaLabel }: ScaleProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<number | null>(value);

  const valueFromX = (clientX: number): number => {
    const el = barRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
  };

  const commit = (v: number) => {
    if (v !== lastRef.current) {
      lastRef.current = v;
      haptics.select();
      onChange(v);
    }
  };

  const fill = value ? scoreColor(value, polarity) : null;

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={10}
      aria-valuenow={value ?? undefined}
      tabIndex={0}
      className="flex gap-1 select-none touch-none cursor-pointer"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        commit(valueFromX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return;
        commit(valueFromX(e.clientX));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') commit(Math.min(10, (value ?? 0) + 1));
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') commit(Math.max(1, (value ?? 11) - 1));
      }}
    >
      {Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        const filled = value != null && n <= value;
        const selected = value === n;
        return (
          <div
            key={n}
            className={cx(
              'flex-1 min-w-0 h-11 rounded-[11px] grid place-items-center text-[11px] font-semibold tabular',
              'transition-[transform,background-color] duration-150 ease-spring',
              !filled && 'bg-surface2 ring-1 ring-line text-ink-faint',
              selected && 'scale-[1.06] shadow-soft',
            )}
            style={
              filled
                ? { backgroundColor: fill!, color: 'rgba(255,255,255,0.96)', boxShadow: selected ? `0 4px 12px ${fill}55` : undefined }
                : undefined
            }
          >
            {n}
          </div>
        );
      })}
    </div>
  );
}
