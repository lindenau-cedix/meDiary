import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { IconButton } from './IconButton';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'full';
}

const sizeClass: Record<string, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  full: 'sm:max-w-2xl',
};

export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={cx(
              'relative w-full max-h-[92vh] flex flex-col',
              'bg-surface ring-1 ring-line shadow-float',
              'rounded-t-4xl sm:rounded-4xl overflow-hidden',
              sizeClass[size],
            )}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.4 }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Greifer */}
            <div className="pt-2.5 pb-1 grid place-items-center sm:hidden">
              <span className="h-1.5 w-11 rounded-full bg-line" />
            </div>

            {(title || subtitle) && (
              <header className="flex items-start gap-3 px-5 pt-3 pb-3">
                <div className="min-w-0 flex-1">
                  {title && <h2 className="font-display text-[22px] leading-tight text-ink truncate">{title}</h2>}
                  {subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
                </div>
                <IconButton label="Schließen" onClick={onClose} className="-mr-1 mt-0.5">
                  <X size={20} />
                </IconButton>
              </header>
            )}

            <div className="overflow-y-auto overscroll-contain px-5 pb-4 no-scrollbar">{children}</div>

            {footer && (
              <footer className="border-t border-hairline px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-surface">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
