import { cx } from '../lib/cx';
import { colorForName } from '../lib/format';

function initials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

const sizes = {
  sm: 'size-8 text-[11px] rounded-xl',
  md: 'size-11 text-[15px] rounded-2xl',
  lg: 'size-14 text-lg rounded-2xl',
};

export function SubstanceSeal({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string;
  color?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const c = color || colorForName(name);
  return (
    <span
      className={cx('grid place-items-center font-semibold tracking-tight shrink-0', sizes[size], className)}
      style={{ backgroundColor: `${c}24`, color: c, boxShadow: `inset 0 0 0 1px ${c}38` }}
    >
      {initials(name)}
    </span>
  );
}
