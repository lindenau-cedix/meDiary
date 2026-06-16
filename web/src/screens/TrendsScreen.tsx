import { useMemo, useState, type ReactNode } from 'react';
import { Moon, TrendingUp, TrendingDown, Minus, Plus, Calendar, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { Field, TextInput } from '../components/ui/inputs';
import { EmptyState, LoadingScreen, SectionLabel } from '../components/ui/feedback';
import { TrendChart } from '../components/TrendChart';
import { AssessmentSheet } from '../components/AssessmentSheet';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { METRICS } from '../lib/metrics';
import { scoreColor, goodness } from '../lib/colors';
import {
  todayStr,
  dateNDaysAgo,
  formatDayLabel,
  formatFull,
  relativeDays,
  consumptionToday,
} from '../lib/format';
import { useAssessments } from '../lib/queries';
import type { Assessment, Metric } from '../lib/types';

const RANGES = [
  { days: 7, label: '7 T' },
  { days: 30, label: '30 T' },
  { days: 90, label: '90 T' },
];

export function TrendsScreen() {
  const [range, setRange] = useState(30);
  const [editing, setEditing] = useState<{ open: boolean; date: string }>({
    open: false,
    date: consumptionToday(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const { data: assessments = [], isLoading } = useAssessments(dateNDaysAgo(range), todayStr());

  const valuesFor = (key: string): (number | null)[] =>
    assessments.map((a) => a.scores[key] ?? null);

  return (
    <>
      <PageHeader
        title="Werte"
        eyebrow={`${assessments.length} Tagesbilder · ${range} Tage`}
        action={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setPickerOpen(true)}>
            Neu
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => {
              haptics.select();
              setRange(r.days);
            }}
            className={cx(
              'press flex-1 rounded-2xl h-11 text-sm font-semibold ring-1 transition-colors',
              range === r.days
                ? 'bg-primary text-primary-fg ring-transparent'
                : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <>
          {/* Aktuelles Tagesbild (Konsum-Tag) — schneller Zugriff. */}
          <TodayHero
            assessments={assessments}
            onOpenToday={() => setEditing({ open: true, date: consumptionToday() })}
          />

          {/* Liste aller Tagesbilder im Zeitfenster. */}
          <div className="mt-7">
            <SectionLabel className="mb-2.5 px-1">Tagesbilder im Zeitraum</SectionLabel>
            {assessments.length === 0 ? (
              <EmptyState
                icon={<Moon size={26} />}
                title="Noch keine Tagesbilder"
                description="Nach dem Eintragen der Nachtmedikation wirst du nach deinem Tag gefragt — oder lege jetzt eines an."
                action={
                  <Button icon={<Plus size={18} />} onClick={() => setPickerOpen(true)}>
                    Tagesbild anlegen
                  </Button>
                }
              />
            ) : (
              <Card className="divide-y divide-hairline overflow-hidden">
                {[...assessments]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((a) => (
                    <AssessmentRow
                      key={a.date}
                      assessment={a}
                      onOpen={() => setEditing({ open: true, date: a.date })}
                    />
                  ))}
              </Card>
            )}
          </div>

          {/* Trends-Charts — zusammenklappbar, um die Liste nicht zu verdrängen. */}
          {assessments.length > 0 && (
            <div className="mt-7">
              <button
                onClick={() => {
                  haptics.select();
                  setChartsOpen((v) => !v);
                }}
                className="press w-full flex items-center justify-between gap-3 mb-2.5 px-1"
                aria-expanded={chartsOpen}
              >
                <SectionLabel>11 Skalen — Trends</SectionLabel>
                <ChevronDown
                  size={16}
                  className={cx('text-ink-faint transition-transform', chartsOpen && 'rotate-180')}
                />
              </button>
              {chartsOpen && (
                <div className="space-y-2.5">
                  {METRICS.map((m) => (
                    <MetricCard
                      key={m.key}
                      metric={m}
                      values={valuesFor(m.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <AssessmentSheet
        open={editing.open}
        date={editing.date}
        onClose={() => setEditing((e) => ({ ...e, open: false }))}
      />

      <DatePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(date) => {
          setPickerOpen(false);
          setEditing({ open: true, date });
        }}
      />
    </>
  );
}

/**
 * Schnellzugriff auf den heutigen Konsum-Tag: zeigt Datum, Anzahl erfasster
 * Skalen und einen Ø-Wert. Tippen = AssessmentSheet für den Konsum-Tag
 * öffnen (auch wenn das Tagesbild noch leer ist).
 */
function TodayHero({
  assessments,
  onOpenToday,
}: {
  assessments: Assessment[];
  onOpenToday: () => void;
}) {
  const today = consumptionToday();
  const cur = assessments.find((a) => a.date === today);
  const filledCount = cur
    ? METRICS.filter((m) => cur.scores[m.key] != null).length
    : 0;
  const avg = cur
    ? (() => {
        const nums = Object.values(cur.scores).filter(
          (v): v is number => typeof v === 'number',
        );
        return nums.length
          ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10
          : null;
      })()
    : null;

  return (
    <button onClick={onOpenToday} className="press w-full text-left">
      <Card className="p-4 flex items-center gap-4 hover:bg-surface2/40 transition-colors">
        <div className="grid place-items-center size-11 rounded-2xl bg-accent-soft text-accent shrink-0">
          <Moon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-ink-muted truncate">
            Heute · {formatFull(today)}
          </p>
          <p className="font-display text-2xl leading-tight text-ink mt-0.5 tabular">
            {cur
              ? `${filledCount}/${METRICS.length} Werte${avg != null ? ` · Ø ${avg}` : ''}`
              : 'Noch nicht erfasst'}
          </p>
          {cur?.note && (
            <p className="text-[13px] text-ink-muted leading-snug mt-1 line-clamp-2">
              {cur.note}
            </p>
          )}
        </div>
      </Card>
    </button>
  );
}

function stats(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  const latest = nums.at(-1) ?? null;
  const first = nums[0] ?? null;
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const min = nums.length ? Math.min(...nums) : null;
  const max = nums.length ? Math.max(...nums) : null;
  return { latest, first, avg, min, max, count: nums.length };
}

function MetricCard({ metric, values }: { metric: Metric; values: (number | null)[] }): ReactNode {
  const { latest, first } = useMemo(() => stats(values), [values]);
  const color = latest != null ? scoreColor(latest, metric.polarity) : 'rgb(var(--text-faint))';

  let Trend = Minus;
  let trendColor = 'text-ink-faint';
  if (latest != null && first != null) {
    const dg = goodness(latest, metric.polarity) - goodness(first, metric.polarity);
    if (dg > 0.001) {
      Trend = TrendingUp;
      trendColor = 'text-good';
    } else if (dg < -0.001) {
      Trend = TrendingDown;
      trendColor = 'text-bad';
    }
  }

  return (
    <Card className="p-4 flex items-center gap-4">
      <div className="w-28 shrink-0">
        <p className="font-sans text-[13px] font-semibold text-ink leading-tight">
          {metric.label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="font-display text-3xl leading-none tabular" style={{ color }}>
            {latest ?? '–'}
          </span>
          <Trend size={16} className={trendColor} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <TrendChart values={values} polarity={metric.polarity} height={52} />
      </div>
    </Card>
  );
}

function AssessmentRow({
  assessment,
  onOpen,
}: {
  assessment: Assessment;
  onOpen: () => void;
}) {
  const filledCount = METRICS.filter((m) => assessment.scores[m.key] != null).length;
  const avg = (() => {
    const nums = Object.values(assessment.scores).filter(
      (v): v is number => typeof v === 'number',
    );
    return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
  })();
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface2 transition-colors"
    >
      <div className="grid place-items-center size-9 rounded-2xl bg-surface2 shrink-0 mt-0.5">
        <Calendar size={16} className="text-ink-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-medium text-ink">{formatDayLabel(assessment.date)}</p>
          <span className="text-[11px] text-ink-faint tabular">
            {filledCount}/{METRICS.length}
            {avg != null ? ` · Ø ${Math.round(avg * 10) / 10}` : ''}
          </span>
        </div>
        <p className="text-[11px] text-ink-faint tabular mt-0.5">
          {formatFull(assessment.date)} · {relativeDays(assessment.date)}
        </p>
        {assessment.note && (
          <p className="text-[13px] text-ink-muted leading-snug mt-1 line-clamp-2">
            {assessment.note}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Minimaler Datum-Picker als Sheet: ein `type="date"` Input + ein paar
 * Schnellauswahl-Buttons (Heute, Gestern, vorgestern, vor 7 Tagen). Reicht
 * für die Aufgabe "Werte für ein bestimmtes Datum nachtragen/anlegen" — ein
 * voller Kalender ist hier überdimensioniert.
 */
function DatePickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (date: string) => void;
}) {
  const today = consumptionToday();
  const [date, setDate] = useState(today);
  const yesterday = useMemo(() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const dayBefore = useMemo(() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const sevenAgo = useMemo(() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [today]);

  // Beim Schließen + Wieder-Öffnen auf den heutigen Konsum-Tag zurücksetzen.
  if (!open && date !== today) {
    // setState während des Renderings ist in React 18 offiziell erlaubt, wenn
    // es idempotent und ohne Bedingung erfolgt (s. React 18 "set state in
    // render"-Pattern). Hier ist es beides.
    setDate(today);
  }

  const quick = (label: string, d: string) => ({ label, date: d });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      title="Tagesbild anlegen"
      subtitle="Wähle einen Konsum-Tag (Tagesgrenze 03:30)"
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-ink-muted">
            <span className="tabular font-semibold text-ink">{date || '—'}</span>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            icon={<Plus size={18} />}
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
            onClick={() => onPick(date)}
          >
            Anlegen
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Field label="Datum">
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
          />
        </Field>

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2 pl-1">
            Schnellauswahl
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              quick('Heute', today),
              quick('Gestern', yesterday),
              quick('Vorgestern', dayBefore),
              quick('Vor 7 Tagen', sevenAgo),
            ].map((q) => (
              <button
                key={q.date}
                onClick={() => {
                  haptics.select();
                  setDate(q.date);
                }}
                className={cx(
                  'press rounded-full h-9 px-3.5 text-sm font-medium ring-1 transition-colors',
                  date === q.date
                    ? 'bg-primary text-primary-fg ring-transparent'
                    : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-ink-faint leading-relaxed">
          Hinweis: Der Server arbeitet mit <strong>Konsum-Tagen</strong> (Tagesgrenze 03:30).
          Eine Eingabe 00:00–03:29 zählt zum Vortag — beim Eintragen der
          Nachtmedikation wird der passende Konsum-Tag automatisch gesetzt.
        </p>
      </div>
    </Sheet>
  );
}
