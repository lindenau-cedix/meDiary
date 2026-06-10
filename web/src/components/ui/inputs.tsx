import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

const fieldBase =
  'w-full bg-surface2 text-ink rounded-2xl px-4 ring-1 ring-line placeholder:text-ink-faint ' +
  'transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-primary/55';

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-muted pl-1">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-ink-faint pl-1">{hint}</p>}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(fieldBase, 'h-12', className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(fieldBase, 'py-3 min-h-[3rem] resize-none leading-relaxed', className)} {...rest} />;
  },
);

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 press',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        checked ? 'bg-primary' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-spring',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}
