import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pill, History, BookOpen, ClipboardList, LineChart } from 'lucide-react';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';

const tabs = [
  { to: '/', label: 'Heute', Icon: Pill },
  { to: '/verlauf', label: 'Verlauf', Icon: History },
  { to: '/tagebuch', label: 'Tagebuch', Icon: BookOpen },
  { to: '/plan', label: 'Plan', Icon: ClipboardList },
  { to: '/werte', label: 'Werte', Icon: LineChart },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 glass border-t border-hairline pb-safe">
      <div className="mx-auto max-w-app flex items-stretch justify-around px-2">
        {tabs.map(({ to, label, Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => haptics.select()}
              className="relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2"
            >
              <span className="relative grid place-items-center">
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute -inset-x-3.5 -inset-y-1.5 rounded-2xl bg-primary-soft"
                    transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                  />
                )}
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 2}
                  className={cx('relative transition-colors', active ? 'text-primary' : 'text-ink-faint')}
                />
              </span>
              <span
                className={cx(
                  'text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-ink-faint',
                )}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
