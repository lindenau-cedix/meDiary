import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Variant = 'primary' | 'accent' | 'soft' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-soft hover:brightness-[1.04]',
  accent: 'bg-accent text-accent-fg shadow-soft hover:brightness-[1.04]',
  soft: 'bg-surface2 text-ink hover:bg-line/60',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface2 hover:text-ink',
  outline: 'bg-transparent text-ink ring-1 ring-line hover:bg-surface2',
  danger: 'bg-bad/12 text-bad hover:bg-bad/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-10 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  lg: 'h-14 px-6 text-base gap-2.5 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'press inline-flex items-center justify-center font-medium select-none',
        'transition-[filter,background-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
