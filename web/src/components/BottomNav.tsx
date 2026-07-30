import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pill, History, BookOpen, ClipboardList, LineChart, BarChart3 } from 'lucide-react';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { useT, type MessageKey } from '../lib/i18n';

/**
 * Tab configuration: each tab maps a route to a translated nav label and an
 * icon. The label keys are the existing `nav.*` keys from the common catalog —
 * no new keys are introduced here.
 *
 * `Icon: typeof Pill` follows the convention already used in `SettingsScreen`:
 * it picks up lucide's real component type, which a hand-written
 * `ComponentType<{size, strokeWidth, className}>` does not structurally match.
 */
const tabs: { to: string; labelKey: MessageKey; Icon: typeof Pill }[] = [
  { to: '/', labelKey: 'nav.today', Icon: Pill },
  { to: '/verlauf', labelKey: 'nav.history', Icon: History },
  { to: '/tagebuch', labelKey: 'nav.dreams', Icon: BookOpen },
  { to: '/plan', labelKey: 'nav.plan', Icon: ClipboardList },
  { to: '/werte', labelKey: 'nav.values', Icon: LineChart },
  { to: '/statistik', labelKey: 'nav.stats', Icon: BarChart3 },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 glass border-t border-hairline pb-safe">
      <div className="mx-auto max-w-app flex items-stretch justify-around px-2">
        {tabs.map(({ to, labelKey, Icon }) => {
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
                {t(labelKey)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
