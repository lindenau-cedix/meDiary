import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: 'ghost' | 'soft';
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, className, variant = 'ghost', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cx(
        'press grid place-items-center size-11 rounded-2xl text-ink-muted',
        'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        variant === 'ghost' ? 'hover:bg-surface2 hover:text-ink' : 'bg-surface2 hover:bg-line/60 text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
