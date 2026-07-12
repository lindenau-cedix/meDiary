import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Statusleisten-Bereich (Notch / Android-Statusbar) */}
      <div className="h-safe-top shrink-0" />
      <main className="flex-1">
        <div className="mx-auto max-w-app px-4 pb-safe-nav pt-2">
          <motion.div
            key={pathname}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
