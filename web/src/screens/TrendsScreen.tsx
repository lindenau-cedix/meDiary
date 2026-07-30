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
import { metricList } from '../lib/metrics';
import { useT } from '../lib/i18n';
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
  const t = useT();
  const [range, setRange] = useState(30);
  const [editing, setEditing] = useState<{ open: boolean; date: string }>({
    open: false,
    date: consumptionToday(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const { data: assessments = [], isLoading } = useAssessments(dateNDaysAgo(range), todayStr());

  // Locale-aware: metric labels and range eyebrow depend on the active locale,
  // so the list/metrics are recomputed on every render rather than memoised.
  const metrics = metricList();

  const valuesFor = (key: string): (number | null)[] =>
    assessments.map((a) => a.scores[key] ?? null);

  return (
    <>
      <PageHeader
        title={t('nav.values')}
        eyebrow={t('trends.eyebrow', {
          count: assessments.length === 1
            ? t('trends.eyebrowCount.one', { count: assessments.length })
            : t('trends.eyebrowCount.many', { count: assessments.length }),
          range,
        })}
        action={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setPickerOpen(true)}>
            {t('action.add')}
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
          {/* Current assessment (consumption day) — quick access. */}
          <TodayHero
            assessments={assessments}
            metrics={metrics}
            onOpenToday={() => setEditing({ open: true, date: consumptionToday() })}
          />

          {/* All assessments within the time window. */}
          <div className="mt-7">
            <SectionLabel className="mb-2.5 px-1">{t('trends.list.heading')}</SectionLabel>
            {assessments.length === 0 ? (
              <EmptyState
                icon={<Moon size={26} />}
                title={t('trends.empty.title')}
                description={t('trends.empty.description')}
                action={
                  <Button icon={<Plus size={18} />} onClick={() => setPickerOpen(true)}>
                    {t('trends.empty.action')}
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
                      metrics={metrics}
                      onOpen={() => setEditing({ open: true, date: a.date })}
                    />
                  ))}
              </Card>
            )}
          </div>

          {/* Trend charts — collapsible so they don't push the list down. */}
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
                <SectionLabel>{t('trends.charts.heading')}</SectionLabel>
                <ChevronDown
                  size={16}
                  className={cx('text-ink-faint transition-transform', chartsOpen && 'rotate-180')}
                />
              </button>
              {chartsOpen && (
                <div className="space-y-2.5">
                  {metrics.map((m) => (
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
 * Quick-access card for today's consumption day: shows the date, how many of
 * the 11 scales are filled, and an average. Tapping opens the AssessmentSheet
 * for the consumption day (even when no assessment exists yet).
 */
function TodayHero({
  assessments,
  metrics,
  onOpenToday,
}: {
  assessments: Assessment[];
  metrics: Metric[];
  onOpenToday: () => void;
}) {
  const t = useT();
  const today = consumptionToday();
  const cur = assessments.find((a) => a.date === today);
  const filledCount = cur
    ? metrics.filter((m) => cur.scores[m.key] != null).length
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
            {t('trends.today.eyebrow', { date: formatFull(today) })}
          </p>
          <p className="font-display text-2xl leading-tight text-ink mt-0.5 tabular">
            {cur
              ? avg != null
                ? t('trends.today.filled', { filled: filledCount, total: metrics.length, avg })
                : t('trends.today.filledNoAvg', { filled: filledCount, total: metrics.length })
              : t('trends.today.empty')}
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
  metrics,
  onOpen,
}: {
  assessment: Assessment;
  metrics: Metric[];
  onOpen: () => void;
}) {
  const t = useT();
  const filledCount = metrics.filter((m) => assessment.scores[m.key] != null).length;
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
            {avg != null
              ? t('trends.row.summaryWithAvg', {
                  filled: filledCount,
                  total: metrics.length,
                  avg: Math.round(avg * 10) / 10,
                })
              : t('trends.row.summaryNoAvg', { filled: filledCount, total: metrics.length })}
          </span>
        </div>
        <p className="text-[11px] text-ink-faint tabular mt-0.5">
          {t('trends.row.meta', { date: formatFull(assessment.date), relative: relativeDays(assessment.date) })}
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
 * Minimal date picker as a Sheet: a `type="date"` input plus a handful of
 * quick-pick buttons (today, yesterday, day before, 7 days ago). Enough for
 * the "log or amend scores for a given date" use case — a full calendar
 * would be overkill here.
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
  const t = useT();
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

  // Reset to today whenever the sheet closes + reopens. setState during
  // render is officially allowed in React 18 when idempotent and unconditional
  // (see React 18 "set state in render" pattern) — that is the case here.
  if (!open && date !== today) {
    setDate(today);
  }

  const quick = (label: string, d: string) => ({ label, date: d });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      title={t('trends.picker.title')}
      subtitle={t('trends.picker.subtitle')}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-ink-muted">
            <span className="tabular font-semibold text-ink">{date || '—'}</span>
          </div>
          <Button variant="ghost" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            icon={<Plus size={18} />}
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
            onClick={() => onPick(date)}
          >
            {t('action.add')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Field label={t('trends.picker.field.date')}>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
          />
        </Field>

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2 pl-1">
            {t('trends.picker.quickHeading')}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              quick(t('trends.picker.quick.today'), today),
              quick(t('trends.picker.quick.yesterday'), yesterday),
              quick(t('trends.picker.quick.dayBefore'), dayBefore),
              quick(t('trends.picker.quick.sevenAgo'), sevenAgo),
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

        <p
          className="text-[12px] text-ink-faint leading-relaxed"
          // The picker note embeds a <strong> around "consumption day" for
          // emphasis; HTML is intentional and lives inside the catalog string.
          dangerouslySetInnerHTML={{ __html: t('trends.picker.note') }}
        />
      </div>
    </Sheet>
  );
}