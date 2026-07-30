import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { Settings2, SquareTerminal, Plus, Check, Clock3, Moon, Sunrise, Sun, Sunset, ChevronRight, WifiOff, AlertCircle, GripVertical, ArrowUpDown, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { TextInput } from '../components/ui/inputs';
import { SubstanceSeal } from '../components/SubstanceSeal';
import { SubstanceManager } from '../components/SubstanceManager';
import { AssessmentSheet } from '../components/AssessmentSheet';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { greeting, nowLocalInput, consumptionToday, consumptionTodayOffset, formatFull, formatTime } from '../lib/format';
import { activeIntlLocale, useT } from '../lib/i18n';
import { useSubstances, useIntakes, useIntakeMutations, useSubstanceMutations, useDefaults, useCompliance, usePlan } from '../lib/queries';
import { ApiError } from '../lib/api';
import { isPlanIntake, planDoseIndex, nameKey } from '../lib/plan';
import type { Substance, PlanSlot, SubstanceDefault, IntakeBatchEntryInput } from '../lib/types';

// localStorage key for the last chosen tile-sort mode in the "Heute" tab.
const SORT_KEY_STORAGE = 'mediary.heute.sortKey';

export function QuickEntryScreen() {
  const t = useT();
  const toast = useToast();
  const { data: substances = [], error } = useSubstances();
  const { data: defaults } = useDefaults();
  const { data: compliance } = useCompliance();
  // Consumption day (03:30 boundary), not the wall-clock day — an intake
  // recorded at 02:30 in the morning belongs to the previous day for
  // consumption purposes, and should appear under "Logged today".
  const today = consumptionToday();
  // We load roughly the last 3 wall-clock days and filter locally by
  // `intake.date === today` (consumption day, computed server-side via
  // DAY_BOUNDARY).
  const todayIntakesRaw = useIntakes(
    { from: consumptionTodayOffset(-1), limit: 200 },
  );
  const todayIntakes = useMemo(
    () => (todayIntakesRaw.data ?? []).filter((it) => it.date === today),
    [todayIntakesRaw.data, today],
  );
  // Wider window (90 days) for "sort by frequency": comfortably enough for
  // the everyday sort in the Today tab. The `limit` safely covers multiple
  // intakes per day.
  const recentIntakesRaw = useIntakes({ limit: 1500 });
  const { data: plan } = usePlan();
  const planIndex = useMemo(() => planDoseIndex(plan), [plan]);
  const { create, remove, batch, planBatch } = useIntakeMutations();

  // Collective entries "Morning meds"/"Night meds": one tap logs every
  // substance scheduled for the given slot in the currently active plan.
  const morningCount = useMemo(() => (plan?.items ?? []).filter((i) => i.morning?.trim()).length, [plan]);
  const noonCount = useMemo(() => (plan?.items ?? []).filter((i) => i.noon?.trim()).length, [plan]);
  const eveningCount = useMemo(() => (plan?.items ?? []).filter((i) => i.evening?.trim()).length, [plan]);
  const nightCount = useMemo(() => (plan?.items ?? []).filter((i) => i.night?.trim()).length, [plan]);

  // Substance names that have no entry in DEFAULTS.md.
  const missingDefaults = useMemo(() => {
    const set = new Set<string>();
    if (compliance?.missing) {
      for (const m of compliance.missing) set.add(m.name.toLowerCase());
    }
    return set;
  }, [compliance]);
  const hasAnyMissing = missingDefaults.size > 0;

  // Multi-select: several substances at the same point in time, each with
  // its own amount/note. `selectedIds` keeps the order of selection,
  // `fields` carries the per-substance input values.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [fields, setFields] = useState<Record<number, { amount: string; note: string }>>({});
  const [takenAt, setTakenAt] = useState(nowLocalInput());
  const [manageOpen, setManageOpen] = useState(false);
  const [assessment, setAssessment] = useState<{ open: boolean; date: string }>({ open: false, date: today });

  // Sort order: manual (drag & drop) vs. by frequency. `sortMode` is the
  // drag-editor mode (true = currently dragging); `sortKey` decides whether
  // the tile order comes from the server `sort_order` or from the
  // 90-day-intake frequency.
  type SortKey = 'manual' | 'frequency';
  const { reorder } = useSubstanceMutations();
  // The chosen sort mode (Custom/Manual vs. Frequency) is remembered per
  // device in localStorage so it survives a reload or app restart — the
  // same pattern as theme (`mediary.theme`) and API base.
  const [sortKey, setSortKeyState] = useState<SortKey>(
    () =>
      (typeof localStorage !== 'undefined' &&
      localStorage.getItem(SORT_KEY_STORAGE) === 'frequency'
        ? 'frequency'
        : 'manual'),
  );
  const setSortKey = (key: SortKey) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SORT_KEY_STORAGE, key);
    } catch {
      /* localStorage can be missing in restrictive WebViews — the choice then only persists for the session */
    }
    setSortKeyState(key);
  };
  const [sortMode, setSortMode] = useState(false);
  const [ordered, setOrdered] = useState<Substance[]>([]);
  const saveTimer = useRef<number | null>(null);
  const pendingIds = useRef<number[] | null>(null);

  // Frequency of substances over the last ~90 days. id → number of intakes
  // (companion substances from DEFAULTS.md count, because they are real
  // intakes). Substances with no hits land at the end with a 0 count.
  const frequencyById = useMemo(() => {
    const counts = new Map<number, number>();
    for (const it of recentIntakesRaw.data ?? []) {
      if (it.substanceId == null) continue;
      counts.set(it.substanceId, (counts.get(it.substanceId) ?? 0) + 1);
    }
    return counts;
  }, [recentIntakesRaw.data]);

  /** Substances to display, depending on the active sort mode. */
  const displaySubstances = useMemo(() => {
    if (sortKey === 'frequency') {
      return [...substances].sort((a, b) => {
        const diff = (frequencyById.get(b.id) ?? 0) - (frequencyById.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        // Tiebreaker: the previous manual order (sort_order asc), then name.
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, activeIntlLocale());
      });
    }
    return substances;
  }, [sortKey, substances, frequencyById]);

  const flushOrder = () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingIds.current) {
      reorder.mutate(pendingIds.current);
      pendingIds.current = null;
    }
  };

  const scheduleSaveOrder = (list: Substance[]) => {
    pendingIds.current = list.map((s) => s.id);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushOrder, 500);
  };

  const enterSortMode = () => {
    haptics.light();
    resetSelection();
    setOrdered(substances);
    setSortMode(true);
  };
  const exitSortMode = () => {
    haptics.light();
    flushOrder();
    setSortMode(false);
  };

  const onReorder = (next: Substance[]) => {
    setOrdered(next);
    scheduleSaveOrder(next);
  };

  // When leaving the screen, flush any pending save.
  useEffect(() => () => flushOrder(), []);

  // DEFAULTS (note/amount/companions) for a substance — case-insensitive.
  const defaultFor = (name: string): SubstanceDefault | null => {
    if (!defaults) return null;
    const entry = Object.entries(defaults.defaults).find(([k]) => k.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  };

  const selectedSubs = useMemo(
    () => selectedIds.map((id) => substances.find((s) => s.id === id)).filter((s): s is Substance => !!s),
    [selectedIds, substances],
  );

  const resetSelection = () => {
    setSelectedIds([]);
    setFields({});
    // `takenAt` is intentionally left in place so multiple blocks can be
    // logged back-to-back at the same timestamp (only "Now" or a fresh
    // visit to the tab resets it).
  };

  const toggleSelect = (id: number) => {
    haptics.select();
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setFields((f) => (f[id] ? f : { ...f, [id]: { amount: '', note: '' } }));
  };

  const removeSelected = (id: number) => {
    setSelectedIds((ids) => ids.filter((x) => x !== id));
    setFields((f) => {
      const { [id]: _drop, ...rest } = f;
      return rest;
    });
  };

  const setField = (id: number, patch: Partial<{ amount: string; note: string }>) => {
    setFields((f) => {
      const cur = f[id] ?? { amount: '', note: '' };
      return { ...f, [id]: { ...cur, ...patch } };
    });
  };

  // Instant entry (long-press) of a single substance with its default values.
  const submitInstant = async (sub: Substance) => {
    try {
      const res = await create.mutateAsync({ substanceId: sub.id, takenAt, amount: null, notes: null });
      haptics.success();
      const created = res.intake;
      const companions = res.companions ?? [];
      toast.show({
        message: t('quickEntry.toast.saved', { name: sub.name }),
        detail: [created.amount, formatTime(created.takenAt), ...companions.map((c) => `+ ${c.intake.substanceName}`)]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: t('action.undo'),
          onClick: () => {
            remove.mutate(created.id);
            for (const c of companions) remove.mutate(c.intake.id);
          },
        },
      });
      if (res.nightMed && !res.assessmentExists && res.assessmentDate) {
        setTimeout(() => setAssessment({ open: true, date: res.assessmentDate! }), 280);
      }
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('quickEntry.toast.failed'), detail: (e as Error).message });
    }
  };

  // Collective entry of all selected substances (same timestamp).
  const submitSelected = async () => {
    // Build from `selectedSubs` (currently existing substances), not from
    // raw IDs — so a meanwhile-archived/deleted selection can never produce
    // an intake with a dead id.
    if (selectedSubs.length === 0 || batch.isPending) return;
    const entries: IntakeBatchEntryInput[] = selectedSubs.map((sub) => {
      const f = fields[sub.id] ?? { amount: '', note: '' };
      return { substanceId: sub.id, amount: f.amount.trim() || null, notes: f.note.trim() || null };
    });
    try {
      const res = await batch.mutateAsync({ takenAt, entries });
      haptics.success();
      const mainIds = res.entries.map((e) => e.intake.id);
      const compIds = res.entries.flatMap((e) => e.companions.map((c) => c.intake.id));
      const names = res.entries.map((e) => e.intake.substanceName);
      const compNames = res.entries.flatMap((e) => e.companions.map((c) => c.intake.substanceName));
      toast.show({
        message:
          res.count === 1
            ? t('quickEntry.toast.saved', { name: names[0] })
            : t('quickEntry.toast.savedCount', { count: res.count }),
        detail: [...names, ...compNames.map((n) => `+ ${n}`)].join(' · '),
        action: {
          label: t('action.undo'),
          onClick: () => {
            for (const id of [...mainIds, ...compIds]) remove.mutate(id);
          },
        },
      });
      resetSelection();
      if (res.nightMed && !res.assessmentExists && res.assessmentDate) {
        setTimeout(() => setAssessment({ open: true, date: res.assessmentDate! }), 280);
      }
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('quickEntry.toast.failed'), detail: (e as Error).message });
    }
  };

  // Collective entry of all plan substances for a slot at the chosen time.
  const submitBatch = async (slot: PlanSlot, labelKey: 'quickEntry.planBatch.morning' | 'quickEntry.planBatch.noon' | 'quickEntry.planBatch.evening' | 'quickEntry.planBatch.night') => {
    if (planBatch.isPending) return;
    const label = t(labelKey);
    resetSelection();
    try {
      const res = await planBatch.mutateAsync({ slot, takenAt });
      if (res.entries.length === 0) {
        haptics.warning();
        toast.show({
          tone: 'warning',
          message: t('quickEntry.toast.batchEmpty', { label }),
          detail: t('quickEntry.toast.batchEmptyDetail'),
        });
        return;
      }
      haptics.success();
      const ids = res.entries.map((e) => e.intake.id);
      const names = res.entries.map((e) => e.intake.substanceName);
      toast.show({
        message: t('quickEntry.toast.batchSaved', { label }),
        detail: [`${res.entries.length}×`, names.join(', '), formatTime(res.entries[0].intake.takenAt)]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: t('action.undo'),
          onClick: () => {
            for (const id of ids) remove.mutate(id);
          },
        },
      });
      if (res.nightMed && !res.assessmentExists && res.assessmentDate) {
        setTimeout(() => setAssessment({ open: true, date: res.assessmentDate! }), 280);
      }
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('quickEntry.toast.failed'), detail: (e as Error).message });
    }
  };

  const isOffline = error instanceof ApiError && error.status === 0;
  const hasSelection = selectedSubs.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()} · ${formatFull(today).replace(/,?\s\d{4}$/, '')}`}
        title={t('quickEntry.title')}
        action={
          <div className="flex items-center gap-1">
            <Link to="/konsole">
              <IconButton label={t('quickEntry.consoleLabel')}>
                <SquareTerminal size={20} />
              </IconButton>
            </Link>
            <Link to="/einstellungen">
              <IconButton label={t('quickEntry.settingsLabel')}>
                <Settings2 size={20} />
              </IconButton>
            </Link>
          </div>
        }
      />

      {isOffline && (
        <Card className="mb-4 p-4 flex items-center gap-3 ring-accent/40">
          <WifiOff size={20} className="text-accent shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-ink">{t('quickEntry.offlineTitle')}</p>
            <p className="text-ink-muted text-xs">{t('quickEntry.offlineDetail')}</p>
          </div>
          <Link to="/einstellungen">
            <Button size="sm" variant="soft">
              {t('action.open')}
            </Button>
          </Link>
        </Card>
      )}

      {/* DEFAULTS-compliance notice */}
      {hasAnyMissing && (
        <Card className="mb-4 p-4 flex items-start gap-3 ring-warn/40">
          <AlertCircle size={20} className="text-warn shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-ink">
              {missingDefaults.size === 1
                ? t('quickEntry.missingDefaults.one')
                : t('quickEntry.missingDefaults.many', { count: missingDefaults.size })}
            </p>
            <p className="text-ink-muted text-xs leading-snug mt-0.5">
              {t('quickEntry.missingDefaultsDetail')}
            </p>
          </div>
          <Link to="/einstellungen">
            <Button size="sm" variant="soft">
              {t('quickEntry.maintain')}
            </Button>
          </Link>
        </Card>
      )}

      {/* Composer: shared timestamp + per-substance amount/note */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 size={18} className="text-ink-muted shrink-0" />
          <input
            type="datetime-local"
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-medium text-ink tabular focus:outline-none"
          />
          <button
            onClick={() => {
              setTakenAt(nowLocalInput());
              haptics.light();
            }}
            className="press shrink-0 rounded-xl bg-surface2 px-3 h-9 text-xs font-semibold text-ink-muted hover:text-ink"
          >
            {t('action.now')}
          </button>
        </div>

        <div className="h-px bg-hairline" />

        {hasSelection ? (
          <div className="space-y-2.5">
            {selectedSubs.map((sub) => (
              <SelectedRow
                key={sub.id}
                sub={sub}
                def={defaultFor(sub.name)}
                amount={fields[sub.id]?.amount ?? ''}
                note={fields[sub.id]?.note ?? ''}
                onAmount={(v) => setField(sub.id, { amount: v })}
                onNote={(v) => setField(sub.id, { note: v })}
                onRemove={() => removeSelected(sub.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-faint leading-snug pl-1">
            {t('quickEntry.composerHint')}
            <br />
            {t('quickEntry.composerHintLongPress')}
          </p>
        )}
      </Card>

      {/* Substance grid */}
      <div className="mt-5 flex items-center justify-between px-1 mb-2.5 gap-3">
        <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint shrink-0">
          {sortMode ? t('quickEntry.sortHeaderActive') : t('quickEntry.sortHeader')}
        </p>
        {sortMode ? (
          <button
            onClick={exitSortMode}
            className="press text-[13px] font-semibold text-primary inline-flex items-center gap-1"
          >
            <Check size={15} /> {t('quickEntry.done')}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {substances.length > 1 && (
              <button
                onClick={enterSortMode}
                className="press text-[13px] font-medium text-ink-muted hover:text-ink inline-flex items-center gap-1"
              >
                <ArrowUpDown size={14} /> {t('quickEntry.sort')}
              </button>
            )}
            <button
              onClick={() => setManageOpen(true)}
              className="press text-[13px] font-medium text-primary inline-flex items-center gap-1"
            >
              {t('quickEntry.manage')}
            </button>
          </div>
        )}
      </div>

      {/* Sort toggle "manual ↔ frequency" — only affects the tile order.
          Switching to "frequency" does not touch the server-side
          `sort_order`; tapping "Sort" later returns to manual mode and
          shows the last saved order. */}
      {!sortMode && substances.length > 1 && (
        <div className="mb-3 inline-flex rounded-full bg-surface2 ring-1 ring-line p-0.5">
          <SortPill
            active={sortKey === 'manual'}
            onClick={() => {
              haptics.light();
              setSortKey('manual');
            }}
            label={t('quickEntry.sortManual')}
          />
          <SortPill
            active={sortKey === 'frequency'}
            onClick={() => {
              haptics.light();
              setSortKey('frequency');
            }}
            label={t('quickEntry.sortFrequency')}
          />
        </div>
      )}

      {sortMode ? (
        <Reorder.Group axis="y" values={ordered} onReorder={onReorder} className="space-y-2">
          {ordered.map((s) => (
            <SortRow key={s.id} sub={s} />
          ))}
        </Reorder.Group>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {morningCount > 0 && (
            <PlanBatchTile
              label={t('quickEntry.planBatch.morning')}
              count={morningCount}
              icon={<Sunrise size={20} strokeWidth={2.2} />}
              color="#E0944A"
              pending={planBatch.isPending}
              onPress={() => submitBatch('morning', 'quickEntry.planBatch.morning')}
            />
          )}
          {noonCount > 0 && (
            <PlanBatchTile
              label={t('quickEntry.planBatch.noon')}
              count={noonCount}
              icon={<Sun size={20} strokeWidth={2.2} />}
              color="#D9B441"
              pending={planBatch.isPending}
              onPress={() => submitBatch('noon', 'quickEntry.planBatch.noon')}
            />
          )}
          {eveningCount > 0 && (
            <PlanBatchTile
              label={t('quickEntry.planBatch.evening')}
              count={eveningCount}
              icon={<Sunset size={20} strokeWidth={2.2} />}
              color="#C06E4E"
              pending={planBatch.isPending}
              onPress={() => submitBatch('evening', 'quickEntry.planBatch.evening')}
            />
          )}
          {nightCount > 0 && (
            <PlanBatchTile
              label={t('quickEntry.planBatch.night')}
              count={nightCount}
              icon={<Moon size={20} strokeWidth={2.2} />}
              color="#6E62B6"
              pending={planBatch.isPending}
              onPress={() => submitBatch('night', 'quickEntry.planBatch.night')}
            />
          )}
          {displaySubstances.map((s) => (
            <SubstanceTile
              key={s.id}
              sub={s}
              selected={selectedIds.includes(s.id)}
              missingDefault={missingDefaults.has(s.name.toLowerCase())}
              inPlan={planIndex.has(nameKey(s.name))}
              frequency={frequencyById.get(s.id) ?? 0}
              sortMode={sortKey === 'frequency'}
              onSelect={() => toggleSelect(s.id)}
              onInstant={() => submitInstant(s)}
            />
          ))}
          <button
            onClick={() => setManageOpen(true)}
            className="press min-h-[5.5rem] rounded-3xl border-2 border-dashed border-line grid place-items-center text-ink-faint hover:border-primary/50 hover:text-primary transition-colors"
          >
            <span className="flex flex-col items-center gap-1">
              <Plus size={22} />
              <span className="text-xs font-medium">{t('quickEntry.addSubstance')}</span>
            </span>
          </button>
        </div>
      )}
      {sortMode && (
        <p className="text-center text-xs text-ink-faint mt-3 px-6 leading-relaxed">
          {t('quickEntry.sortModeHint')}
        </p>
      )}

      {substances.length === 0 && !isOffline && (
        <p className="text-center text-sm text-ink-muted mt-6 px-6 leading-relaxed">
          {t('quickEntry.emptyHint')}
        </p>
      )}

      {/* Logged today */}
      {todayIntakes.length > 0 && (
        <div className="mt-7">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
              {t('quickEntry.loggedToday')}
            </p>
            <Link to="/verlauf" className="text-[13px] font-medium text-primary inline-flex items-center">
              {t('quickEntry.showAll')} <ChevronRight size={15} />
            </Link>
          </div>
          <Card className="divide-y divide-hairline overflow-hidden">
            {todayIntakes.slice(0, 6).map((it) => {
              const inPlan = isPlanIntake(it, planIndex);
              return (
                <div
                  key={it.id}
                  className={cx(
                    'flex items-center gap-3 px-3.5 py-2.5 relative',
                    // Plan intakes carry a thin left accent bar plus a
                    // warmer background tint; everything else is unchanged.
                    // The shading is intentionally subtle so the list
                    // does not look "alarming" — a visual distinction only.
                    inPlan
                      ? 'bg-primary-soft/35 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r-full before:bg-primary'
                      : '',
                  )}
                >
                  <span className="tabular text-sm font-semibold text-ink-muted w-11 shrink-0">
                    {formatTime(it.takenAt)}
                  </span>
                  <SubstanceSeal name={it.substanceName} color={substances.find((s) => s.id === it.substanceId)?.color} size="sm" />
                  <span className="flex-1 min-w-0 text-sm text-ink truncate">{it.substanceName}</span>
                  {inPlan && (
                    <span
                      title={t('quickEntry.planBadgeTitle')}
                      className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
                    >
                      {t('quickEntry.planBadgeLabel')}
                    </span>
                  )}
                  {it.amount && <span className="text-xs text-ink-muted shrink-0 tabular">{it.amount}</span>}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* Floating confirm bar (collective entry) */}
      <AnimatePresence>
        {hasSelection && !sortMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed inset-x-0 z-30 px-4 bottom-[calc(env(safe-area-inset-bottom)+4.6rem)]"
          >
            <div className="mx-auto max-w-app glass ring-1 ring-line shadow-float rounded-3xl p-2 pl-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate">
                  {selectedSubs.length === 1
                    ? selectedSubs[0]?.name
                    : t('quickEntry.selectedCount.many', { count: selectedSubs.length })}
                </p>
                <p className="text-xs text-ink-muted truncate tabular">
                  {t('quickEntry.takenAtTime', { time: takenAt.slice(11, 16) })}
                </p>
              </div>
              <button
                onClick={resetSelection}
                className="press shrink-0 grid place-items-center size-10 rounded-2xl text-ink-faint hover:text-ink hover:bg-surface2"
                aria-label={t('quickEntry.discardSelectionAria')}
              >
                <X size={18} />
              </button>
              <Button
                size="lg"
                icon={<Check size={19} />}
                loading={batch.isPending}
                onClick={submitSelected}
                className="shrink-0"
              >
                {t('quickEntry.record')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SubstanceManager open={manageOpen} onClose={() => setManageOpen(false)} />
      <AssessmentSheet
        open={assessment.open}
        date={assessment.date}
        onClose={() => setAssessment((a) => ({ ...a, open: false }))}
      />
    </>
  );
}

/** A selected substance in the composer: amount + note, each with a DEFAULTS preview. */
function SelectedRow({
  sub,
  def,
  amount,
  note,
  onAmount,
  onNote,
  onRemove,
}: {
  sub: Substance;
  def: SubstanceDefault | null;
  amount: string;
  note: string;
  onAmount: (v: string) => void;
  onNote: (v: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const defaultNote = def?.note ?? null;
  const companions = def?.companions ?? [];
  return (
    <div className="rounded-2xl bg-surface2/50 ring-1 ring-line p-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <SubstanceSeal name={sub.name} color={sub.color} size="sm" />
        <p className="flex-1 min-w-0 font-medium text-ink truncate flex items-center gap-1.5">
          <span className="truncate">{sub.name}</span>
          {sub.isNightMed && <Moon size={12} className="text-accent shrink-0" />}
        </p>
        <button
          onClick={onRemove}
          className="press grid place-items-center size-7 rounded-lg text-ink-faint hover:text-ink hover:bg-surface2"
          aria-label={t('quickEntry.removeSubstanceAria', { name: sub.name })}
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1.3fr] gap-2">
        <TextInput
          inputMode="text"
          placeholder={sub.defaultDose ?? def?.amount ?? t('quickEntry.amountLabel')}
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          aria-label={t('quickEntry.amountAria', { name: sub.name })}
        />
        <TextInput
          placeholder={defaultNote ? t('quickEntry.noteWithDefault') : t('quickEntry.noteLabel')}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          aria-label={t('quickEntry.noteAria', { name: sub.name })}
        />
      </div>
      {defaultNote && !note.trim() && (
        <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
          <span className="text-accent font-medium">{t('quickEntry.defaultLabel')}</span> {defaultNote}
        </p>
      )}
      {companions.length > 0 && (
        <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
          <span className="text-accent font-medium">{t('quickEntry.alsoAdded')}</span>{' '}
          {companions.map((c) => (c.amount ? `${c.name} (${c.amount})` : c.name)).join(', ')}
        </p>
      )}
    </div>
  );
}

function SubstanceTile({
  sub,
  selected,
  missingDefault,
  inPlan,
  frequency,
  sortMode,
  onSelect,
  onInstant,
}: {
  sub: Substance;
  selected: boolean;
  missingDefault?: boolean;
  inPlan?: boolean;
  frequency?: number;
  sortMode?: boolean;
  onSelect: () => void;
  onInstant: () => void;
}) {
  const t = useT();
  const timer = useRef<number | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Tooltip for the tile: shows the missing-default hint and the plan
  // membership, plus the frequency when "by frequency" sorting is active —
  // so the user understands why the tile sits where it does.
  const tooltipParts: string[] = [];
  if (missingDefault) tooltipParts.push(t('quickEntry.missingDefaultTooltip'));
  if (inPlan) tooltipParts.push(t('quickEntry.inPlanTooltip'));
  if (sortMode && typeof frequency === 'number') {
    tooltipParts.push(t('quickEntry.frequencyTooltip', { count: frequency }));
  }
  const title = tooltipParts.length > 0 ? tooltipParts.join(' · ') : undefined;

  return (
    <button
      onPointerDown={() => {
        held.current = false;
        timer.current = window.setTimeout(() => {
          held.current = true;
          haptics.medium();
          onInstant();
        }, 480);
      }}
      onPointerUp={() => {
        clear();
        if (!held.current) onSelect();
      }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      title={title}
      className={cx(
        'press relative min-h-[5.5rem] rounded-3xl p-3 text-left ring-1 transition-all duration-150 overflow-hidden',
        // Plan substances get a soft tint + accent bar analogous to the
        // "Logged today" list, so the user can consistently tell what is
        // part of the plan and what was logged "on top".
        selected
          ? 'ring-2 bg-surface shadow-raised'
          : inPlan
            ? 'ring-line bg-primary-soft/40 hover:bg-primary-soft/55 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:bg-primary'
            : 'ring-line bg-surface hover:bg-surface2',
      )}
      style={selected ? { boxShadow: `0 8px 22px ${(sub.color ?? '#5B7A60')}33`, ['--tw-ring-color' as string]: sub.color ?? '#5B7A60' } : undefined}
    >
      <span
        className="absolute right-3 top-3 size-2.5 rounded-full"
        style={{ backgroundColor: sub.color ?? '#5B7A60' }}
      />
      {missingDefault && (
        <span
          className="absolute left-3 top-3 grid place-items-center size-4 rounded-full text-white"
          style={{ backgroundColor: 'var(--warn, #C9A14A)' }}
          aria-label={t('quickEntry.missingDefaultAria')}
        >
          <AlertCircle size={11} strokeWidth={2.5} />
        </span>
      )}
      {inPlan && !missingDefault && (
        <span
          className="absolute left-3 top-3 rounded-full bg-primary/20 text-primary text-[9px] font-semibold uppercase tracking-wider px-1.5 py-px"
          aria-label={t('quickEntry.inPlanTooltip')}
        >
          {t('quickEntry.planBadgeLabel')}
        </span>
      )}
      <SubstanceSeal name={sub.name} color={sub.color} />
      <p className="mt-2 font-medium text-[15px] text-ink leading-tight pr-3 flex items-center gap-1">
        <span className="truncate">{sub.name}</span>
        {sub.isNightMed && <Moon size={12} className="text-accent shrink-0" />}
      </p>
      {sub.defaultDose && <p className="text-xs text-ink-muted truncate">{sub.defaultDose}</p>}
      {sortMode && typeof frequency === 'number' && frequency > 0 && (
        <p className="mt-0.5 text-[11px] text-ink-faint tabular">{t('quickEntry.frequencyShort', { count: frequency })}</p>
      )}
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute right-2.5 bottom-2.5 grid place-items-center size-6 rounded-full text-white"
            style={{ backgroundColor: sub.color ?? '#5B7A60' }}
          >
            <Check size={14} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/** Compact pill button for the "manual / frequency" sort toggle. */
function SortPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'press rounded-full px-3 h-8 text-[12px] font-semibold transition-colors',
        active
          ? 'bg-primary text-primary-fg shadow-raised'
          : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

/**
 * Collective tile "Morning meds"/"Night meds": one tap logs every plan
 * substance for that slot at the chosen timestamp.
 */
function PlanBatchTile({
  label,
  count,
  icon,
  color,
  pending,
  onPress,
}: {
  label: string;
  count: number;
  icon: ReactNode;
  color: string;
  pending?: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <button
      onClick={() => {
        haptics.medium();
        onPress();
      }}
      disabled={pending}
      title={t('quickEntry.planBatch.tileTitle', { count })}
      className={cx(
        'press relative min-h-[5.5rem] rounded-3xl p-3 text-left ring-1 transition-all duration-150 overflow-hidden flex flex-col',
        'ring-line bg-surface2 hover:bg-surface disabled:opacity-60',
      )}
    >
      <span className="grid place-items-center size-9 rounded-2xl text-white shrink-0" style={{ backgroundColor: color }}>
        {icon}
      </span>
      <p className="mt-2 font-medium text-[15px] text-ink leading-tight truncate">{label}</p>
      <p className="text-xs text-ink-muted">
        {count === 1 ? t('quickEntry.planBatch.entryCount.one') : t('quickEntry.planBatch.entryCount.many', { count })}
      </p>
    </button>
  );
}

/** A row in sort mode: draggable via the handle (framer-motion Reorder). */
function SortRow({ sub }: { sub: Substance }) {
  const t = useT();
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={sub}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.03, boxShadow: '0 12px 30px rgba(0,0,0,0.18)' }}
      className="flex items-center gap-3 rounded-2xl bg-surface ring-1 ring-line px-3 py-2.5 select-none"
    >
      <button
        onPointerDown={(e) => {
          haptics.medium();
          controls.start(e);
        }}
        className="touch-none cursor-grab active:cursor-grabbing grid place-items-center size-9 rounded-xl text-ink-faint hover:text-ink-muted hover:bg-surface2 shrink-0"
        aria-label={t('quickEntry.dragHandleAria')}
      >
        <GripVertical size={18} />
      </button>
      <SubstanceSeal name={sub.name} color={sub.color} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[15px] text-ink truncate flex items-center gap-1.5">
          <span className="truncate">{sub.name}</span>
          {sub.isNightMed && <Moon size={12} className="text-accent shrink-0" />}
        </p>
        {sub.defaultDose && <p className="text-xs text-ink-muted truncate">{sub.defaultDose}</p>}
      </div>
    </Reorder.Item>
  );
}
