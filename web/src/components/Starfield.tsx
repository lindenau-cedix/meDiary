import { cx } from '../lib/cx';

/**
 * Wenige 1px-Sterne mit niedriger Deckkraft, deterministisch platziert
 * (keine Zufallszahlen → stabil über Re-Renders). Optionales sehr langsames
 * Funkeln (per CSS, automatisch aus bei `prefers-reduced-motion`).
 */

// Deterministische „zufällig wirkende" Positionen (x%, y%, größe px, delay s).
const STARS: [number, number, number, number][] = [
  [8, 18, 1, 0],
  [22, 9, 1, 1.4],
  [37, 24, 1.5, 0.6],
  [54, 12, 1, 2.1],
  [69, 22, 1, 0.3],
  [82, 10, 1.5, 1.1],
  [91, 27, 1, 1.8],
  [14, 38, 1, 0.9],
  [46, 41, 1, 2.4],
  [63, 36, 1.5, 0.2],
  [78, 44, 1, 1.6],
  [30, 52, 1, 0.7],
  [88, 56, 1, 2.0],
  [6, 62, 1.5, 1.3],
];

export function Starfield({
  count = STARS.length,
  twinkle = true,
  className,
}: {
  count?: number;
  twinkle?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {STARS.slice(0, count).map(([x, y, size, delay], i) => (
        <span
          key={i}
          className={cx('absolute rounded-full bg-[rgb(var(--star))]', twinkle && 'dream-twinkle')}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            opacity: 0.25,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}
