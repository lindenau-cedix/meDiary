import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, Moon, MoonStar, Sun, ChevronDown, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState, LoadingScreen } from '../components/ui/feedback';
import { DreamProse } from '../components/DreamProse';
import { Starfield } from '../components/Starfield';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { formatDayLabel, formatFull, relativeDays } from '../lib/format';
import { useDiaryNotes, useDreams, useMetrics } from '../lib/queries';
import type { Dream } from '../lib/types';

type Mode = 'info' | 'traum';

export function DiaryScreen() {
  const [params, setParams] = useSearchParams();
  const initial: Mode = params.get('view') === 'traum' ? 'traum' : 'info';
  const [mode, setMode] = useState<Mode>(initial);

  // Der Startup-Dialog navigiert mit ?view=traum hierher — auch wenn der Tab
  // schon offen ist, soll dann der Traum-Untertab erscheinen.
  useEffect(() => {
    const v = params.get('view');
    if (v === 'traum') setMode('traum');
    else if (v === 'info') setMode('info');
  }, [params]);

  const change = (m: Mode) => {
    haptics.select();
    setMode(m);
    // URL-Param aufräumen, damit ein Reload nicht im falschen Tab landet.
    if (params.has('view')) {
      params.delete('view');
      setParams(params, { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title="Tagebuch"
        eyebrow={mode === 'traum' ? 'nächtliche Auswertung' : 'aus deinen Notizen'}
        action={<ModeToggle mode={mode} onChange={change} />}
      />
      {mode === 'info' ? <ShortDiary /> : <DreamHistory />}
    </>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-2xl bg-surface2 p-0.5 ring-1 ring-line">
      {(
        [
          { key: 'info', label: 'Info', Icon: List },
          { key: 'traum', label: 'Traum', Icon: Moon },
        ] as const
      ).map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cx(
            'press inline-flex items-center gap-1.5 rounded-[14px] px-3 h-9 text-[13px] font-semibold transition-colors',
            mode === key ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}

/** "HH:MM" aus einem Unix-Sekunden-Timestamp (lokale Zeit). */
function fmtUnixClock(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "12.5 h" — kompakte Stundenformatierung, eine Nachkommastelle. */
function fmtHours(unixDelta: number): string {
  const h = Math.max(0, unixDelta / 3600);
  return `${h.toFixed(1)} h`;
}

// ───────────────────────── Info: Liste der Notizen (Roh-Log) ─────────────────────────

function ShortDiary() {
  const { data, isLoading } = useDiaryNotes();
  const { data: metrics = [] } = useMetrics();
  const shortLabel = useMemo(() => new Map(metrics.map((m) => [m.key, m.short])), [metrics]);

  if (isLoading) return <LoadingScreen />;
  const days = data?.days ?? [];
  if (days.length === 0) {
    return (
      <EmptyState
        icon={<List size={26} />}
        title="Noch keine Notizen"
        description="Notizen aus Einnahmen und Tagesbildern erscheinen hier — chronologisch nach Tagen."
      />
    );
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.date}>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="font-display text-lg text-ink">{formatDayLabel(day.date)}</h2>
            <span className="text-xs text-ink-faint">{day.weekday}</span>
          </div>
          <Card className="divide-y divide-hairline overflow-hidden">
            {day.intakes.map((it) => (
              <div key={it.id} className="flex items-start gap-3 px-3.5 py-2.5">
                <span className="tabular text-sm font-semibold text-ink-muted w-11 shrink-0 pt-0.5">{it.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {it.substanceName}
                    {it.amount && <span className="font-normal text-ink-muted"> · {it.amount}</span>}
                  </p>
                  {it.note && <p className="text-[13px] text-ink-muted leading-snug mt-0.5">{it.note}</p>}
                </div>
              </div>
            ))}
            {day.assessment && (
              <div className="px-3.5 py-2.5 bg-surface2/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent flex items-center gap-1 mb-1">
                  <Moon size={12} /> Tagesbild
                </p>
                {Object.keys(day.assessment.scores).length > 0 && (
                  <p className="text-[13px] text-ink-muted leading-snug">
                    {Object.entries(day.assessment.scores)
                      .map(([k, v]) => `${shortLabel.get(k) ?? k} ${v}`)
                      .join(' · ')}
                  </p>
                )}
                {day.assessment.note && (
                  <p className="text-[13px] text-ink leading-snug mt-1">{day.assessment.note}</p>
                )}
              </div>
            )}
            {day.habit &&
              (day.habit.wakeFirstUnix != null || day.habit.wakeLastUnix != null) && (
                <div className="px-3.5 py-2.5 bg-surface2/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent flex items-center gap-1 mb-1">
                    <Sun size={12} /> Wachzeit
                  </p>
                  <p className="text-[13px] text-ink-muted leading-snug">
                    {(() => {
                      const first = day.habit!.wakeFirstUnix;
                      const last = day.habit!.wakeLastUnix;
                      if (first != null && last != null) {
                        return `${fmtUnixClock(first)} – ${fmtUnixClock(last)} · ${fmtHours(last - first)} wach`;
                      }
                      if (last != null) return `zuletzt wach ${fmtUnixClock(last)}`;
                      if (first != null) return `zuerst wach ${fmtUnixClock(first)}`;
                      return null;
                    })()}
                  </p>
                </div>
              )}
          </Card>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── Traum: Historie der nächtlichen Auswertungen ─────────────────────────

const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
function monthLabel(date: string): string {
  return monthFmt.format(new Date(`${date}T12:00:00`));
}

function DreamHistory() {
  const { data, isLoading } = useDreams();

  if (isLoading) return <DreamSkeleton />;

  const dreams = data?.dreams ?? [];
  const available = data?.available ?? false;

  if (dreams.length === 0) {
    return (
      <div className="space-y-4">
        <DreamListHeader />
        <EmptyState
          icon={<MoonStar size={26} />}
          iconClassName="dream-night text-[rgb(var(--periwinkle))] ring-1 ring-[rgb(var(--periwinkle))]/20"
          title="Noch keine Träume"
          description={
            available
              ? 'Die App träumt heute Nacht um 4:20 Uhr — dann erscheint hier die erste Auswertung deines Tages.'
              : 'Sobald ein MINIMAX_API_KEY hinterlegt ist, erstellt die App jede Nacht um 4:20 Uhr eine Auswertung deines Tages.'
          }
        />
      </div>
    );
  }

  // Nach Monat gruppieren (neueste zuerst — dreams kommen bereits absteigend).
  const groups: { month: string; items: Dream[] }[] = [];
  for (const d of dreams) {
    const m = monthLabel(d.date);
    const last = groups[groups.length - 1];
    if (last && last.month === m) last.items.push(d);
    else groups.push({ month: m, items: [d] });
  }

  return (
    <div className="space-y-6">
      <DreamListHeader />
      {groups.map((g) => (
        <section key={g.month} className="space-y-3">
          <h2 className="font-display text-lg text-ink/90 px-1 capitalize">{g.month}</h2>
          <div className="space-y-3">
            {g.items.map((d) => (
              <DreamCard key={d.date} dream={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Listenkopf mit dezentem Nacht-Akzent (kleiner Halo + Sternchen). */
function DreamListHeader() {
  return (
    <div className="relative overflow-hidden rounded-3xl dream-night dream-grain px-5 py-4 ring-1 ring-[rgb(var(--periwinkle))]/20">
      <Starfield count={8} className="opacity-80" />
      <div className="relative flex items-center gap-3">
        <span className="grid place-items-center size-9 rounded-2xl bg-[rgb(var(--periwinkle))]/15 dream-accent">
          <Moon size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] dream-ink leading-tight">Träume</p>
          <p className="text-[12px] dream-ink-soft leading-snug">
            Jede Nacht eine ruhige Auswertung deines Tages — Muster, Trends, Punkte fürs Arztgespräch.
          </p>
        </div>
      </div>
    </div>
  );
}

const COLLAPSE_AT = 680; // Zeichen — längere Träume werden eingeklappt

function DreamCard({ dream }: { dream: Dream }) {
  // `long` aus dem aktuellen Inhalt ableiten (nicht nur beim Mount), damit ein
  // Refetch/Regenerieren, der die Länge über/unter COLLAPSE_AT schiebt, die
  // Karte nicht in einem veralteten Zustand „klemmt" (geklappt ohne
  // Weiterlesen-Button). `expanded` ist nur die explizite Nutzer-Aktion.
  const long = dream.content.length > COLLAPSE_AT;
  const [expanded, setExpanded] = useState(false);
  const open = !long || expanded;

  return (
    <Card className="relative overflow-hidden p-0">
      {/* zarte Indigo-Kante links als Nacht-Signatur */}
      <span className="absolute inset-y-0 left-0 w-[3px] bg-[rgb(var(--periwinkle))]/45" aria-hidden />
      <div className="p-4 pl-5">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <h3 className="font-display text-[18px] text-ink leading-tight">{formatFull(dream.date)}</h3>
          <span className="text-[11px] text-ink-faint shrink-0">{relativeDays(dream.date)}</span>
        </div>

        <div className="relative">
          <div
            className={cx('relative', !open && 'max-h-[10.5rem] overflow-hidden')}
            style={!open ? { maskImage: 'linear-gradient(to bottom, black 62%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)' } : undefined}
          >
            <DreamProse content={dream.content} tone="surface" />
          </div>
        </div>

        {long && (
          <button
            onClick={() => {
              haptics.select();
              setExpanded((o) => !o);
            }}
            className="press mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
          >
            {expanded ? 'Weniger' : 'Weiterlesen'}
            <ChevronDown size={15} className={cx('transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>
    </Card>
  );
}

function DreamSkeleton() {
  return (
    <div className="space-y-6">
      <DreamListHeader />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-4 pl-5">
            <div className="h-5 w-40 rounded-full bg-surface2 mb-3 animate-pulse" />
            <div className="space-y-2">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-3.5 rounded-full bg-surface2/70 animate-pulse" style={{ width: `${90 - j * 12}%` }} />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 text-xs text-ink-faint">
        <Sparkles size={13} className="text-ink-faint" /> Träume werden geladen …
      </p>
    </div>
  );
}
