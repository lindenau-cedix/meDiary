import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, RefreshCw, MessageCircle } from 'lucide-react';
import { DreamProse } from './DreamProse';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { formatFull, formatTime } from '../lib/format';
import { api } from '../lib/api';
import { useDeliveries, useWhatsappStatus, useRedeliverDream } from '../lib/queries';import { useToast } from './Toaster';
import type { DeliveryStatus } from '../lib/types';
import { useT } from '../lib/i18n';

// Status pills — visual styling is fixed; only the label is translated.
const STATUS_PILL: Record<DeliveryStatus, string> = {
  sent: 'bg-emerald-900/40 text-emerald-300',
  failed: 'bg-amber-900/40 text-amber-300',
  abandoned: 'bg-rose-900/40 text-rose-300',
  pending: 'bg-zinc-800 text-zinc-400',
};

/** Mask the recipient: keep the first 4 chars visible, dot the rest. */
function maskRecipient(recipient: string): string {
  const digits = recipient.replace(/@.*$/, '');
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}${'•'.repeat(Math.min(5, digits.length - 4))}`;
}

function formatStamp(ts: string): string {
  const clean = ts.replace(' ', 'T');
  return clean.length > 10 ? `${clean.slice(0, 10)} · ${formatTime(clean)}` : clean;
}

/**
 * Slide-in drawer (from the right) for a single sent dream: shows the dream
 * text, the delivery metadata, and (for admins) a "Resend" button.
 */
export function SentDreamDrawer({
  dreamDate,
  onClose,
}: {
  dreamDate: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const { data: dreamResp, isLoading: dreamLoading } = useQuery({
    queryKey: ['dream', dreamDate],
    queryFn: () => api.dreams.get(dreamDate!),
    enabled: !!dreamDate,
  });
  const { data: deliveryResp } = useDeliveries(dreamDate ? { dreamDate } : undefined);
  const { data: statusResp } = useWhatsappStatus();
  const { mutate: redeliver, isPending: isRedelivering } = useRedeliverDream();
  const toast = useToast();

  const delivery = deliveryResp?.deliveries.find((d) => d.dreamDate === dreamDate) ?? null;
  const adminEnabled = statusResp?.adminEnabled ?? false;
  const canRetry =
    adminEnabled && !!delivery && (delivery.status === 'failed' || delivery.status === 'abandoned');

  const close = useCallback(() => {
    onClose();
    const el = previouslyFocused.current;
    if (el && typeof el.focus === 'function') window.setTimeout(() => el.focus(), 0);
  }, [onClose]);

  // Lock body scroll + handle Escape + set initial focus while open.
  useEffect(() => {
    if (!dreamDate) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
    };
  }, [dreamDate, close]);

  const onRetry = () => {
    if (!dreamDate) return;
    haptics.select();
    redeliver(dreamDate, {
      onSuccess: () => {
        toast.show({ message: t('components.sentDreams.resent'), tone: 'success' });
        close();
      },
      onError: (err) =>
        toast.show({
          message: t('components.sentDreams.resendFailed'),
          detail: (err as Error).message,
          tone: 'warning',
        }),
    });
  };

  const statusKey = delivery
    ? (`components.delivery.status.${delivery.status}` as
        | 'components.delivery.status.sent'
        | 'components.delivery.status.failed'
        | 'components.delivery.status.abandoned'
        | 'components.delivery.status.pending')
    : null;

  return createPortal(
    <AnimatePresence>
      {dreamDate && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.3, ease: 'easeOut' }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('components.sentDreamDrawer.aria', { date: formatFull(dreamDate) })}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative ml-auto w-full max-w-md h-full overflow-y-auto overscroll-contain dream-night dream-grain shadow-float"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 pt-6 pb-3 bg-gradient-to-b from-[rgb(var(--night-mid))] to-transparent">
              <div className="min-w-0">
                <h2 className="font-display text-[22px] leading-tight dream-ink">{formatFull(dreamDate)}</h2>
                {delivery && statusKey && (
                  <span
                    className={cx('mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_PILL[delivery.status])}
                  >
                    {t(statusKey)}
                  </span>
                )}
              </div>
              <button
                ref={closeRef}
                onClick={close}
                aria-label={t('action.close')}
                className="press grid place-items-center size-9 shrink-0 rounded-full bg-white/5 dream-ink-soft hover:bg-white/10 hover:dream-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dream text */}
            <div className="px-6 pt-2 pb-4">
              {dreamLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-3.5 rounded-full bg-white/10 animate-pulse"
                      style={{ width: `${92 - i * 9}%` }}
                    />
                  ))}
                </div>
              ) : dreamResp?.exists && dreamResp.content ? (
                <DreamProse content={dreamResp.content} tone="surface" />
              ) : (
                <p className="text-[14px] dream-ink-soft">{t('components.sentDreamDrawer.noDream')}</p>
              )}
            </div>

            {/* Delivery metadata */}
            {delivery && (
              <div className="mx-6 mb-6 rounded-2xl bg-white/5 border border-white/5 px-4 py-3.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] dream-accent">
                  {t('components.sentDreamDrawer.meta.delivery')}
                </p>
                <dl className="space-y-1.5 text-[13px]">
                  <MetaRow label={t('components.sentDreamDrawer.meta.channel')}>
                    <span className="inline-flex items-center gap-1.5 dream-ink-soft">
                      <MessageCircle size={14} /> {delivery.channel || t('components.sentDreamDrawer.meta.channelFallback')}
                    </span>
                  </MetaRow>
                  <MetaRow label={t('components.sentDreamDrawer.meta.recipient')}>
                    <span className="dream-ink-soft tabular">{maskRecipient(delivery.recipient)}</span>
                  </MetaRow>
                  <MetaRow label={t('components.sentDreamDrawer.meta.attempts')}>
                    <span className="dream-ink-soft tabular">{delivery.attempts}</span>
                  </MetaRow>
                  {delivery.voiceStatus !== 'none' && (
                    <MetaRow label={t('components.sentDreamDrawer.meta.voice')}>
                      <span className={cx(delivery.voiceStatus === 'failed' ? 'text-amber-400' : 'dream-ink-soft')}>
                        {delivery.voiceStatus === 'failed'
                          ? t('components.sentDreamDrawer.voice.failed')
                          : t('components.sentDreamDrawer.voice.sent')}
                      </span>
                    </MetaRow>
                  )}
                  {delivery.sentAt && (
                    <MetaRow label={t('components.sentDreamDrawer.meta.sentAt')}>
                      <span className="dream-ink-soft tabular">{formatStamp(delivery.sentAt)}</span>
                    </MetaRow>
                  )}
                </dl>
                {delivery.error && (
                  <p className="text-[12px] text-rose-300/80 leading-snug pt-1 whitespace-pre-wrap break-words">
                    {delivery.error}
                  </p>
                )}
              </div>
            )}

            {/* Footer action: Resend (admin + failed/abandoned only) */}
            {canRetry && (
              <div className="px-6 pb-8">
                <button
                  onClick={onRetry}
                  disabled={isRedelivering}
                  className="press w-full inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl text-[15px] font-medium bg-primary text-primary-fg shadow-soft transition-[filter] hover:brightness-[1.04] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--night-mid))]"
                >
                  <RefreshCw size={17} className={cx(isRedelivering && 'animate-spin')} /> {t('components.sentDreams.retry')}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="dream-ink-soft text-[12px] opacity-70">{label}</dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}
