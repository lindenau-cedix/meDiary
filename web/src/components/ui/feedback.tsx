import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block size-5 rounded-full border-2 border-current border-r-transparent animate-spin', className)}
    />
  );
}

export function LoadingScreen({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-faint">
      <Spinner className="text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-faint', className)}>
      {children}
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  iconClassName,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Override für den Icon-Chip (Default `bg-surface2 text-ink-faint`). */
  iconClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 px-6 py-14">
      {icon && (
        <div
          className={cx(
            'grid place-items-center size-14 rounded-3xl',
            iconClassName ?? 'bg-surface2 text-ink-faint',
          )}
        >
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-display text-xl text-ink">{title}</h3>
        {description && <p className="text-sm text-ink-muted max-w-[26ch] mx-auto leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'accent' | 'good' | 'bad' | 'warn';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface2 text-ink-muted',
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent',
    good: 'bg-good/15 text-good',
    bad: 'bg-bad/15 text-bad',
    warn: 'bg-warn/15 text-warn',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
