import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, Moon, Sun, ChevronDown, Bot } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState, LoadingScreen } from '../components/ui/feedback';
import { SentDreamsLog } from '../components/SentDreamsLog';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { formatDayLabel } from '../lib/format';
import { useDiaryNotes, useMetrics } from '../lib/queries';
import type { DiaryNoteDay } from '../lib/types';

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
      {mode === 'info' ? <ShortDiary /> : <SentDreamsLog />}
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
            {day.report && <DiaryReportBlock report={day.report} />}
          </Card>
        </section>
      ))}
    </div>
  );
}

/** Zeichengrenze für Vorschau/Weiterlesen — gleich wie Traum-Karten. */
const REPORT_COLLAPSE_AT = 600;

function DiaryReportBlock({ report }: { report: NonNullable<DiaryNoteDay['report']> }) {
  // `long` aus dem aktuellen Inhalt ableiten (nicht nur beim Mount) — sonst
  // kann ein Refetch die Karte in einem veralteten Zustand „klemmen" lassen.
  const long = report.report.length > REPORT_COLLAPSE_AT;
  const [expanded, setExpanded] = useState(false);
  const open = !long || expanded;
  // Whitespace normalisieren: mehrfach aufeinanderfolgende Leerzeilen werden
  // zu einer einzigen zusammen­gezogen, damit eingerückte Mehrzeiler im
  // Vorschau-Clip nicht „ausgefranst" wirken.
  const normalized = report.report.replace(/\n{3,}/g, '\n\n').trim();

  return (
    <div className="px-3.5 py-2.5 bg-surface2/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent flex items-center gap-1 mb-1">
        <Bot size={12} /> Hermes-Agent{report.source ? ` · ${report.source}` : ''}
      </p>
      <div
        className={cx('relative', !open && 'max-h-[10.5rem] overflow-hidden')}
        style={
          !open
            ? {
                maskImage: 'linear-gradient(to bottom, black 62%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)',
              }
            : undefined
        }
      >
        <p className="text-[13px] text-ink leading-snug whitespace-pre-wrap">{normalized}</p>
      </div>
      {long && (
        <button
          onClick={() => {
            haptics.select();
            setExpanded((o) => !o);
          }}
          className="press mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
        >
          {expanded ? 'Weniger' : 'Weiterlesen'}
          <ChevronDown size={15} className={cx('transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
