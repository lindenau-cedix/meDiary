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
import { haptics } from '../lib/haptics';
import { formatTime, formatDayLabel, dateNDaysAgo } from '../lib/format';
import { useIntakes, useSubstances, useIntakeMutations, usePlan } from '../lib/queries';
import { isPlanIntake, planSubstanceKeys } from '../lib/plan';
import type { Intake, Substance } from '../lib/types';
import { History as HistoryIcon } from 'lucide-react';

export function HistoryScreen() {
  const { data: substances = [] } = useSubstances(true);
  const { data: intakes = [], isLoading } = useIntakes({ from: dateNDaysAgo(120), limit: 1000 });
  const { data: plan } = usePlan();
  const planKeys = useMemo(() => planSubstanceKeys(plan), [plan]);
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
      <PageHeader title="Verlauf" eyebrow={`${intakes.length} Einnahmen erfasst`} />

      {usedSubstances.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 mb-4">
          <FilterChip active={filter === null} onClick={() => setFilter(null)} label="Alle" />
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
          title="Noch nichts erfasst"
          description="Erfasste Einnahmen erscheinen hier — chronologisch nach Tagen gruppiert."
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([date, items]) => (
            <section key={date}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="font-display text-lg text-ink">{formatDayLabel(date)}</h2>
                <span className="text-xs text-ink-faint tabular">{items.length} Einträge</span>
              </div>
              <Card className="divide-y divide-hairline overflow-hidden">
                {items.map((it) => {
                  const inPlan = isPlanIntake(it.substanceName, planKeys);
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
                              title="Teil des aktuellen Medikationsplans"
                              className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
                            >
                              Plan
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
  const toast = useToast();
  const { update, remove } = useIntakeMutations();
  const [data, setData] = useState<Intake | null>(intake);
  const [takenAt, setTakenAt] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Felder befüllen, sobald ein Eintrag geöffnet wird (Daten während der
  // Schließen-Animation behalten).
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
    toast.show({ message: 'Aktualisiert', detail: current.substanceName });
    onClose();
  };
  const onDelete = async () => {
    await remove.mutateAsync(current.id);
    haptics.medium();
    toast.show({ message: 'Gelöscht', detail: current.substanceName });
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
            Löschen
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button icon={<Check size={18} />} onClick={onSave} loading={update.isPending}>
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pt-1">
        <Field label="Zeitpunkt">
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
        <Field label="Menge">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z. B. 150 mg" />
        </Field>
        <Field label="Notiz">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Notiz …" />
        </Field>
      </div>
    </Sheet>
  );
}
