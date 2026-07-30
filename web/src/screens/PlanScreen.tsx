import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Check, ClipboardList, ArrowRight, FileClock, CalendarClock } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Sheet } from '../components/ui/Sheet';
import { Field, TextArea } from '../components/ui/inputs';
import { Badge, EmptyState, LoadingScreen, SectionLabel } from '../components/ui/feedback';
import { SubstanceSeal } from '../components/SubstanceSeal';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import {
  isConsumptionToday,
  formatFull,
  formatDayShort,
  formatEffective,
  effectiveTimeOf,
  nowLocalInput,
  todayStr,
  relativeDays,
} from '../lib/format';
import { daypartList, planFieldLabel, hasAnyDosing } from '../lib/plan';
import { useT } from '../lib/i18n';
import { usePlan, usePlanDiff, usePlanVersions, useSavePlan, useSubstances } from '../lib/queries';
import { api } from '../lib/api';
import type { Plan, PlanItem, Substance } from '../lib/types';

const COMPARE_PRESETS = [7, 14, 30, 90];

export function PlanScreen() {
  const t = useT();
  const { data: plan, isLoading } = usePlan();
  const { data: versions = [] } = usePlanVersions();
  const { data: substances = [] } = useSubstances(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [compareDays, setCompareDays] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<number | null>(null);

  const colorFor = (name: string): string | undefined =>
    substances.find((s) => s.name.toLowerCase() === name.toLowerCase())?.color ?? undefined;

  if (isLoading) return <LoadingScreen />;

  const items = plan?.items ?? [];
  const dayparts = daypartList();

  // Eyebrow describes when the current plan took effect. Use the dedicated
  // helpers from format.ts (isConsumptionToday / formatEffective / relativeDays)
  // — never compare a *formatted* label to a literal, that breaks under
  // translations.
  const effectiveEyebrow = plan?.effectiveFrom
    ? isConsumptionToday(plan.effectiveFrom)
      ? effectiveTimeOf(plan.effectiveFrom)
        ? t('plan.eyebrow.effectiveTodayAt', { time: effectiveTimeOf(plan.effectiveFrom)! })
        : t('plan.eyebrow.effectiveToday')
      : t('plan.eyebrow.effectiveSince', { date: formatEffective(plan.effectiveFrom) })
    : t('plan.eyebrow.noPlan');

  return (
    <>
      <PageHeader
        title={t('nav.plan')}
        eyebrow={effectiveEyebrow}
        action={
          <Button size="sm" variant="soft" icon={<Pencil size={16} />} onClick={() => setEditorOpen(true)}>
            {t('action.edit')}
          </Button>
        }
      />

      {/* Scheduled (future) plan changes — previews of upcoming versions. */}
      {(plan?.upcoming?.length ?? 0) > 0 && (
        <Card className="mb-4 p-3.5 ring-1 ring-accent/30 bg-accent/5">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarClock size={16} className="text-accent" />
            <p className="text-sm font-semibold text-ink">{t('plan.upcoming.title')}</p>
          </div>
          <div className="space-y-1">
            {plan!.upcoming!.map((u) => (
              <button
                key={u.versionId}
                onClick={() => {
                  haptics.light();
                  setSnapshot(u.versionId);
                }}
                className="w-full text-left text-[13px] text-ink-muted hover:text-ink transition-colors"
              >
                {u.note
                  ? t('plan.upcoming.withNote', {
                      date: formatEffective(u.effectiveFrom),
                      relative: relativeDays(u.effectiveFrom),
                      note: u.note,
                    })
                  : t('plan.upcoming.row', {
                      date: formatEffective(u.effectiveFrom),
                      relative: relativeDays(u.effectiveFrom),
                    })}{' '}
                · {u.itemCount === 1
                  ? t('plan.upcoming.itemCount.one', { count: u.itemCount })
                  : t('plan.upcoming.itemCount.many', { count: u.itemCount })}
              </button>
            ))}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={26} />}
          title={t('plan.empty.title')}
          description={t('plan.empty.description')}
          action={
            <Button icon={<Plus size={18} />} onClick={() => setEditorOpen(true)}>
              {t('plan.empty.action')}
            </Button>
          }
        />
      ) : (
        <>
          {plan?.note && (
            <p className="text-sm text-ink-muted -mt-1 mb-4 pl-1">
              {t('plan.lastChange', { note: plan.note })}
            </p>
          )}

          <div className="space-y-2.5">
            {items.map((item, i) => (
              <PlanItemCard key={i} item={item} color={colorFor(item.substanceName)} dayparts={dayparts} />
            ))}
          </div>

          {/* Compare view: what changed over the last N days. */}
          <div className="mt-8">
            <SectionLabel className="px-1 mb-2.5">{t('plan.compare.heading')}</SectionLabel>
            <div className="flex gap-2 mb-3">
              {COMPARE_PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    haptics.select();
                    setCompareDays((c) => (c === d ? null : d));
                  }}
                  className={cx(
                    'press flex-1 rounded-2xl h-12 text-sm font-semibold ring-1 transition-colors',
                    compareDays === d
                      ? 'bg-accent text-accent-fg ring-transparent'
                      : 'bg-surface text-ink-muted ring-line hover:bg-surface2',
                  )}
                >
                  {d === 1 ? t('plan.compare.range.one', { count: d }) : t('plan.compare.range.many', { count: d })}
                </button>
              ))}
            </div>
            {compareDays && <DiffPanel days={compareDays} colorFor={colorFor} />}
          </div>

          {/* Version history. */}
          {versions.length > 0 && (
            <div className="mt-8">
              <SectionLabel className="px-1 mb-2.5">{t('plan.versions.heading')}</SectionLabel>
              <Card className="overflow-hidden divide-y divide-hairline">
                {versions.map((v) => (
                  <button
                    key={v.versionId}
                    onClick={() => {
                      haptics.light();
                      setSnapshot(v.versionId);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface2 transition-colors"
                  >
                    <span className="grid place-items-center size-9 rounded-xl bg-surface2 text-ink-muted shrink-0">
                      {v.upcoming ? <CalendarClock size={17} /> : <FileClock size={17} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink truncate">
                        {v.note || (v.active ? t('plan.versions.noteFallbackActive') : t('plan.versions.noteFallbackOther'))}
                      </p>
                      <p className="text-xs text-ink-muted tabular">
                        {t('plan.versions.summary', {
                          date: formatEffective(v.effectiveFrom),
                          count: v.itemCount === 1
                            ? t('plan.versions.summaryCount.one', { count: v.itemCount })
                            : t('plan.versions.summaryCount.many', { count: v.itemCount }),
                          relative: relativeDays(v.effectiveFrom),
                        })}
                      </p>
                    </div>
                    {v.active && <Badge tone="primary">{t('plan.versions.badge.active')}</Badge>}
                    {v.upcoming && <Badge tone="accent">{t('plan.versions.badge.upcoming')}</Badge>}
                  </button>
                ))}
              </Card>
            </div>
          )}
        </>
      )}

      <PlanEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        plan={plan ?? null}
        substances={substances}
      />
      <SnapshotSheet versionId={snapshot} onClose={() => setSnapshot(null)} colorFor={colorFor} />
    </>
  );
}

function PlanItemCard({
  item,
  color,
  dayparts,
}: {
  item: PlanItem;
  color?: string;
  dayparts: { key: 'morning' | 'noon' | 'evening' | 'night'; label: string; short: string }[];
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <SubstanceSeal name={item.substanceName} color={color} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink truncate">
            {item.substanceName}
            {item.strength && <span className="text-ink-muted font-normal"> · {item.strength}</span>}
          </p>
          {item.reason && <p className="text-xs text-ink-muted truncate">{item.reason}</p>}
        </div>
      </div>
      {hasAnyDosing(item) && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {dayparts.map((d) => {
            const val = item[d.key];
            return (
              <div
                key={d.key}
                className={cx(
                  'rounded-xl py-1.5 text-center',
                  val ? 'bg-primary-soft' : 'bg-surface2',
                )}
              >
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{d.short}</p>
                <p className={cx('text-sm font-semibold tabular', val ? 'text-primary' : 'text-ink-faint')}>
                  {val || '–'}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {item.notes && (
        <p className="mt-2.5 text-[13px] text-ink-muted leading-snug border-l-2 border-line pl-2.5">{item.notes}</p>
      )}
    </Card>
  );
}

function DiffPanel({ days, colorFor }: { days: number; colorFor: (n: string) => string | undefined }) {
  const t = useT();
  const { data: diff, isLoading } = usePlanDiff({ days });
  if (isLoading || !diff) {
    return <div className="text-sm text-ink-faint px-1 py-3">{t('plan.compare.loading')}</div>;
  }

  // When the server gives us a concrete "from" date, show it; otherwise the
  // compare window has no anchor (very first version), so we fall back to a
  // // roughly-ago label.
  const fallbackDate = t('plan.compare.headerFallback', { days });

  if (!diff.hasChanges) {
    return (
      <Card className="p-4 text-sm text-ink-muted flex items-center gap-2.5">
        <Check size={18} className="text-good" />
        {diff.from.date
          ? t('plan.compare.unchanged', { date: formatDayShort(diff.from.date) })
          : t('plan.compare.unchangedFallback', { days })}
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3.5">
      <p className="text-xs text-ink-muted">
        {diff.from.date
          ? t('plan.compare.header', { date: formatFull(diff.from.date) })
          : fallbackDate}
      </p>

      {diff.changed.map((c) => (
        <div key={c.substanceName} className="flex gap-3">
          <SubstanceSeal name={c.substanceName} color={colorFor(c.substanceName)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink text-sm">{c.substanceName}</p>
            <div className="mt-1 space-y-0.5">
              {c.fields.map((f) => (
                <p key={f} className="text-[13px] text-ink-muted flex items-center gap-1.5 flex-wrap">
                  <span className="text-ink-faint">{planFieldLabel(f)}:</span>
                  <span className="line-through decoration-bad/60">{(c.before as any)[f] || '–'}</span>
                  <ArrowRight size={12} className="text-ink-faint" />
                  <span className="text-ink font-medium">{(c.after as any)[f] || '–'}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}

      {diff.added.map((it) => (
        <div key={`a-${it.substanceName}`} className="flex items-center gap-3">
          <SubstanceSeal name={it.substanceName} color={colorFor(it.substanceName)} size="sm" />
          <p className="flex-1 text-sm text-ink font-medium">{it.substanceName}</p>
          <Badge tone="good">{t('plan.diff.added')}</Badge>
        </div>
      ))}

      {diff.removed.map((it) => (
        <div key={`r-${it.substanceName}`} className="flex items-center gap-3 opacity-80">
          <SubstanceSeal name={it.substanceName} color={colorFor(it.substanceName)} size="sm" />
          <p className="flex-1 text-sm text-ink-muted font-medium line-through">{it.substanceName}</p>
          <Badge tone="bad">{t('plan.diff.removed')}</Badge>
        </div>
      ))}
    </Card>
  );
}

// ---------- Snapshot (read-only) ----------
function usePlanVersion(versionId: number | null) {
  return useQuery({
    queryKey: ['plan', 'version', versionId],
    queryFn: () => api.plan.version(versionId!),
    enabled: versionId != null,
  });
}

function SnapshotSheet({
  versionId,
  onClose,
  colorFor,
}: {
  versionId: number | null;
  onClose: () => void;
  colorFor: (n: string) => string | undefined;
}) {
  const t = useT();
  const { data } = usePlanVersion(versionId);
  const dayparts = daypartList();

  return (
    <Sheet
      open={versionId != null}
      onClose={onClose}
      title={data?.note || t('plan.snapshot.titleFallback')}
      subtitle={
        data?.effectiveFrom
          ? effectiveTimeOf(data.effectiveFrom)
            ? t('plan.snapshot.subtitle', {
                date: formatFull(data.effectiveFrom),
                time: effectiveTimeOf(data.effectiveFrom)!,
              })
            : t('plan.snapshot.subtitleDateOnly', { date: formatFull(data.effectiveFrom) })
          : undefined
      }
    >
      {!data ? (
        <div className="py-8 text-sm text-ink-faint text-center">{t('plan.snapshot.loading')}</div>
      ) : (
        <div className="space-y-2.5 pt-1">
          {data.items.map((item, i) => (
            <PlanItemCard key={i} item={item} color={colorFor(item.substanceName)} dayparts={dayparts} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------- Editor ----------
interface EditRow {
  substanceId: number | null;
  substanceName: string;
  strength: string;
  morning: string;
  noon: string;
  evening: string;
  night: string;
  unit: string;
  reason: string;
  notes: string;
}

function toRow(item: PlanItem): EditRow {
  return {
    substanceId: item.substanceId ?? null,
    substanceName: item.substanceName,
    strength: item.strength ?? '',
    morning: item.morning ?? '',
    noon: item.noon ?? '',
    evening: item.evening ?? '',
    night: item.night ?? '',
    unit: item.unit ?? '',
    reason: item.reason ?? '',
    notes: item.notes ?? '',
  };
}

const blankRow: EditRow = {
  substanceId: null,
  substanceName: '',
  strength: '',
  morning: '',
  noon: '',
  evening: '',
  night: '',
  unit: '',
  reason: '',
  notes: '',
};

function PlanEditorSheet({
  open,
  onClose,
  plan,
  substances,
}: {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  substances: Substance[];
}) {
  const t = useT();
  const dayparts = daypartList();
  const toast = useToast();
  const save = useSavePlan();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [note, setNote] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [effectiveAt, setEffectiveAt] = useState(''); // optional time "HH:mm"

  useEffect(() => {
    if (open) {
      setRows(plan?.items.length ? plan.items.map(toRow) : [blankRow]);
      setNote('');
      setEffectiveFrom(todayStr());
      setEffectiveAt('');
    }
  }, [open, plan]);

  const today = todayStr();
  const effective = effectiveAt ? `${effectiveFrom}T${effectiveAt}` : effectiveFrom;
  // Without a time, the whole day counts as "today"; with a time the minute decides.
  const isPast = effectiveAt ? effective < nowLocalInput() : effectiveFrom < today;
  const isFuture = effectiveAt ? effective > nowLocalInput() : effectiveFrom > today;
  const effectiveHint = isPast
    ? t('plan.editor.hint.past', { date: formatEffective(effective), relative: relativeDays(effective) })
    : isFuture
      ? t('plan.editor.hint.future', {
          relative: relativeDays(effective),
          atTime: effectiveAt ? t('plan.editor.hint.futureAtTime', { time: effectiveAt }) : '',
        })
      : effectiveAt
        ? t('plan.editor.hint.todayAtTime', { time: effectiveAt })
        : t('plan.editor.hint.today');

  const update = (i: number, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () => {
    haptics.light();
    setRows((rs) => [...rs, blankRow]);
  };

  const onSave = async () => {
    const items: PlanItem[] = rows
      .filter((r) => r.substanceName.trim())
      .map((r) => {
        const match = substances.find((s) => s.name.toLowerCase() === r.substanceName.trim().toLowerCase());
        const n = (v: string) => (v.trim() ? v.trim() : null);
        return {
          substanceId: match?.id ?? r.substanceId ?? null,
          substanceName: r.substanceName.trim(),
          strength: n(r.strength),
          morning: n(r.morning),
          noon: n(r.noon),
          evening: n(r.evening),
          night: n(r.night),
          unit: n(r.unit),
          reason: n(r.reason),
          notes: n(r.notes),
        };
      });
    await save.mutateAsync({ items, note: note.trim() || null, effectiveFrom: effective });
    haptics.success();
    const effectiveLabel = isConsumptionToday(effective)
      ? t('plan.save.toastEffectiveToday')
      : formatEffective(effective);
    toast.show({
      message: t('plan.save.toast'),
      detail: t('plan.save.toastDetail', {
        count: items.length === 1
          ? t('plan.save.toastCount.one', { count: items.length })
          : t('plan.save.toastCount.many', { count: items.length }),
        effective: effectiveLabel,
      }),
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={t('plan.editor.title')}
      subtitle={t('plan.editor.subtitle')}
      footer={
        <div className="flex items-center gap-3">
          <Button variant="soft" icon={<Plus size={17} />} onClick={addRow}>
            {t('plan.editor.addRow')}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button icon={<Check size={18} />} loading={save.isPending} onClick={onSave}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <datalist id="substance-names">
        {substances.filter((s) => !s.archived).map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>

      <div className="space-y-3 pt-1">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl bg-surface2/60 ring-1 ring-line p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                list="substance-names"
                value={r.substanceName}
                onChange={(e) => update(i, { substanceName: e.target.value })}
                placeholder={t('plan.editor.placeholder.substance')}
                className="flex-1 bg-surface rounded-xl ring-1 ring-line h-11 px-3.5 font-medium focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <input
                value={r.strength}
                onChange={(e) => update(i, { strength: e.target.value })}
                placeholder={t('plan.editor.placeholder.strength')}
                className="w-24 bg-surface rounded-xl ring-1 ring-line h-11 px-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <IconButton
                label={t('plan.editor.row.remove')}
                onClick={() => removeRow(i)}
                className="text-ink-faint hover:text-bad"
              >
                <Trash2 size={17} />
              </IconButton>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {dayparts.map((d) => (
                <div key={d.key}>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint text-center mb-1">{d.short}</p>
                  <input
                    value={r[d.key as 'morning' | 'noon' | 'evening' | 'night']}
                    onChange={(e) => update(i, { [d.key]: e.target.value })}
                    placeholder={t('plan.editor.placeholder.slot')}
                    inputMode="decimal"
                    className="w-full bg-surface rounded-xl ring-1 ring-line h-10 text-center text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={r.reason}
                onChange={(e) => update(i, { reason: e.target.value })}
                placeholder={t('plan.editor.placeholder.reason')}
                className="bg-surface rounded-xl ring-1 ring-line h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <input
                value={r.notes}
                onChange={(e) => update(i, { notes: e.target.value })}
                placeholder={t('plan.editor.placeholder.notes')}
                className="bg-surface rounded-xl ring-1 ring-line h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Field label={t('plan.editor.field.effectiveFrom')}>
          <div className="flex gap-2">
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => e.target.value && setEffectiveFrom(e.target.value)}
              className="flex-1 bg-surface rounded-xl ring-1 ring-line h-11 px-3.5 text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
            />
            <input
              type="time"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              aria-label={t('plan.editor.field.effectiveAt')}
              className="w-28 bg-surface rounded-xl ring-1 ring-line h-11 px-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
            />
          </div>
          <p
            className={cx(
              'mt-1.5 text-xs',
              isPast || isFuture ? 'text-accent font-medium' : 'text-ink-faint',
            )}
          >
            {effectiveHint} {effectiveAt ? '' : t('plan.editor.hint.timeOptional')}
          </p>
        </Field>

        <Field label={t('plan.editor.field.changeNote')}>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('plan.editor.placeholder.changeNote')}
            rows={2}
          />
        </Field>
      </div>
    </Sheet>
  );
}