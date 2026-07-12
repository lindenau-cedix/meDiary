import { useState } from 'react';
import { Moon, RefreshCw, AlertCircle } from 'lucide-react';
import { Starfield } from './Starfield';
import { SentDreamDrawer } from './SentDreamDrawer';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { formatFull, formatTime } from '../lib/format';
import { useDeliveries, useWhatsappStatus, useRedeliverDream } from '../lib/queries';
import { useToast } from './Toaster';
import type { DreamDelivery, DeliveryStatus } from '../lib/types';

// Uhrzeit-/Datumsanzeige der Zustellung. `takenAt`-Strings sind lokale
// Wanduhr ("YYYY-MM-DDTHH:mm:ss"); formatTime schneidet HH:MM heraus.
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
/** "Juni 2026" für die Monats-Gruppierung. */
function formatMonthLabel(date: string): string {
  return monthFmt.format(new Date(`${date}T12:00:00`));
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
/** "16. Juni · 04:20" aus einem lokalen Zeitstempel. */
function formatDeliveryStamp(ts: string): string {
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return `${dateFmt.format(d)} · ${formatTime(ts.length > 10 ? ts : `${ts}T00:00`)}`;
}

const STATUS_META: Record<DeliveryStatus, { label: string; pill: string }> = {
  sent: { label: 'Gesendet', pill: 'bg-emerald-900/40 text-emerald-300' },
  failed: { label: 'Fehlgeschlagen', pill: 'bg-amber-900/40 text-amber-300' },
  abandoned: { label: 'Abgebrochen', pill: 'bg-rose-900/40 text-rose-300' },
  pending: { label: 'Ausstehend', pill: 'bg-zinc-800 text-zinc-400' },
};

export function SentDreamsLog() {
  const { data, isLoading, error, refetch } = useDeliveries({ limit: 200 });
  const { data: status } = useWhatsappStatus();
  const adminEnabled = status?.adminEnabled ?? false;
  const [openDate, setOpenDate] = useState<string | null>(null);

  if (isLoading) return <SentDreamsSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle size={26} className="text-ink-muted" />
        <p className="text-sm text-ink-muted">Der Zustell-Verlauf konnte nicht geladen werden.</p>
        <button
          onClick={() => refetch()}
          className="press inline-flex items-center gap-1.5 rounded-xl bg-surface2 px-3 h-9 text-sm font-semibold text-ink hover:bg-line/60"
        >
          <RefreshCw size={15} /> Erneut versuchen
        </button>
      </div>
    );
  }

  const deliveries = data?.deliveries ?? [];

  if (deliveries.length === 0) {
    return (
      <>
        <SentDreamsEmpty />
        <SentDreamDrawer dreamDate={openDate} onClose={() => setOpenDate(null)} />
      </>
    );
  }

  // Nach Monat gruppieren (Server liefert absteigend nach Datum).
  const groups: { month: string; items: DreamDelivery[] }[] = [];
  for (const d of deliveries) {
    const m = formatMonthLabel(d.dreamDate);
    const last = groups[groups.length - 1];
    if (last && last.month === m) last.items.push(d);
    else groups.push({ month: m, items: [d] });
  }

  const open = (date: string) => {
    haptics.select();
    setOpenDate(date);
  };

  return (
    <>
      <div className="space-y-6">
        <SentDreamsHeader />
        {groups.map((g) => (
          <section key={g.month} className="space-y-2">
            <h2 className="font-display text-lg text-ink/90 px-1 capitalize">{g.month}</h2>
            <div className="space-y-2">
              {g.items.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  adminEnabled={adminEnabled}
                  onOpen={() => open(d.dreamDate)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <SentDreamDrawer dreamDate={openDate} onClose={() => setOpenDate(null)} />
    </>
  );
}

function DeliveryRow({
  delivery,
  adminEnabled,
  onOpen,
}: {
  delivery: DreamDelivery;
  adminEnabled: boolean;
  onOpen: () => void;
}) {
  const { mutate: redeliver, isPending } = useRedeliverDream();
  const toast = useToast();
  const meta = STATUS_META[delivery.status];
  const stamp = delivery.sentAt ?? delivery.updatedAt;
  const canRetry = adminEnabled && (delivery.status === 'failed' || delivery.status === 'abandoned');

  const onRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.select();
    redeliver(delivery.dreamDate, {
      onSuccess: () => toast.show({ message: 'Erneut gesendet', tone: 'success' }),
      onError: (err) =>
        toast.show({ message: 'Erneut senden fehlgeschlagen', detail: (err as Error).message, tone: 'warning' }),
    });
  };

  return (
    <button
      onClick={onOpen}
      className="press w-full text-left rounded-2xl bg-[#1F1D17] border border-white/5 px-4 py-3 transition-colors hover:border-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[16px] text-[#ECE7DB] leading-tight min-w-0">
          {formatFull(delivery.dreamDate)}
        </h3>
        <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', meta.pill)}>
          {meta.label}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {delivery.voiceStatus === 'failed' && (
            <p className="text-[12px] text-amber-400 leading-snug">Sprachnachricht fehlgeschlagen</p>
          )}
          {stamp && <p className="text-[12px] text-white/35 leading-snug tabular">{formatDeliveryStamp(stamp)}</p>}
        </div>
        {canRetry && (
          <button
            onClick={onRetry}
            disabled={isPending}
            className="press shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-amber-900/30 px-2.5 h-8 text-[12px] font-semibold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={cx(isPending && 'animate-spin')} /> Erneut senden
          </button>
        )}
      </div>
    </button>
  );
}

/** Listenkopf mit dezentem Nacht-Akzent (Halo + Sternchen). */
function SentDreamsHeader() {
  return (
    <div className="relative overflow-hidden rounded-3xl dream-night dream-grain px-5 py-4 ring-1 ring-[rgb(var(--periwinkle))]/20">
      <Starfield count={8} className="opacity-80" />
      <div className="relative flex items-center gap-3">
        <span className="grid place-items-center size-9 rounded-2xl bg-[rgb(var(--periwinkle))]/15 dream-accent">
          <Moon size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] dream-ink leading-tight">Gesendete Träume</p>
          <p className="text-[12px] dream-ink-soft leading-snug">
            Jede Nacht träumt die App und schickt den Traum direkt auf WhatsApp — hier siehst du das Zustell-Protokoll.
          </p>
        </div>
      </div>
    </div>
  );
}

function SentDreamsEmpty() {
  return (
    <div className="space-y-4">
      <SentDreamsHeader />
      <div className="relative overflow-hidden rounded-3xl bg-[#1F1D17] border border-white/5 px-6 py-14 text-center">
        <div className="flex flex-col items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-ink-muted" aria-hidden>
            <path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm text-[#ECE7DB]/80 leading-relaxed max-w-xs">
            Noch keine gesendeten Träume. Die App träumt heute Nacht um 04:20 Uhr und schickt den Traum direkt auf
            WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}

function SentDreamsSkeleton() {
  return (
    <div className="space-y-6">
      <SentDreamsHeader />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-zinc-800/30 border border-white/5 px-4 py-3 animate-pulse">
            <div className="h-4 w-40 rounded-full bg-zinc-700/40 mb-2" />
            <div className="h-3 w-24 rounded-full bg-zinc-700/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
