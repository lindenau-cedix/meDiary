import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Sparkles,
  RefreshCw,
  List,
  Pencil,
  Check,
  X,
  AlertCircle,
  Moon,
  Monitor,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextArea } from '../components/ui/inputs';
import { EmptyState, LoadingScreen, Badge, SectionLabel } from '../components/ui/feedback';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { formatDayLabel } from '../lib/format';
import { useDiaryNotes, useDiary, useGenerateDiary, useSaveDiary, useMetrics } from '../lib/queries';
import { ApiError } from '../lib/api';
import type { DiaryEntry } from '../lib/types';

type Mode = 'short' | 'full';

export function DiaryScreen() {
  const [mode, setMode] = useState<Mode>('short');

  return (
    <>
      <PageHeader
        title="Tagebuch"
        eyebrow="aus deinen Notizen"
        action={<ModeToggle mode={mode} onChange={setMode} />}
      />
      {mode === 'short' ? <ShortDiary /> : <FullDiary />}
    </>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-2xl bg-surface2 p-0.5 ring-1 ring-line">
      {(
        [
          { key: 'short', label: 'Kurz', Icon: List },
          { key: 'full', label: 'Voll', Icon: BookOpen },
        ] as const
      ).map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => {
            haptics.select();
            onChange(key);
          }}
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

// ───────────────────────── Kurzversion: Liste der Notizen ─────────────────────────

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
              (day.habit.pcFirstInteractionUnix != null || day.habit.pcLastInteractionUnix != null) && (
                <div className="px-3.5 py-2.5 bg-surface2/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent flex items-center gap-1 mb-1">
                    <Monitor size={12} /> PC-Nutzung
                  </p>
                  <p className="text-[13px] text-ink-muted leading-snug">
                    {(() => {
                      const first = day.habit!.pcFirstInteractionUnix;
                      const last = day.habit!.pcLastInteractionUnix;
                      if (first != null && last != null) {
                        return `${fmtUnixClock(first)} – ${fmtUnixClock(last)} · ${fmtHours(last - first)} aktiv`;
                      }
                      if (last != null) return `letzte Aktivität ${fmtUnixClock(last)}`;
                      if (first != null) return `erste Aktivität ${fmtUnixClock(first)}`;
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

// ───────────────────────── Vollversion: KI-Tagebuch ─────────────────────────

function FullDiary() {
  const toast = useToast();
  const { data, isLoading, error } = useDiary();
  const generate = useGenerateDiary();
  const save = useSaveDiary();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (isLoading) return <LoadingScreen />;
  if (!data) {
    // Statt eines leeren Tabs: Offline-/Fehler-Hinweis (wie im Heute-Tab).
    const offline = error instanceof ApiError && error.status === 0;
    return (
      <EmptyState
        icon={<AlertCircle size={26} />}
        title={offline ? 'Server nicht erreichbar' : 'Tagebuch nicht ladbar'}
        description={
          offline
            ? 'Adresse in den Einstellungen prüfen.'
            : (error as Error | null)?.message ?? 'Bitte später erneut versuchen.'
        }
      />
    );
  }

  const { available, entries, pendingDays, noteworthyDays, model, lastGeneratedAt } = data;
  const busy = generate.isPending;

  const onGenerate = async (scope: 'missing' | 'all') => {
    if (scope === 'all' && entries.length > 0) {
      if (!window.confirm('Alle Tagebuch-Einträge neu generieren? Vorhandener (auch manuell bearbeiteter) Text wird überschrieben.')) {
        return;
      }
    }
    try {
      const res = await generate.mutateAsync({ scope });
      haptics.success();
      const parts = [`${res.generated} Tag${res.generated === 1 ? '' : 'e'} generiert`];
      if (res.pendingDays.length) parts.push(`${res.pendingDays.length} noch offen`);
      if (res.errors.length) parts.push(`${res.errors.length} Fehler`);
      toast.show({
        tone: res.errors.length ? 'warning' : 'success',
        message: 'Tagebuch aktualisiert',
        detail: parts.join(' · '),
      });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Generierung fehlgeschlagen', detail: (e as Error).message });
    }
  };

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      haptics.success();
      toast.show({ message: 'Tagebuch gespeichert' });
      setEditing(false);
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Speichern fehlgeschlagen', detail: (e as Error).message });
    }
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <SectionLabel>Tagebuch-Datei bearbeiten</SectionLabel>
        <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} rows={22} className="font-mono text-[13px]" />
        <div className="flex items-center gap-3">
          <Button variant="ghost" icon={<X size={17} />} onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
          <div className="flex-1" />
          <Button icon={<Check size={18} />} onClick={onSave} loading={save.isPending}>
            Speichern
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statuskarte + Aktionen */}
      <Card className="p-4 space-y-3">
        {!available && (
          <div className="flex items-start gap-3 rounded-2xl bg-warn/10 p-3">
            <AlertCircle size={18} className="text-warn shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-ink">KI-Generierung nicht konfiguriert</p>
              <p className="text-ink-muted text-xs leading-snug mt-0.5">
                Setze <span className="font-mono">ANTHROPIC_API_KEY</span> (und optional{' '}
                <span className="font-mono">DIARY_MODEL</span>) in der <span className="font-mono">.env</span> des
                Servers, um Tagebuch-Texte zu erzeugen. Die Kurzversion funktioniert auch ohne.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge tone="primary">{entries.length} generiert</Badge>
          {pendingDays.length > 0 && <Badge tone="warn">{pendingDays.length} offen</Badge>}
          <Badge tone="neutral">{noteworthyDays.length} Tage mit Notizen</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            icon={<Sparkles size={16} />}
            onClick={() => onGenerate('missing')}
            loading={busy}
            disabled={!available || pendingDays.length === 0}
          >
            {pendingDays.length > 0 ? `${pendingDays.length} offene Tage generieren` : 'Alles aktuell'}
          </Button>
          {entries.length > 0 && (
            <Button
              size="sm"
              variant="soft"
              icon={<RefreshCw size={15} />}
              onClick={() => onGenerate('all')}
              loading={busy}
              disabled={!available}
            >
              Alles neu
            </Button>
          )}
          {(entries.length > 0 || data.raw.trim()) && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={15} />}
              onClick={() => {
                setDraft(data.raw);
                setEditing(true);
              }}
            >
              Bearbeiten
            </Button>
          )}
        </div>

        {(lastGeneratedAt || model) && (
          <p className="text-[11px] text-ink-faint">
            {lastGeneratedAt && <>Zuletzt generiert {formatDayLabel(lastGeneratedAt.slice(0, 10))} · </>}
            Modell {model}
          </p>
        )}
      </Card>

      {/* Generierte Einträge */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} />}
          title="Noch kein Tagebuch erzeugt"
          description={
            available
              ? 'Tippe oben auf „offene Tage generieren", um aus deinen Notizen einen Tagebuch-Text zu erstellen.'
              : 'Sobald ein API-Key hinterlegt ist, kannst du hier aus deinen Notizen ein Tagebuch generieren.'
          }
          action={
            !available ? (
              <Link to="/einstellungen">
                <Button size="sm" variant="soft">
                  Einstellungen
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <DiaryEntryCard key={entry.date} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiaryEntryCard({ entry }: { entry: DiaryEntry }) {
  const paragraphs = entry.body.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  return (
    <Card className="p-4">
      <h2 className="font-display text-lg text-ink mb-2">{entry.heading || formatDayLabel(entry.date)}</h2>
      <div className="space-y-2.5">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-ink-muted">
            {p}
          </p>
        ))}
      </div>
    </Card>
  );
}
