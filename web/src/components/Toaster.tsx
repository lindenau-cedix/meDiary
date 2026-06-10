import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Undo2, AlertTriangle, Info } from 'lucide-react';
import { cx } from '../lib/cx';

type Tone = 'success' | 'info' | 'warning';

interface ToastInput {
  message: string;
  detail?: string;
  tone?: Tone;
  duration?: number;
  action?: { label: string; onClick: () => void };
}
interface Toast extends ToastInput {
  id: number;
}

const ToastCtx = createContext<{ show: (t: ToastInput) => void } | null>(null);

const icons: Record<Tone, ReactNode> = {
  success: <Check size={18} className="text-good" />,
  info: <Info size={18} className="text-primary" />,
  warning: <AlertTriangle size={18} className="text-accent" />,
};

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      const toast: Toast = { tone: 'success', duration: input.action ? 5200 : 3200, ...input, id };
      setToasts((t) => [...t.filter((x) => x.id !== id), toast]);
      window.setTimeout(() => remove(id), toast.duration);
    },
    [remove],
  );

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ type: 'spring', damping: 26, stiffness: 360 }}
                className={cx(
                  'pointer-events-auto w-full max-w-app flex items-center gap-3',
                  'glass ring-1 ring-line shadow-float rounded-2xl pl-4 pr-2 py-2.5',
                )}
              >
                <span className="shrink-0 grid place-items-center size-7 rounded-full bg-surface2">
                  {icons[t.tone ?? 'success']}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{t.message}</p>
                  {t.detail && <p className="text-xs text-ink-muted truncate">{t.detail}</p>}
                </div>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      remove(t.id);
                    }}
                    className="press shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-surface2 px-3 h-9 text-sm font-semibold text-ink hover:bg-line/60"
                  >
                    <Undo2 size={15} />
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside ToasterProvider');
  return ctx;
}
