import { useMemo, useState } from 'react';
import { Moon, TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { EmptyState, LoadingScreen } from '../components/ui/feedback';
import { TrendChart } from '../components/TrendChart';
import { AssessmentSheet } from '../components/AssessmentSheet';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { METRICS } from '../lib/metrics';
import { scoreColor, goodness } from '../lib/colors';
import { todayStr, dateNDaysAgo, formatDayLabel } from '../lib/format';
import { useAssessments } from '../lib/queries';
import type { Assessment, Metric } from '../lib/types';

const RANGES = [
  { days: 7, label: '7 T' },
  { days: 30, label: '30 T' },
  { days: 90, label: '90 T' },
];

export function TrendsScreen() {
  const [range, setRange] = useState(30);
  const [assessOpen, setAssessOpen] = useState(false);
  const [detail, setDetail] = useState<Metric | null>(null);
  const { data: assessments = [], isLoading } = useAssessments(dateNDaysAgo(range), todayStr());

  const valuesFor = (key: string): (number | null)[] => assessments.map((a) => a.scores[key] ?? null);

  return (
    <>
      <PageHeader
        title="Werte"
        eyebrow={`${assessments.length} Tagesbilder`}
        action={
          <Button size="sm" icon={<Moon size={16} />} onClick={() => setAssessOpen(true)}>
            Heute
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
              range === r.days ? 'bg-primary text-primary-fg ring-transparent' : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingScreen />
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={<LineChartIcon size={26} />}
          title="Noch keine Tagesbilder"
          description="Nach dem Eintragen der Nachtmedikation wirst du nach deinem Tag gefragt — oder bewerte jetzt."
          action={
            <Button icon={<Moon size={18} />} onClick={() => setAssessOpen(true)}>
              Heute bewerten
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {METRICS.map((m) => (
            <MetricCard
              key={m.key}
              metric={m}
              values={valuesFor(m.key)}
              onOpen={() => {
                haptics.light();
                setDetail(m);
              }}
            />
          ))}
        </div>
      )}

      <MetricDetailSheet metric={detail} assessments={assessments} onClose={() => setDetail(null)} />
      <AssessmentSheet open={assessOpen} date={todayStr()} onClose={() => setAssessOpen(false)} />
    </>
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

function MetricCard({ metric, values, onOpen }: { metric: Metric; values: (number | null)[]; onOpen: () => void }) {
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
    <button onClick={onOpen} className="press w-full text-left">
      <Card className="p-4 flex items-center gap-4 hover:bg-surface2/50 transition-colors">
        <div className="w-28 shrink-0">
          <p className="font-sans text-[13px] font-semibold text-ink leading-tight">{metric.label}</p>
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
    </button>
  );
}

function MetricDetailSheet({
  metric,
  assessments,
  onClose,
}: {
  metric: Metric | null;
  assessments: Assessment[];
  onClose: () => void;
}) {
  const values = metric ? assessments.map((a) => a.scores[metric.key] ?? null) : [];
  const s = stats(values);
  const recent = useMemo(() => {
    if (!metric) return [];
    return assessments
      .map((a) => ({ date: a.date, value: a.scores[metric.key] ?? null }))
      .filter((r) => r.value != null)
      .reverse()
      .slice(0, 14);
  }, [metric, assessments]);

  return (
    <Sheet
      open={metric != null}
      onClose={onClose}
      size="lg"
      title={metric?.label}
      subtitle={metric ? `${metric.lowLabel} → ${metric.highLabel}` : undefined}
    >
      {metric && (
        <div className="space-y-5 pt-1">
          <Card className="p-4">
            <TrendChart values={values} polarity={metric.polarity} height={150} showDots showArea />
          </Card>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Aktuell', value: s.latest },
              { label: 'Ø', value: s.avg != null ? Math.round(s.avg * 10) / 10 : null },
              { label: 'Min', value: s.min },
              { label: 'Max', value: s.max },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-surface2 py-3 text-center">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">{stat.label}</p>
                <p
                  className="font-display text-2xl tabular mt-0.5"
                  style={{ color: stat.value != null ? scoreColor(Number(stat.value), metric.polarity) : undefined }}
                >
                  {stat.value ?? '–'}
                </p>
              </div>
            ))}
          </div>

          <div>
            <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint mb-2 px-1">
              Letzte Einträge
            </p>
            <div className="space-y-1">
              {recent.map((r) => (
                <div key={r.date} className="flex items-center gap-3 px-1 py-1.5">
                  <span className="text-sm text-ink-muted w-28 shrink-0">{formatDayLabel(r.date)}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(r.value! / 10) * 100}%`, backgroundColor: scoreColor(r.value!, metric.polarity) }}
                    />
                  </div>
                  <span
                    className="tabular text-sm font-semibold w-6 text-right"
                    style={{ color: scoreColor(r.value!, metric.polarity) }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
