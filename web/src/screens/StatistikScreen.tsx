import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarRange, Clock, Info, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { SectionLabel, EmptyState, LoadingScreen } from '../components/ui/feedback';
import { SubstanceSeal } from '../components/SubstanceSeal';
import { TrendChart } from '../components/TrendChart';
import { VBars, HBars, Punchcard, DaypartChart, DualAxis, type HBarItem, type PunchSelection } from '../components/charts';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { METRICS } from '../lib/metrics';
import { dateNDaysAgo, todayStr, formatDayLabel, formatDayShort } from '../lib/format';
import { useIntakes, useSubstances, useAssessments, usePlanVersionsWithItems } from '../lib/queries';
import { isPlanIntake, planDoseIndex, nameKey, type PlanDoseEntry } from '../lib/plan';
import {
  dayAxis,
  ranking,
  punchcard,
  dailyDoseSeries,
  daypartDistribution,
  pearson,
  correlationLabel,
  formatNum,
  unitLabel,
  DAYPART_DEFS,
} from '../lib/analytics';
import type { Intake } from '../lib/types';

const RANGES = [
  { days: 7, label: '7 T' },
  { days: 30, label: '30 T' },
  { days: 90, label: '90 T' },
  { days: 180, label: '180 T' },
];

/** Stabiler Leer-Index für Einnahmen ohne wirksame Plan-Version. */
const EMPTY_INDEX: Map<string, PlanDoseEntry> = new Map();

export function StatistikScreen() {
  const [range, setRange] = useState(30);
  const from = dateNDaysAgo(range + 1);

  const { data: substances = [] } = useSubstances(true);
  const { data: intakes = [], isLoading } = useIntakes({ from, limit: 2000 });
  const { data: assessments = [] } = useAssessments(from, todayStr());
  const { data: planVersions = [] } = usePlanVersionsWithItems();

  const days = useMemo(() => dayAxis(range), [range]);
  const daySet = useMemo(() => new Set(days), [days]);
  // Auf das sichtbare Konsum-Tag-Fenster begrenzen (der Fetch holt bewusst
  // einen Tag mehr, um die 03:30-Grenze abzudecken).
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

  // ── Plan-Treue: jede Einnahme gegen die zu ihrem Zeitpunkt wirksame Version
  // (Muster aus HistoryScreen). ──
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

  // ── Auswahl-States ──
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

  // ── Wohlbefinden-Korrelation ──
  const [wellKey, setWellKey] = useState<string>('');
  const wellStat = rank.find((r) => r.key === wellKey) ?? rank[0] ?? null;
  const [metricKey, setMetricKey] = useState<string>('sleep_quality');
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const assessmentByDate = useMemo(() => new Map(assessments.map((a) => [a.date, a])), [assessments]);

  const wellData = useMemo(() => {
    if (!wellStat) return null;
    const own = rangeIntakes.filter((i) => nameKey(i.substanceName) === wellStat.key);
    const series = dailyDoseSeries(own, days);
    const dose = series.days.map((d) => d.value);
    const metricVals = days.map((d) => assessmentByDate.get(d)?.scores[metric.key] ?? null);
    // Korrelation über Tage MIT Skalenwert (Dosis 0 an Nicht-Einnahme-Tagen ist real).
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

  // ── KPI-Werte ──
  const busiest = DAYPART_DEFS.reduce((a, b) => (daypart.counts[b.key] > daypart.counts[a.key] ? b : a), DAYPART_DEFS[0]);

  const rankItems: HBarItem[] = rank.slice(0, 12).map((s) => ({
    key: s.key,
    label: s.name,
    value: s.count,
    valueLabel: `${s.count}×`,
    sub: `an ${s.daysUsed} ${s.daysUsed === 1 ? 'Tag' : 'Tagen'}`,
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

  return (
    <>
      <PageHeader
        title="Statistik"
        eyebrow={`${rangeIntakes.length} Einnahmen · ${rank.length} Substanzen · ${range} Tage`}
      />

      <RangeTabs range={range} onChange={setRange} />

      {isLoading ? (
        <LoadingScreen />
      ) : rangeIntakes.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={26} />}
          title="Noch keine Auswertung"
          description="Sobald Einnahmen im gewählten Zeitraum erfasst sind, erscheinen hier die Konsum-Grafiken."
        />
      ) : (
        <div className="space-y-4 mt-5">
          {/* 1) KPI-Band */}
          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile label="Einnahmen" value={String(rangeIntakes.length)} sub={`Ø ${formatNum(rangeIntakes.length / range)} / Tag`} />
            <KpiTile label="Substanzen" value={String(rank.length)} sub="aktiv im Zeitraum" />
            <KpiTile
              label="Plan-Treue"
              value={adherence.overall != null ? `${Math.round(adherence.overall * 100)}%` : '–'}
              sub={adherence.hasPlan ? 'planmäßige Einnahmen' : 'kein Plan hinterlegt'}
            />
            <KpiTile label="Aktivste Zeit" value={busiest.label} sub={`${busiest.range} Uhr`} />
          </div>

          {/* 2) Konsum-Kalender */}
          <Module
            icon={<CalendarRange size={16} />}
            title="Konsum-Kalender"
            subtitle="Wann wurde was konsumiert — Deckkraft = Einnahmen/Tag (relativ zur eigenen Spitze)"
          >
            <Punchcard rows={punchRows} days={days} selected={punchSel} onSelect={setPunchSel} />
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
                    <span className="text-ink-faint"> · keine Einnahme</span>
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
                {punchExpanded ? 'weniger anzeigen' : `${punch.length - 10} weitere anzeigen`}
              </button>
            )}
          </Module>

          {/* 3) Menge über Zeit */}
          <Module
            icon={<BarChart3 size={16} />}
            title="Menge über Zeit"
            subtitle="Tages-Dosis der gewählten Substanz — Mengen werden nie über Substanzen hinweg summiert"
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
                        ? `gesamt · Ø ${formatNum(doseSeries.avgPerActiveDay)} ${unitLabel(doseSeries.unit)} / aktivem Tag`
                        : `Einnahmen · Ø ${formatNum(doseSeries.avgPerActiveDay)} / aktivem Tag`}
                    </p>
                  </div>
                  {doseSeries.mode === 'count' && (
                    <span className="shrink-0 text-[11px] text-ink-faint text-right max-w-[10rem] leading-snug">
                      Mengen nicht durchgängig erfassbar — zeige Anzahl
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
                      <span className="text-ink-faint"> ({doseSeries.days[doseSel].count} Einnahmen)</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </Module>

          {/* 4) Rangliste */}
          <Module icon={<BarChart3 size={16} />} title="Top-Substanzen" subtitle="Häufigkeit im Zeitraum">
            <HBars items={rankItems} />
          </Module>

          {/* 5) Tageszeit-Muster */}
          <Module icon={<Clock size={16} />} title="Tageszeit-Muster" subtitle="Wann am Tag wird konsumiert">
            <DaypartChart dist={daypart} />
          </Module>

          {/* 6) Plan-Treue über Zeit */}
          {adherence.hasPlan && (
            <Module
              icon={<Sparkles size={16} />}
              title="Plan-Treue"
              subtitle="Anteil planmäßiger Einnahmen je Tag (Substanz & Dosis stimmen mit dem wirksamen Plan überein)"
            >
              <div className="flex items-center gap-4">
                <div className="w-24 shrink-0">
                  <p className="font-display text-3xl leading-none text-ink tabular">
                    {adherence.overall != null ? `${Math.round(adherence.overall * 100)}%` : '–'}
                  </p>
                  <p className="text-[12px] text-ink-muted mt-1">im Schnitt</p>
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

          {/* 7) Substanz × Wohlbefinden */}
          <Module
            icon={<Info size={16} />}
            title="Substanz × Wohlbefinden"
            subtitle="Tages-Dosis gegen eine 11-Skalen-Dimension"
          >
            <SubstanceChips items={rank} activeKey={wellStat?.key} onPick={setWellKey} />
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mt-2 pb-1">
              {METRICS.map((m) => (
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
                {/* Legende */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ backgroundColor: wellStat.color, opacity: 0.4 }} />
                    {wellStat.name} (Dosis)
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
                        {correlationLabel(wellData.r)}
                      </p>
                      <p className="text-[11px] text-ink-faint mt-1 leading-snug">
                        über {wellData.pairs} Tage mit Tagesbild. <strong>Korrelation ≠ Kausalität</strong> —
                        ein statistischer Zusammenhang ist kein Beweis für Ursache und Wirkung.
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-ink-muted">
                      Zu wenige gemeinsame Tage (Dosis + Tagesbild) für eine belastbare Korrelation.
                    </p>
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

// ───────────────────────── Bausteine ─────────────────────────

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

/** Start · Mitte · Ende der Tages-Achse (für die vertikalen Balken-Charts). */
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
