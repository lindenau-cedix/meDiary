import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export function PageHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('flex items-end justify-between gap-3 pt-2 pb-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[13px] font-medium text-ink-muted mb-0.5 truncate">{eyebrow}</p>
        )}
        <h1 className="font-display text-[34px] leading-[1.05] tracking-tight text-ink">{title}</h1>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2 pb-1">{action}</div>}
    </header>
  );
}
