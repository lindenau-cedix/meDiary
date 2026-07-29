import { useEffect, useMemo, useState } from 'react';
import { Trash2, Clock3, Check } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { Field, TextInput, TextArea } from '../components/ui/inputs';
import { EmptyState, LoadingScreen } from '../components/ui/feedback';
import { SubstanceSeal } from '../components/SubstanceSeal';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { useT } from '../lib/i18n';
import { haptics } from '../lib/haptics';
import { formatTime, formatDayLabel, dateNDaysAgo } from '../lib/format';
import { useIntakes, useSubstances, useIntakeMutations, usePlanVersionsWithItems } from '../lib/queries';
import { isPlanIntake, planDoseIndex, type PlanDoseEntry } from '../lib/plan';
import type { Intake, Substance } from '../lib/types';
import { History as HistoryIcon } from 'lucide-react';

/** Stable empty index for intakes without an effective plan version. */
const EMPTY_INDEX: Map<string, PlanDoseEntry> = new Map();

export function HistoryScreen() {
  const t = useT();
  const { data: substances = [] } = useSubstances(true);
  const { data: intakes = [], isLoading } = useIntakes({ from: dateNDaysAgo(120), limit: 1000 });
  const { data: planVersions = [] } = usePlanVersionsWithItems();
  // "On plan" is evaluated at the exact intake time: each intake is checked
  // against the plan version effective at its `takenAt`, not today's plan.
  // Otherwise an intake that was correct at the time would lose its badge after
  // a dose change. Keep one dose index per version and sort versions by recency
  // (mirroring planVersionAt: effective_from DESC, id DESC).
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
  const indexForIntake = (it: Intake): Map<string, PlanDoseEntry> => {
    const v = versionsByRecency.find((ver) => ver.effectiveFrom <= it.takenAt);
    return (v && indexByVersion.get(v.versionId)) ?? EMPTY_INDEX;
  };
  const [filter, setFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<Intake | null>(null);

  const colorFor = (id: number | null) => substances.find((s) => s.id === id)?.color;

  const filtered = filter ? intakes.filter((i) => i.substanceId === filter) : intakes;

  const groups = useMemo(() => {
    const map = new Map<string, Intake[]>();
    for (const it of filtered) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const usedSubstances = useMemo(() => {
    const ids = new Set(intakes.map((i) => i.substanceId));
    return substances.filter((s) => ids.has(s.id));
  }, [intakes, substances]);

  return (
    <>
      <PageHeader title={t('history.title')} eyebrow={t('history.count', { count: intakes.length })} />

      {usedSubstances.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 mb-4">
          <FilterChip active={filter === null} onClick={() => setFilter(null)} label={t('history.filterAll')} />
          {usedSubstances.map((s) => (
            <FilterChip
              key={s.id}
              active={filter === s.id}
              onClick={() => setFilter((f) => (f === s.id ? null : s.id))}
              label={s.name}
              color={s.color}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <LoadingScreen />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon size={26} />}
          title={t('history.empty.title')}
          description={t('history.empty.description')}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([date, items]) => (
            <section key={date}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="font-display text-lg text-ink">{formatDayLabel(date)}</h2>
                <span className="text-xs text-ink-faint tabular">{t('history.entries', { count: items.length })}</span>
              </div>
              <Card className="divide-y divide-hairline overflow-hidden">
                {items.map((it) => {
                  const inPlan = isPlanIntake(it, indexForIntake(it));
                  return (
                    <button
                      key={it.id}
                      onClick={() => {
                        haptics.light();
                        setEditing(it);
                      }}
                      className={cx(
                        'w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface2 transition-colors relative',
                        inPlan
                          ? 'bg-primary-soft/35 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary'
                          : '',
                      )}
                    >
                      <span className="tabular text-sm font-semibold text-ink-muted w-11 shrink-0 pt-0.5">
                        {formatTime(it.takenAt)}
                      </span>
                      <SubstanceSeal name={it.substanceName} color={colorFor(it.substanceId)} size="sm" className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink truncate flex items-center gap-1.5">
                          <span className="truncate">{it.substanceName}</span>
                          {inPlan && (
                            <span
                              title={t('history.planMatchTitle')}
                              className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
                            >
                              {t('history.planBadge')}
                            </span>
                          )}
                          {it.amount && <span className="font-normal text-ink-muted"> · {it.amount}</span>}
                        </p>
                        {it.notes && <p className="text-[13px] text-ink-muted leading-snug mt-0.5 line-clamp-2">{it.notes}</p>}
                      </div>
                    </button>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      <IntakeEditSheet
        intake={editing}
        substances={substances}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'press shrink-0 inline-flex items-center gap-1.5 rounded-full h-9 px-3.5 text-sm font-medium ring-1 transition-colors',
        active ? 'bg-primary text-primary-fg ring-transparent' : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

function IntakeEditSheet({
  intake,
  substances,
  onClose,
}: {
  intake: Intake | null;
  substances: Substance[];
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { update, remove } = useIntakeMutations();
  const [data, setData] = useState<Intake | null>(intake);
  const [takenAt, setTakenAt] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Populate fields when an entry opens, retaining data during the close animation.
  useEffect(() => {
    if (intake) {
      setData(intake);
      setTakenAt(intake.takenAt.slice(0, 16));
      setAmount(intake.amount ?? '');
      setNote(intake.notes ?? '');
    }
  }, [intake]);

  const current = intake ?? data;
  if (!current) return null;
  const color = substances.find((s) => s.id === current.substanceId)?.color;

  const onSave = async () => {
    await update.mutateAsync({ id: current.id, body: { takenAt, amount: amount.trim() || null, notes: note.trim() || null } });
    haptics.success();
    toast.show({ message: t('history.updated'), detail: current.substanceName });
    onClose();
  };
  const onDelete = async () => {
    await remove.mutateAsync(current.id);
    haptics.medium();
    toast.show({ message: t('history.deleted'), detail: current.substanceName });
    onClose();
  };
  const intakeView = current;

  return (
    <Sheet
      open={!!intake}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <SubstanceSeal name={intakeView.substanceName} color={color} size="sm" />
          {intakeView.substanceName}
        </span>
      }
      footer={
        <div className="flex items-center gap-3">
          <Button variant="danger" icon={<Trash2 size={17} />} onClick={onDelete} loading={remove.isPending}>
            {t('action.delete')}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button icon={<Check size={18} />} onClick={onSave} loading={update.isPending}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pt-1">
        <Field label={t('history.field.time')}>
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-ink-muted" />
            <input
              type="datetime-local"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              className="flex-1 bg-surface2 rounded-2xl ring-1 ring-line h-12 px-4 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
            />
          </div>
        </Field>
        <Field label={t('history.field.amount')}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('history.field.amountPlaceholder')} />
        </Field>
        <Field label={t('history.field.note')}>
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('history.field.notePlaceholder')} />
        </Field>
      </div>
    </Sheet>
  );
}
