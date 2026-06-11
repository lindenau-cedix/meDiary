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
  relativeDays,
  formatFull,
  formatDayShort,
  formatEffective,
  effectiveTimeOf,
  nowLocalInput,
  todayStr,
} from '../lib/format';
import { DAYPARTS, FIELD_LABELS, hasAnyDosing } from '../lib/plan';
import { usePlan, usePlanDiff, usePlanVersions, useSavePlan, useSubstances } from '../lib/queries';
import { api } from '../lib/api';
import type { Plan, PlanItem, Substance } from '../lib/types';

const COMPARE_PRESETS = [7, 14, 30, 90];

export function PlanScreen() {
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

  return (
    <>
      <PageHeader
        title="Plan"
        eyebrow={
          plan?.effectiveFrom
            ? `Gültig seit ${
                relativeDays(plan.effectiveFrom) === 'heute'
                  ? effectiveTimeOf(plan.effectiveFrom)
                    ? `heute, ${effectiveTimeOf(plan.effectiveFrom)} Uhr`
                    : 'heute'
                  : formatEffective(plan.effectiveFrom)
              }`
            : 'Medikationsplan'
        }
        action={
          <Button size="sm" variant="soft" icon={<Pencil size={16} />} onClick={() => setEditorOpen(true)}>
            Bearbeiten
          </Button>
        }
      />

      {/* Geplante (zukünftige) Änderungen */}
      {(plan?.upcoming?.length ?? 0) > 0 && (
        <Card className="mb-4 p-3.5 ring-1 ring-accent/30 bg-accent/5">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarClock size={16} className="text-accent" />
            <p className="text-sm font-semibold text-ink">Geplante Änderung</p>
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
                Ab <span className="font-medium text-ink">{formatEffective(u.effectiveFrom)}</span> (
                {relativeDays(u.effectiveFrom)}){u.note ? `: ${u.note}` : ` · ${u.itemCount} Einträge`}
              </button>
            ))}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={26} />}
          title="Noch kein Plan"
          description="Lege deinen Medikationsplan an. Jede Änderung wird als Version mit Datum festgehalten."
          action={
            <Button icon={<Plus size={18} />} onClick={() => setEditorOpen(true)}>
              Plan anlegen
            </Button>
          }
        />
      ) : (
        <>
          {plan?.note && (
            <p className="text-sm text-ink-muted -mt-1 mb-4 pl-1">
              Letzte Änderung: <span className="text-ink">{plan.note}</span>
            </p>
          )}

          <div className="space-y-2.5">
            {items.map((item, i) => (
              <PlanItemCard key={i} item={item} color={colorFor(item.substanceName)} />
            ))}
          </div>

          {/* Was war anders? */}
          <div className="mt-8">
            <SectionLabel className="px-1 mb-2.5">Was war anders?</SectionLabel>
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
                  {d} Tage
                </button>
              ))}
            </div>
            {compareDays && <DiffPanel days={compareDays} colorFor={colorFor} />}
          </div>

          {/* Versions-Verlauf */}
          {versions.length > 0 && (
            <div className="mt-8">
              <SectionLabel className="px-1 mb-2.5">Verlauf der Versionen</SectionLabel>
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
                        {v.note || (v.active ? 'Aktuelle Version' : 'Plananpassung')}
                      </p>
                      <p className="text-xs text-ink-muted tabular">
                        gültig ab {formatEffective(v.effectiveFrom)} · {v.itemCount} Einträge ·{' '}
                        {relativeDays(v.effectiveFrom)}
                      </p>
                    </div>
                    {v.active && <Badge tone="primary">aktuell</Badge>}
                    {v.upcoming && <Badge tone="accent">geplant</Badge>}
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

function PlanItemCard({ item, color }: { item: PlanItem; color?: string }) {
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
          {DAYPARTS.map((d) => {
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
  const { data: diff, isLoading } = usePlanDiff({ days });
  if (isLoading || !diff) return <div className="text-sm text-ink-faint px-1 py-3">Vergleiche …</div>;

  if (!diff.hasChanges) {
    return (
      <Card className="p-4 text-sm text-ink-muted flex items-center gap-2.5">
        <Check size={18} className="text-good" />
        Unverändert gegenüber {diff.from.date ? formatDayShort(diff.from.date) : `vor ${days} Tagen`}.
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3.5">
      <p className="text-xs text-ink-muted">
        Vergleich mit {diff.from.date ? formatFull(diff.from.date) : `vor ${days} Tagen`}
      </p>

      {diff.changed.map((c) => (
        <div key={c.substanceName} className="flex gap-3">
          <SubstanceSeal name={c.substanceName} color={colorFor(c.substanceName)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink text-sm">{c.substanceName}</p>
            <div className="mt-1 space-y-0.5">
              {c.fields.map((f) => (
                <p key={f} className="text-[13px] text-ink-muted flex items-center gap-1.5 flex-wrap">
                  <span className="text-ink-faint">{FIELD_LABELS[f] ?? f}:</span>
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
          <Badge tone="good">neu hinzugefügt</Badge>
        </div>
      ))}

      {diff.removed.map((it) => (
        <div key={`r-${it.substanceName}`} className="flex items-center gap-3 opacity-80">
          <SubstanceSeal name={it.substanceName} color={colorFor(it.substanceName)} size="sm" />
          <p className="flex-1 text-sm text-ink-muted font-medium line-through">{it.substanceName}</p>
          <Badge tone="bad">abgesetzt</Badge>
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
  const { data } = usePlanVersion(versionId);

  return (
    <Sheet
      open={versionId != null}
      onClose={onClose}
      title={data?.note || 'Planversion'}
      subtitle={
        data?.effectiveFrom
          ? `Gültig ab ${formatFull(data.effectiveFrom)}${
              effectiveTimeOf(data.effectiveFrom) ? `, ${effectiveTimeOf(data.effectiveFrom)} Uhr` : ''
            }`
          : undefined
      }
    >
      {!data ? (
        <div className="py-8 text-sm text-ink-faint text-center">Lädt …</div>
      ) : (
        <div className="space-y-2.5 pt-1">
          {data.items.map((item, i) => (
            <PlanItemCard key={i} item={item} color={colorFor(item.substanceName)} />
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
  const toast = useToast();
  const save = useSavePlan();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [note, setNote] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [effectiveAt, setEffectiveAt] = useState(''); // optionale Uhrzeit "HH:mm"

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
  // Ohne Uhrzeit zählt der ganze Tag als "heute"; mit Uhrzeit entscheidet die Minute.
  const isPast = effectiveAt ? effective < nowLocalInput() : effectiveFrom < today;
  const isFuture = effectiveAt ? effective > nowLocalInput() : effectiveFrom > today;
  const effectiveHint = isPast
    ? `Rückwirkend — gilt bereits seit ${formatEffective(effective)} (${relativeDays(effective)}).`
    : isFuture
      ? `Geplant — wird erst ${relativeDays(effective)}${effectiveAt ? ` um ${effectiveAt} Uhr` : ''} wirksam; bis dahin bleibt der bisherige Plan aktuell.`
      : effectiveAt
        ? `Gilt ab heute, ${effectiveAt} Uhr.`
        : 'Gilt ab heute.';

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
    toast.show({
      message: 'Plan gespeichert',
      detail: `${items.length} Einträge · gültig ab ${effective === today ? 'heute' : formatEffective(effective)}`,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title="Plan bearbeiten"
      subtitle="Neue Version — rückwirkend, ab heute oder mit Datum in der Zukunft"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="soft" icon={<Plus size={17} />} onClick={addRow}>
            Zeile
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button icon={<Check size={18} />} loading={save.isPending} onClick={onSave}>
            Speichern
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
                placeholder="Substanz"
                className="flex-1 bg-surface rounded-xl ring-1 ring-line h-11 px-3.5 font-medium focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <input
                value={r.strength}
                onChange={(e) => update(i, { strength: e.target.value })}
                placeholder="Stärke"
                className="w-24 bg-surface rounded-xl ring-1 ring-line h-11 px-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <IconButton label="Zeile entfernen" onClick={() => removeRow(i)} className="text-ink-faint hover:text-bad">
                <Trash2 size={17} />
              </IconButton>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {DAYPARTS.map((d) => (
                <div key={d.key}>
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint text-center mb-1">{d.short}</p>
                  <input
                    value={r[d.key as 'morning' | 'noon' | 'evening' | 'night']}
                    onChange={(e) => update(i, { [d.key]: e.target.value })}
                    placeholder="0"
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
                placeholder="Grund (optional)"
                className="bg-surface rounded-xl ring-1 ring-line h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
              <input
                value={r.notes}
                onChange={(e) => update(i, { notes: e.target.value })}
                placeholder="Hinweis (optional)"
                className="bg-surface rounded-xl ring-1 ring-line h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/55"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Gültig ab">
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
              aria-label="Uhrzeit (optional)"
              className="w-28 bg-surface rounded-xl ring-1 ring-line h-11 px-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-primary/55"
            />
          </div>
          <p
            className={cx(
              'mt-1.5 text-xs',
              isPast || isFuture ? 'text-accent font-medium' : 'text-ink-faint',
            )}
          >
            {effectiveHint} {effectiveAt ? '' : 'Uhrzeit optional — ohne Angabe gilt der Plan ab Tagesbeginn.'}
          </p>
        </Field>

        <Field label="Änderungsnotiz">
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Quetiapin von 100 auf 150 mg erhöht"
            rows={2}
          />
        </Field>
      </div>
    </Sheet>
  );
}
