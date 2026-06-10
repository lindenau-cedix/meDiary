import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('bg-surface ring-1 ring-line rounded-3xl shadow-soft', className)}
      {...rest}
    />
  );
}
