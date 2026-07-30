import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarRange, Clock, Info, Sparkles, FlaskConical, RefreshCw, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SectionLabel, EmptyState, LoadingScreen } from '../components/ui/feedback';
import { SubstanceSeal } from '../components/SubstanceSeal';
import { TrendChart } from '../components/TrendChart';
import { useToast } from '../components/Toaster';
import { VBars, HBars, Punchcard, DaypartChart, DualAxis, type HBarItem, type PunchSelection } from '../components/charts';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { metricList } from '../lib/metrics';
import { daypartList } from '../lib/plan';
import { useT, type MessageKey } from '../lib/i18n';
import { dateNDaysAgo, todayStr, formatDayLabel, formatDayShort, colorForName } from '../lib/format';
import {
  useIntakes,
  useSubstances,
  useAssessments,
  usePlanVersionsWithItems,
  useIngredients,
  useAnalyzeIngredients,
} from '../lib/queries';
import { isPlanIntake, planDoseIndex, nameKey, type PlanDoseEntry } from '../lib/plan';
import {
  dayAxis,
  ranking,
  punchcard,
  dailyDoseSeries,
  daypartDistribution,
  pearson,
  correlationBucket,
  compoundReports,
  equivalentFor,
  formatNum,
  formatMass,
  unitLabel,
  DAYPART_DEFS,
  type CompoundReport,
} from '../lib/analytics';
import type { Intake } from '../lib/types';

/** Compound-specific colours (fallback: stable derivation from the key). */
const COMPOUND_COLORS: Record<string, string> = {
  caffeine: '#9C6B43',
  alcohol: '#7A5EA6',
  sugar: '#C86B9C',
  nicotine: '#6B7280',
  thc: '#5E8C61',
  cbd: '#4FA3A0',
  taurine: '#C99A46',
  theanine: '#5B8DB8',
};
function compoundColor(key: string): string {
  return COMPOUND_COLORS[key] ?? colorForName(key);
}

const RANGES = [
  { days: 7, label: '7 d' },
  { days: 30, label: '30 d' },
  { days: 90, label: '90 d' },
  { days: 180, label: '180 d' },
];

/** Stable empty index for intakes that have no effective plan version. */
const EMPTY_INDEX: Map<string, PlanDoseEntry> = new Map();

export function StatistikScreen() {
  const t = useT();
  const [range, setRange] = useState(30);
  const from = dateNDaysAgo(range + 1);

  const { data: substances = [] } = useSubstances(true);
  const { data: intakes = [], isLoading } = useIntakes({ from, limit: 2000 });
  const { data: assessments = [] } = useAssessments(from, todayStr());
  const { data: planVersions = [] } = usePlanVersionsWithItems();

  // Labels that depend on the active locale — call them in render so a
  // language switch produces fresh strings.
  const metrics = useMemo(() => metricList(), []);
  const dayparts = useMemo(() => daypartList(), []);
  const daypartLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of dayparts) m[d.key] = d.label;
    return m;
  }, [dayparts]);

  const days = useMemo(() => dayAxis(range), [range]);
  const daySet = useMemo(() => new Set(days), [days]);
  // Confine to the visible consumption-day window (the fetch deliberately
  // covers one extra day to bridge the 03:30 boundary).
  const rangeIntakes = useMemo(() => intakes.filter((i) => daySet.has(i.date)), [intakes, daySet]);
  const byDate = useMemo(() => {
    const m = new Map<string, Intake[]>();
    for (const it of rangeIntakes) {
      const arr = m.get(it.date) ?? [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return m;
  }, [rangeIntakes]);

  const rank = useMemo(() => ranking(rangeIntakes, substances), [rangeIntakes, substances]);
  const punch = useMemo(() => punchcard(rangeIntakes, substances, days), [rangeIntakes, substances, days]);
  const daypart = useMemo(() => daypartDistribution(rangeIntakes), [rangeIntakes]);

  // ── Plan adherence: every intake against the plan version effective at
  // its time (pattern from HistoryScreen). ──
  const indexByVersion = useMemo(() => {
    const m = new Map<number, Map<string, PlanDoseEntry>>();
    for (const v of planVersions) m.set(v.versionId, planDoseIndex({ items: v.items }));
    return m;
  }, [planVersions]);
  const versionsByRecency = useMemo(
    () =>
      [...planVersions]
        .filter((v) => !!v.effectiveFrom)
        .sort((a, b) =>
          a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.versionId - a.versionId,
        ),
    [planVersions],
  );
  const indexForIntake = useMemo(
    () => (it: Intake): Map<string, PlanDoseEntry> => {
      const v = versionsByRecency.find((ver) => ver.effectiveFrom <= it.takenAt);
      return (v && indexByVersion.get(v.versionId)) ?? EMPTY_INDEX;
    },
    [versionsByRecency, indexByVersion],
  );

  const adherence = useMemo(() => {
    let planTotal = 0;
    let allTotal = 0;
    const daily = days.map((date) => {
      const dayIntakes = byDate.get(date);
      if (!dayIntakes || dayIntakes.length === 0) return null;
      const plan = dayIntakes.filter((i) => isPlanIntake(i, indexForIntake(i))).length;
      planTotal += plan;
      allTotal += dayIntakes.length;
      return plan / dayIntakes.length;
    });
    return { daily, overall: allTotal ? planTotal / allTotal : null, hasPlan: planVersions.length > 0 };
  }, [days, byDate, indexForIntake, planVersions.length]);

  // ── Selection state ──
  const [selKey, setSelKey] = useState<string>('');
  const doseStat = rank.find((r) => r.key === selKey) ?? rank[0] ?? null;
  const [doseSel, setDoseSel] = useState<number | null>(null);

  const doseSeries = useMemo(() => {
    if (!doseStat) return null;
    const own = rangeIntakes.filter((i) => nameKey(i.substanceName) === doseStat.key);
    return dailyDoseSeries(own, days);
  }, [doseStat, rangeIntakes, days]);

  const [punchSel, setPunchSel] = useState<PunchSelection | null>(null);
  const [punchExpanded, setPunchExpanded] = useState(false);

  // ── Wellbeing correlation ──
  const [wellKey, setWellKey] = useState<string>('');
  const wellStat = rank.find((r) => r.key === wellKey) ?? rank[0] ?? null;
  const [metricKey, setMetricKey] = useState<string>('sleep_quality');
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const assessmentByDate = useMemo(() => new Map(assessments.map((a) => [a.date, a])), [assessments]);

  const wellData = useMemo(() => {
    if (!wellStat) return null;
    const own = rangeIntakes.filter((i) => nameKey(i.substanceName) === wellStat.key);
    const series = dailyDoseSeries(own, days);
    const dose = series.days.map((d) => d.value);
    const metricVals = days.map((d) => assessmentByDate.get(d)?.scores[metric.key] ?? null);
    // Correlation across days WITH a score (dose 0 on no-intake days is real).
    const xs: number[] = [];
    const ys: number[] = [];
    metricVals.forEach((mv, i) => {
      if (mv != null) {
        xs.push(dose[i]);
        ys.push(mv);
      }
    });
    return { series, dose, metricVals, r: pearson(xs, ys), pairs: xs.length };
  }, [wellStat, rangeIntakes, days, assessmentByDate, metric.key]);

  // ── Active-ingredient balance (AI profiles) ──
  const { data: ingredients } = useIngredients();
  const analyze = useAnalyzeIngredients();
  const toast = useToast();
  const reports = useMemo(
    () => (ingredients?.profiles ? compoundReports(rangeIntakes, ingredients.profiles, substances, days) : []),
    [ingredients?.profiles, rangeIntakes, substances, days],
  );
  const [compoundKey, setCompoundKey] = useState<string>('');
  const report = reports.find((r) => r.compound === compoundKey) ?? reports[0] ?? null;
  const [compoundSel, setCompoundSel] = useState<number | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);

  const runAnalyze = async (scope: 'missing' | 'all') => {
    try {
      const res = await analyze.mutateAsync({ scope });
      haptics.success();
      const detail = res.errors.length
        ? `${t('stats.toast.analysisDetail', { count: res.analyzed })}${t('stats.toast.analysisErrors', { count: res.errors.length })}`
        : t('stats.toast.analysisDetail', { count: res.analyzed });
      toast.show({ message: t('stats.toast.analysisDone'), detail });
    } catch (e) {
      haptics.warning();
      toast.show({ message: t('stats.toast.analysisFailed'), detail: (e as Error).message });
    }
  };

  // ── KPI values ──
  const busiest = DAYPART_DEFS.reduce((a, b) => (daypart.counts[b.key] > daypart.counts[a.key] ? b : a), DAYPART_DEFS[0]);

  const rankItems: HBarItem[] = rank.slice(0, 12).map((s) => ({
    key: s.key,
    label: s.name,
    value: s.count,
    valueLabel: `${s.count}×`,
    sub: s.daysUsed === 1 ? `1 ${t('stats.day.one')}` : t('stats.day.many', { count: s.daysUsed }),
    color: s.color,
    leading: <SubstanceSeal name={s.name} color={s.color} size="sm" />,
  }));

  const punchRows = punchExpanded ? punch : punch.slice(0, 10);
  const punchDetail = punchSel
    ? (() => {
        const row = punch.find((r) => r.stat.key === punchSel.key);
        if (!row) return null;
        return {
          name: row.stat.name,
          color: row.stat.color,
          date: days[punchSel.index],
          count: row.counts[punchSel.index],
          label: row.labels[punchSel.index],
        };
      })()
    : null;

  const intakeAria = (name: string, count: number) => t('stats.chart.intakesAria', { name, count });

  return (
    <>
      <PageHeader
        title={t('nav.stats')}
        eyebrow={t('stats.header.eyebrow', { intakes: rangeIntakes.length, substances: rank.length, days: range })}
      />

      <RangeTabs range={range} onChange={setRange} />

      {isLoading ? (
        <LoadingScreen />
      ) : rangeIntakes.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={26} />}
          title={t('stats.empty.title')}
          description={t('stats.empty.description')}
        />
      ) : (
        <div className="space-y-4 mt-5">
          {/* 1) KPI band */}
          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              label={t('stats.kpi.intakes')}
              value={String(rangeIntakes.length)}
              sub={t('stats.kpi.averagePerDay', { value: formatNum(rangeIntakes.length / range) })}
            />
            <KpiTile label={t('stats.kpi.substances')} value={String(rank.length)} sub={t('stats.kpi.activeInRange')} />
            <KpiTile
              label={t('stats.kpi.adherence')}
              value={adherence.overall != null ? `${Math.round(adherence.overall * 100)}%` : '–'}
              sub={adherence.hasPlan ? t('stats.kpi.plannedIntakes') : t('stats.kpi.noPlan')}
            />
            <KpiTile
              label={t('stats.kpi.busiestTime')}
              value={daypartLabel[busiest.key] ?? busiest.key}
              sub={t('stats.hourSuffix', { range: busiest.range })}
            />
          </div>

          {/* 2) Consumption calendar */}
          <Module
            icon={<CalendarRange size={16} />}
            title={t('stats.calendar.title')}
            subtitle={t('stats.calendar.subtitle')}
          >
            <Punchcard rows={punchRows} days={days} selected={punchSel} onSelect={setPunchSel} intakeAria={intakeAria} />
            {punchDetail && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface2 px-3 py-2">
                <SubstanceSeal name={punchDetail.name} color={punchDetail.color} size="sm" />
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-ink">{punchDetail.name}</span>
                  <span className="text-ink-muted"> · {formatDayLabel(punchDetail.date)}</span>
                  {punchDetail.count > 0 ? (
                    <span className="text-ink-muted">
                      {' '}
                      · {punchDetail.count}× {punchDetail.label && `· ${punchDetail.label}`}
                    </span>
                  ) : (
                    <span className="text-ink-faint"> · {t('stats.calendar.noIntake')}</span>
                  )}
                </div>
              </div>
            )}
            {punch.length > 10 && (
              <button
                onClick={() => {
                  haptics.select();
                  setPunchExpanded((v) => !v);
                }}
                className="press mt-3 text-[13px] font-medium text-primary"
              >
                {punchExpanded
                  ? t('stats.calendar.less')
                  : t('stats.calendar.more', { count: punch.length - 10 })}
              </button>
            )}
          </Module>

          {/* 3) Amount over time */}
          <Module
            icon={<BarChart3 size={16} />}
            title={t('stats.amount.title')}
            subtitle={t('stats.amount.subtitle')}
          >
            <SubstanceChips items={rank} activeKey={doseStat?.key} onPick={(k) => { setSelKey(k); setDoseSel(null); }} />
            {doseStat && doseSeries && (
              <div className="mt-3">
                <div className="flex items-end justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-display text-2xl leading-none text-ink tabular">
                      {doseSeries.mode === 'dose'
                        ? `${formatNum(doseSeries.total)} ${unitLabel(doseSeries.unit)}`
                        : `${doseSeries.total}×`}
                    </p>
                    <p className="text-[12px] text-ink-muted mt-1">
                      {doseSeries.mode === 'dose'
                        ? t('stats.amount.totalAverageDose', {
                            value: `${formatNum(doseSeries.avgPerActiveDay)} ${unitLabel(doseSeries.unit)}`,
                          })
                        : t('stats.amount.totalAverageCount', { value: formatNum(doseSeries.avgPerActiveDay) })}
                    </p>
                  </div>
                  {doseSeries.mode === 'count' && (
                    <span className="shrink-0 text-[11px] text-ink-faint text-right max-w-[10rem] leading-snug">
                      {t('stats.amount.countFallback')}
                    </span>
                  )}
                </div>
                <VBars
                  values={doseSeries.days.map((d) => d.value)}
                  color={doseStat.color}
                  avg={doseSeries.avgPerActiveDay}
                  selectedIndex={doseSel}
                  onSelect={(i) => { haptics.select(); setDoseSel((s) => (s === i ? null : i)); }}
                />
                <AxisTicks days={days} />
                {doseSel != null && (
                  <p className="mt-2 text-sm text-ink-muted">
                    <span className="font-medium text-ink">{formatDayLabel(days[doseSel])}</span>
                    {' · '}
                    {doseSeries.mode === 'dose'
                      ? `${formatNum(doseSeries.days[doseSel].value)} ${unitLabel(doseSeries.unit)}`
                      : `${doseSeries.days[doseSel].count}×`}
                    {doseSeries.mode === 'dose' && doseSeries.days[doseSel].count > 1 && (
                      <span className="text-ink-faint"> ({doseSeries.days[doseSel].count}×)</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </Module>

          {/* 3b) Active-ingredient balance (AI) */}
          <Module
            icon={<FlaskConical size={16} />}
            title={t('stats.ingredients.title')}
            subtitle={t('stats.ingredients.subtitle')}
          >
            {!ingredients ? (
              <p className="text-[13px] text-ink-faint">{t('state.loading')}</p>
            ) : !ingredients.available ? (
              <p className="text-[13px] text-ink-muted leading-snug">
                {t('stats.ingredients.unavailable', { key: 'MINIMAX_API_KEY' })}
              </p>
            ) : (
              <>
                <AnalyzeBar
                  analyzed={Object.keys(ingredients.profiles).length}
                  total={ingredients.total}
                  pending={ingredients.missing.length + ingredients.stale.length}
                  model={ingredients.model}
                  pendingRun={analyze.isPending}
                  onAnalyze={() => runAnalyze('missing')}
                  onReanalyzeAll={() => runAnalyze('all')}
                />

                {report ? (
                  <div className="mt-3">
                    <CompoundChips
                      reports={reports}
                      activeKey={report.compound}
                      onPick={(k) => { setCompoundKey(k); setCompoundSel(null); }}
                    />

                    {/* Headline */}
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[28px] leading-none text-ink tabular">
                          {formatMass(report.totalMg)}
                        </p>
                        <p className="text-[12px] text-ink-muted mt-1">
                          {t('stats.ingredients.totalAverage', {
                            label: report.label,
                            value: formatMass(report.avgPerActiveDay),
                          })}
                        </p>
                        {(() => {
                          const eq = equivalentFor(report.compound, report.totalMg);
                          if (!eq) return null;
                          const key = (
                            eq.count === 1
                              ? `stats.equivalent.${eq.kind}.one`
                              : `stats.equivalent.${eq.kind}.many`
                          ) as MessageKey;
                          return (
                            <p className="text-[12px] text-ink-faint mt-0.5">{t(key, { value: formatNum(eq.count) })}</p>
                          );
                        })()}
                      </div>
                      <div
                        className="grid place-items-center size-11 rounded-2xl shrink-0"
                        style={{ backgroundColor: `${compoundColor(report.compound)}24`, color: compoundColor(report.compound) }}
                      >
                        <FlaskConical size={20} />
                      </div>
                    </div>

                    {/* Daily course */}
                    <div className="mt-3">
                      <VBars
                        values={report.perDay}
                        color={compoundColor(report.compound)}
                        avg={report.avgPerActiveDay}
                        selectedIndex={compoundSel}
                        onSelect={(i) => { haptics.select(); setCompoundSel((s) => (s === i ? null : i)); }}
                      />
                      <AxisTicks days={days} />
                      {compoundSel != null && (
                        <p className="mt-2 text-sm text-ink-muted">
                          <span className="font-medium text-ink">{formatDayLabel(days[compoundSel])}</span>
                          {' · '}
                          {formatMass(report.perDay[compoundSel])} {report.label}
                        </p>
                      )}
                    </div>

                    {/* Source breakdown */}
                    {report.bySource.length > 0 && (
                      <div className="mt-4">
                        <SectionLabel className="mb-2">{t('stats.ingredients.sources')}</SectionLabel>
                        <HBars
                          items={report.bySource.map((s): HBarItem => ({
                            key: s.key,
                            label: s.name,
                            value: s.mg,
                            valueLabel: formatMass(s.mg),
                            sub: `${Math.round((s.mg / report.totalMg) * 100)}%`,
                            color: s.color,
                            leading: <SubstanceSeal name={s.name} color={s.color} size="sm" />,
                          }))}
                        />
                      </div>
                    )}

                    {report.unquantified > 0 && (
                      <p className="mt-3 text-[11px] text-ink-faint leading-snug">
                        {report.unquantified === 1
                          ? t('stats.ingredients.unquantified.one', { count: report.unquantified })
                          : t('stats.ingredients.unquantified.many', { count: report.unquantified })}
                      </p>
                    )}

                    {/* Transparency: how the AI calculates this */}
                    <button
                      onClick={() => { haptics.select(); setProfilesOpen((v) => !v); }}
                      className="press mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink-muted"
                      aria-expanded={profilesOpen}
                    >
                      {t('stats.ingredients.explanation')}
                      <ChevronDown size={14} className={cx('transition-transform', profilesOpen && 'rotate-180')} />
                    </button>
                    {profilesOpen && (
                      <div className="mt-2 space-y-1.5">
                        {report.bySource.map((s) => {
                          const prof = ingredients.profiles[s.key]?.profile;
                          const ing = prof?.ingredients.find((x) => x.compound === report.compound);
                          if (!prof || !ing) return null;
                          return (
                            <p key={s.key} className="text-[11px] text-ink-faint leading-snug">
                              <span className="text-ink-muted font-medium">{s.name}</span> · {prof.serving.label || `1 ${prof.serving.unit}`} ·{' '}
                              {t('stats.ingredients.serving', { value: formatNum(ing.mgPerServing), label: report.label })}
                            </p>
                          );
                        })}
                        <p className="text-[11px] text-ink-faint leading-snug pt-1">
                          {t('stats.ingredients.disclaimer', { model: ingredients.model })}
                        </p>
                      </div>
                    )}
                  </div>
                ) : Object.keys(ingredients.profiles).length > 0 ? (
                  <p className="mt-3 text-[13px] text-ink-muted">{t('stats.ingredients.noneInRange')}</p>
                ) : (
                  <p className="mt-3 text-[13px] text-ink-muted leading-snug">{t('stats.ingredients.noProfiles')}</p>
                )}
              </>
            )}
          </Module>

          {/* 4) Ranking */}
          <Module icon={<BarChart3 size={16} />} title={t('stats.ranking.title')} subtitle={t('stats.ranking.subtitle')}>
            <HBars items={rankItems} />
          </Module>

          {/* 5) Time-of-day pattern */}
          <Module icon={<Clock size={16} />} title={t('stats.daypart.title')} subtitle={t('stats.daypart.subtitle')}>
            <DaypartChart dist={daypart} labels={daypartLabel} />
          </Module>

          {/* 6) Plan adherence over time */}
          {adherence.hasPlan && (
            <Module
              icon={<Sparkles size={16} />}
              title={t('stats.adherence.title')}
              subtitle={t('stats.adherence.subtitle')}
            >
              <div className="flex items-center gap-4">
                <div className="w-24 shrink-0">
                  <p className="font-display text-3xl leading-none text-ink tabular">
                    {adherence.overall != null ? `${Math.round(adherence.overall * 100)}%` : '–'}
                  </p>
                  <p className="text-[12px] text-ink-muted mt-1">{t('stats.adherence.average')}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <TrendChart
                    values={adherence.daily.map((p) => (p == null ? null : p * 9 + 1))}
                    polarity="positive"
                    height={56}
                    showDots
                  />
                </div>
              </div>
            </Module>
          )}

          {/* 7) Substance × wellbeing */}
          <Module
            icon={<Info size={16} />}
            title={t('stats.wellbeing.title')}
            subtitle={t('stats.wellbeing.subtitle')}
          >
            <SubstanceChips items={rank} activeKey={wellStat?.key} onPick={setWellKey} />
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mt-2 pb-1">
              {metrics.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { haptics.select(); setMetricKey(m.key); }}
                  className={cx(
                    'press shrink-0 rounded-full h-8 px-3 text-[13px] font-medium ring-1 transition-colors',
                    m.key === metric.key
                      ? 'bg-accent text-accent-fg ring-transparent'
                      : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
                  )}
                >
                  {m.short}
                </button>
              ))}
            </div>

            {wellStat && wellData && (
              <div className="mt-3">
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ backgroundColor: wellStat.color, opacity: 0.4 }} />
                    {t('stats.wellbeing.dose', { name: wellStat.name })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3.5 h-0.5 rounded-full bg-ink/60" />
                    {metric.label} (1–10)
                  </span>
                </div>
                <DualAxis
                  dose={wellData.dose}
                  metric={wellData.metricVals}
                  doseColor={wellStat.color}
                  polarity={metric.polarity}
                />
                <AxisTicks days={days} />

                <div className="mt-3 rounded-2xl bg-surface2 px-3.5 py-2.5">
                  {wellData.r != null ? (
                    <>
                      <p className="text-sm text-ink">
                        <span className="font-display text-xl tabular mr-1.5">r = {formatNum(wellData.r)}</span>
                        {t(`stats.wellbeing.correlation.${correlationBucket(wellData.r)}` as MessageKey)}
                      </p>
                      <p className="text-[11px] text-ink-faint mt-1 leading-snug">
                        {t('stats.wellbeing.correlation.note', { count: wellData.pairs })}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-ink-muted">{t('stats.wellbeing.tooFew')}</p>
                  )}
                </div>
              </div>
            )}
          </Module>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Building blocks ─────────────────────────

function RangeTabs({ range, onChange }: { range: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-2">
      {RANGES.map((r) => (
        <button
          key={r.days}
          onClick={() => { haptics.select(); onChange(r.days); }}
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
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="font-display text-[26px] leading-tight text-ink mt-0.5 tabular truncate">{value}</p>
      {sub && <p className="text-[12px] text-ink-muted truncate">{sub}</p>}
    </Card>
  );
}

function Module({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="grid place-items-center size-6 rounded-lg bg-surface2 text-ink-muted shrink-0">{icon}</span>
        <SectionLabel>{title}</SectionLabel>
      </div>
      {subtitle && <p className="text-[12px] text-ink-muted leading-snug mb-3 pl-8">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </Card>
  );
}

function SubstanceChips({
  items,
  activeKey,
  onPick,
}: {
  items: { key: string; name: string; color: string }[];
  activeKey?: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {items.map((s) => (
        <button
          key={s.key}
          onClick={() => { haptics.select(); onPick(s.key); }}
          className={cx(
            'press shrink-0 inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium ring-1 transition-colors',
            s.key === activeKey ? 'bg-primary text-primary-fg ring-transparent' : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
          )}
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.name}
        </button>
      ))}
    </div>
  );
}

/** Status + AI-analysis trigger for the active-ingredient balance. */
function AnalyzeBar({
  analyzed,
  total,
  pending,
  model,
  pendingRun,
  onAnalyze,
  onReanalyzeAll,
}: {
  analyzed: number;
  total: number;
  pending: number;
  model: string;
  pendingRun: boolean;
  onAnalyze: () => void;
  onReanalyzeAll: () => void;
}) {
  const t = useT();
  if (analyzed === 0) {
    return (
      <div className="rounded-2xl bg-primary-soft/40 ring-1 ring-primary/15 p-3.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-ink">{t('stats.ingredients.start')}</p>
          <p className="text-[12px] text-ink-muted truncate">{t('stats.ingredients.substancesModel', { count: total, model })}</p>
        </div>
        <Button size="sm" icon={<Sparkles size={16} />} loading={pendingRun} onClick={onAnalyze}>
          {t('stats.ingredients.analyze')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-ink-muted tabular">
          {t('stats.ingredients.analyzed', { analyzed, total })}
          {pending > 0 ? t('stats.ingredients.pending', { count: pending }) : ''}
        </p>
        <p className="text-[11px] text-ink-faint truncate">{t('stats.ingredients.model', { model })}</p>
      </div>
      {pending > 0 ? (
        <Button size="sm" icon={<RefreshCw size={15} />} loading={pendingRun} onClick={onAnalyze}>
          {t('stats.ingredients.update', { count: pending })}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} loading={pendingRun} onClick={onReanalyzeAll}>
          {t('stats.ingredients.new')}
        </Button>
      )}
    </div>
  );
}

/** Active-ingredient picker (sorted by total mg), coloured per compound. */
function CompoundChips({
  reports,
  activeKey,
  onPick,
}: {
  reports: CompoundReport[];
  activeKey: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {reports.map((r) => {
        const active = r.compound === activeKey;
        const c = compoundColor(r.compound);
        return (
          <button
            key={r.compound}
            onClick={() => { haptics.select(); onPick(r.compound); }}
            className={cx(
              'press shrink-0 inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium ring-1 transition-colors',
              active ? 'text-white ring-transparent' : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
            )}
            style={active ? { backgroundColor: c } : undefined}
          >
            {!active && <span className="size-2 rounded-full" style={{ backgroundColor: c }} />}
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

/** Start · middle · end of the day axis (for the vertical bar charts). */
function AxisTicks({ days }: { days: string[] }) {
  const n = days.length;
  if (n < 2) return null;
  return (
    <div className="flex justify-between text-[10px] text-ink-faint tabular mt-1 px-0.5">
      <span>{formatDayShort(days[0])}</span>
      <span className={cx(n < 8 && 'sr-only')}>{formatDayShort(days[Math.floor((n - 1) / 2)])}</span>
      <span>{formatDayShort(days[n - 1])}</span>
    </div>
  );
}
