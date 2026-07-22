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
import { useSubstances, useIntakes, useIntakeMutations, useSubstanceMutations, useDefaults, useCompliance, usePlan } from '../lib/queries';
import { ApiError } from '../lib/api';
import { isPlanIntake, planDoseIndex, nameKey } from '../lib/plan';
import type { Substance, PlanSlot, SubstanceDefault, IntakeBatchEntryInput } from '../lib/types';

export function QuickEntryScreen() {
  const toast = useToast();
  const { data: substances = [], error } = useSubstances();
  const { data: defaults } = useDefaults();
  const { data: compliance } = useCompliance();
  // Konsum-Tag (03:30-Tagesgrenze), nicht der reine Wand­uhr-Tag — eine
  // Einnahme um 02:30 morgens gehört konsumtechnisch zum Vortag, und
  // so soll sie auch unter "Heute erfasst" erscheinen.
  const today = consumptionToday();
  // Wir laden die letzten ~3 Wand­uhr-Tage und filtern lokal nach
  // `intake.date === today` (Konsum-Tag, vom Server mit DAY_BOUNDARY
  // berechnet).
  const todayIntakesRaw = useIntakes(
    { from: consumptionTodayOffset(-1), limit: 200 },
  );
  const todayIntakes = useMemo(
    () => (todayIntakesRaw.data ?? []).filter((it) => it.date === today),
    [todayIntakesRaw.data, today],
  );
  // Breitere Fenster (90 Tage) für „Sortieren nach Häufigkeit": reicht locker
  // für die Alltags-Sortierung im Heute-Tab. `limit` deckt mehrere Einnahmen
  // pro Tag sicher ab.
  const recentIntakesRaw = useIntakes({ limit: 1500 });
  const { data: plan } = usePlan();
  const planIndex = useMemo(() => planDoseIndex(plan), [plan]);
  const { create, remove, batch, planBatch } = useIntakeMutations();

  // Sammel-Einträge "Morgendmedis"/"Nachtmedis": tragen mit einem Tipp alle
  // Substanzen des aktuell wirksamen Plans für den jeweiligen Slot ein.
  const morningCount = useMemo(() => (plan?.items ?? []).filter((i) => i.morning?.trim()).length, [plan]);
  const noonCount = useMemo(() => (plan?.items ?? []).filter((i) => i.noon?.trim()).length, [plan]);
  const eveningCount = useMemo(() => (plan?.items ?? []).filter((i) => i.evening?.trim()).length, [plan]);
  const nightCount = useMemo(() => (plan?.items ?? []).filter((i) => i.night?.trim()).length, [plan]);

  // Substanz-Namen, für die DEFAULTS.md keinen Eintrag hat.
  const missingDefaults = useMemo(() => {
    const set = new Set<string>();
    if (compliance?.missing) {
      for (const m of compliance.missing) set.add(m.name.toLowerCase());
    }
    return set;
  }, [compliance]);
  const hasAnyMissing = missingDefaults.size > 0;

  // Mehrfach-Auswahl: mehrere Substanzen mit demselben Zeitpunkt, je eigener
  // Menge/Notiz. `selectedIds` hält die Reihenfolge der Auswahl, `fields` die
  // pro-Substanz-Eingaben.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [fields, setFields] = useState<Record<number, { amount: string; note: string }>>({});
  const [takenAt, setTakenAt] = useState(nowLocalInput());
  const [manageOpen, setManageOpen] = useState(false);
  const [assessment, setAssessment] = useState<{ open: boolean; date: string }>({ open: false, date: today });

  // Sortierung: manuell (Drag & Drop) vs. nach Häufigkeit. `sortMode` ist der
  // Drag-Editor-Modus (true = gerade am Ziehen); `sortKey` entscheidet, ob die
  // Kachel-Reihenfolge aus dem Server-`sort_order` oder aus der Einnahmen-
  // Häufigkeit der letzten ~90 Tage kommt.
  type SortKey = 'manual' | 'frequency';
  const { reorder } = useSubstanceMutations();
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [sortMode, setSortMode] = useState(false);
  const [ordered, setOrdered] = useState<Substance[]>([]);
  const saveTimer = useRef<number | null>(null);
  const pendingIds = useRef<number[] | null>(null);

  // Häufigkeit der Substanzen aus den letzten ~90 Tagen. ID → Anzahl
  // Einnahmen (Begleitsubstanzen aus DEFAULTS.md zählen mit, weil sie echte
  // Einnahmen sind). Substanzen ohne Treffer landen mit 0 ans Ende.
  const frequencyById = useMemo(() => {
    const counts = new Map<number, number>();
    for (const it of recentIntakesRaw.data ?? []) {
      if (it.substanceId == null) continue;
      counts.set(it.substanceId, (counts.get(it.substanceId) ?? 0) + 1);
    }
    return counts;
  }, [recentIntakesRaw.data]);

  /** Anzuzeigende Substanz-Liste je nach Sortierung. */
  const displaySubstances = useMemo(() => {
    if (sortKey === 'frequency') {
      return [...substances].sort((a, b) => {
        const diff = (frequencyById.get(b.id) ?? 0) - (frequencyById.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        // Tiebreaker: bisherige manuelle Reihenfolge (sort_order asc), dann Name.
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'de');
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

  // Beim Verlassen des Bildschirms eine noch ausstehende Speicherung nachholen.
  useEffect(() => () => flushOrder(), []);

  // DEFAULTS (Notiz/Menge/Begleitstoffe) einer Substanz — case-insensitive.
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
    // `takenAt` bleibt bewusst stehen, damit mehrere Blöcke nacheinander mit
    // demselben Zeitpunkt erfasst werden können (erst "Jetzt" oder ein neuer
    // Besuch des Tabs setzt ihn zurück).
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

  // Sofort-Eintrag (Long-Press) einer einzelnen Substanz mit Standardwerten.
  const submitInstant = async (sub: Substance) => {
    try {
      const res = await create.mutateAsync({ substanceId: sub.id, takenAt, amount: null, notes: null });
      haptics.success();
      const created = res.intake;
      const companions = res.companions ?? [];
      toast.show({
        message: `${sub.name} eingetragen`,
        detail: [created.amount, formatTime(created.takenAt), ...companions.map((c) => `+ ${c.intake.substanceName}`)]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: 'Rückgängig',
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
      toast.show({ tone: 'warning', message: 'Eintrag fehlgeschlagen', detail: (e as Error).message });
    }
  };

  // Sammel-Eintrag aller ausgewählten Substanzen (gleicher Zeitpunkt).
  const submitSelected = async () => {
    // Aus `selectedSubs` (aktuell existierende Substanzen) bauen, nicht aus den
    // rohen IDs — so kann eine zwischenzeitlich archivierte/gelöschte Auswahl
    // keinen Eintrag mit toter ID erzeugen.
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
        message: res.count === 1 ? `${names[0]} eingetragen` : `${res.count} Einträge erfasst`,
        detail: [...names, ...compNames.map((n) => `+ ${n}`)].join(' · '),
        action: {
          label: 'Rückgängig',
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
      toast.show({ tone: 'warning', message: 'Eintrag fehlgeschlagen', detail: (e as Error).message });
    }
  };

  // Sammel-Eintrag aller Plan-Substanzen eines Slots zum gewählten Zeitpunkt.
  const submitBatch = async (slot: PlanSlot, label: string) => {
    if (planBatch.isPending) return;
    resetSelection();
    try {
      const res = await planBatch.mutateAsync({ slot, takenAt });
      if (res.entries.length === 0) {
        haptics.warning();
        toast.show({
          tone: 'warning',
          message: `${label}: nichts eingetragen`,
          detail: 'Für diesen Slot ist im aktuellen Plan nichts hinterlegt.',
        });
        return;
      }
      haptics.success();
      const ids = res.entries.map((e) => e.intake.id);
      const names = res.entries.map((e) => e.intake.substanceName);
      toast.show({
        message: `${label} eingetragen`,
        detail: [`${res.entries.length}×`, names.join(', '), formatTime(res.entries[0].intake.takenAt)]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: 'Rückgängig',
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
      toast.show({ tone: 'warning', message: 'Eintrag fehlgeschlagen', detail: (e as Error).message });
    }
  };

  const isOffline = error instanceof ApiError && error.status === 0;
  const hasSelection = selectedSubs.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()} · ${formatFull(today).replace(/,?\s\d{4}$/, '')}`}
        title="Heute"
        action={
          <div className="flex items-center gap-1">
            <Link to="/konsole">
              <IconButton label="Daten-Konsole">
                <SquareTerminal size={20} />
              </IconButton>
            </Link>
            <Link to="/einstellungen">
              <IconButton label="Einstellungen">
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
            <p className="font-medium text-ink">Server nicht erreichbar</p>
            <p className="text-ink-muted text-xs">Adresse in den Einstellungen prüfen.</p>
          </div>
          <Link to="/einstellungen">
            <Button size="sm" variant="soft">
              Öffnen
            </Button>
          </Link>
        </Card>
      )}

      {/* DEFAULTS-Compliance-Hinweis */}
      {hasAnyMissing && (
        <Card className="mb-4 p-4 flex items-start gap-3 ring-warn/40">
          <AlertCircle size={20} className="text-warn shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-ink">
              {missingDefaults.size === 1
                ? '1 Substanz ohne DEFAULTS-Eintrag'
                : `${missingDefaults.size} Substanzen ohne DEFAULTS-Eintrag`}
            </p>
            <p className="text-ink-muted text-xs leading-snug mt-0.5">
              Diese Stoffe bekommen beim Eintragen aktuell keine Standard-Notiz/-Menge. In den
              Einstellungen unter „Standard-Notizen" ergänzen.
            </p>
          </div>
          <Link to="/einstellungen">
            <Button size="sm" variant="soft">
              Pflegen
            </Button>
          </Link>
        </Card>
      )}

      {/* Composer: gemeinsamer Zeitpunkt + pro-Substanz Menge/Notiz */}
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
            Jetzt
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
            Substanz(en) unten antippen — Menge &amp; Notiz erscheinen dann hier, der Zeitpunkt gilt für alle.
            Lange drücken trägt eine Substanz sofort mit Standardwerten ein.
          </p>
        )}
      </Card>

      {/* Substanz-Raster */}
      <div className="mt-5 flex items-center justify-between px-1 mb-2.5 gap-3">
        <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint shrink-0">
          {sortMode ? 'Reihenfolge ziehen' : 'Substanzen wählen'}
        </p>
        {sortMode ? (
          <button
            onClick={exitSortMode}
            className="press text-[13px] font-semibold text-primary inline-flex items-center gap-1"
          >
            <Check size={15} /> Fertig
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {substances.length > 1 && (
              <button
                onClick={enterSortMode}
                className="press text-[13px] font-medium text-ink-muted hover:text-ink inline-flex items-center gap-1"
              >
                <ArrowUpDown size={14} /> Sortieren
              </button>
            )}
            <button
              onClick={() => setManageOpen(true)}
              className="press text-[13px] font-medium text-primary inline-flex items-center gap-1"
            >
              Verwalten
            </button>
          </div>
        )}
      </div>

      {/* Sortier-Toggle „manuell ↔ nach Häufigkeit" — beeinflusst nur die
          Reihenfolge der Kacheln. Beim Wechsel auf „Häufigkeit" wird die
          serverseitige `sort_order` nicht angefasst; ein Klick auf „Sortieren"
          führt wieder in den manuellen Modus und zeigt den letzten
          gespeicherten Stand. */}
      {!sortMode && substances.length > 1 && (
        <div className="mb-3 inline-flex rounded-full bg-surface2 ring-1 ring-line p-0.5">
          <SortPill
            active={sortKey === 'manual'}
            onClick={() => {
              haptics.light();
              setSortKey('manual');
            }}
            label="Manuell"
          />
          <SortPill
            active={sortKey === 'frequency'}
            onClick={() => {
              haptics.light();
              setSortKey('frequency');
            }}
            label="Häufigkeit"
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
              label="Morgendmedis"
              count={morningCount}
              icon={<Sunrise size={20} strokeWidth={2.2} />}
              color="#E0944A"
              pending={planBatch.isPending}
              onPress={() => submitBatch('morning', 'Morgendmedis')}
            />
          )}
          {noonCount > 0 && (
            <PlanBatchTile
              label="Mittagsmedis"
              count={noonCount}
              icon={<Sun size={20} strokeWidth={2.2} />}
              color="#D9B441"
              pending={planBatch.isPending}
              onPress={() => submitBatch('noon', 'Mittagsmedis')}
            />
          )}
          {eveningCount > 0 && (
            <PlanBatchTile
              label="Abendmedis"
              count={eveningCount}
              icon={<Sunset size={20} strokeWidth={2.2} />}
              color="#C06E4E"
              pending={planBatch.isPending}
              onPress={() => submitBatch('evening', 'Abendmedis')}
            />
          )}
          {nightCount > 0 && (
            <PlanBatchTile
              label="Nachtmedis"
              count={nightCount}
              icon={<Moon size={20} strokeWidth={2.2} />}
              color="#6E62B6"
              pending={planBatch.isPending}
              onPress={() => submitBatch('night', 'Nachtmedis')}
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
              <span className="text-xs font-medium">Substanz</span>
            </span>
          </button>
        </div>
      )}
      {sortMode && (
        <p className="text-center text-xs text-ink-faint mt-3 px-6 leading-relaxed">
          Am Griff ziehen, um die Reihenfolge zu ändern — sie wird automatisch gespeichert.
        </p>
      )}

      {substances.length === 0 && !isOffline && (
        <p className="text-center text-sm text-ink-muted mt-6 px-6 leading-relaxed">
          Lege deine erste Substanz an, um mit einem Tipp Einnahmen zu erfassen.
        </p>
      )}

      {/* Heute erfasst */}
      {todayIntakes.length > 0 && (
        <div className="mt-7">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
              Heute erfasst
            </p>
            <Link to="/verlauf" className="text-[13px] font-medium text-primary inline-flex items-center">
              alle <ChevronRight size={15} />
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
                    // Plan-Einnahmen tragen einen feinen, linken Akzentbalken
                    // plus eine wärmere Hintergrund-Tönung; alles andere bleibt
                    // unverändert. Wir färben bewusst subtil, damit die Liste
                    // nicht „alarmistisch" wirkt — nur eine optische
                    // Unterscheidung.
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
                      title="Substanz und Dosis stimmen mit dem aktuellen Medikationsplan überein"
                      className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
                    >
                      Plan
                    </span>
                  )}
                  {it.amount && <span className="text-xs text-ink-muted shrink-0 tabular">{it.amount}</span>}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* schwebende Bestätigung (Sammel-Eintrag) */}
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
                  {selectedSubs.length === 1 ? selectedSubs[0]?.name : `${selectedSubs.length} Substanzen`}
                </p>
                <p className="text-xs text-ink-muted truncate tabular">{takenAt.slice(11, 16)} Uhr</p>
              </div>
              <button
                onClick={resetSelection}
                className="press shrink-0 grid place-items-center size-10 rounded-2xl text-ink-faint hover:text-ink hover:bg-surface2"
                aria-label="Auswahl verwerfen"
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
                Eintragen
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

/** Eine ausgewählte Substanz im Composer: Menge + Notiz, je mit DEFAULTS-Vorschau. */
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
          aria-label={`${sub.name} entfernen`}
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1.3fr] gap-2">
        <TextInput
          inputMode="text"
          placeholder={sub.defaultDose ?? def?.amount ?? 'Menge'}
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          aria-label={`Menge ${sub.name}`}
        />
        <TextInput
          placeholder={defaultNote ? 'Notiz (Standard hinterlegt)' : 'Notiz'}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          aria-label={`Notiz ${sub.name}`}
        />
      </div>
      {defaultNote && !note.trim() && (
        <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
          <span className="text-accent font-medium">Standard:</span> {defaultNote}
        </p>
      )}
      {companions.length > 0 && (
        <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
          <span className="text-accent font-medium">Automatisch dazu:</span>{' '}
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
  const timer = useRef<number | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Tooltip für die Kachel: zeigt Häufigkeit und Plan-Zugehörigkeit, wenn der
  // Sortier-Modus „Häufigkeit" läuft — damit der Nutzer versteht, warum die
  // Kachel wo steht.
  const tooltipParts: string[] = [];
  if (missingDefault) tooltipParts.push('Kein DEFAULTS-Eintrag – in Einstellungen ergänzen');
  if (inPlan) tooltipParts.push('Teil des aktuellen Medikationsplans');
  if (sortMode && typeof frequency === 'number') {
    tooltipParts.push(`${frequency}× erfasst in den letzten 90 Tagen`);
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
        // Plan-Substanzen bekommen eine sanfte Tönung + Akzentbalken analog zur
        // „Heute erfasst"-Liste, damit der Nutzer konsistent erkennt, was zum
        // Plan gehört und was „on top" erfasst wurde.
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
          aria-label="Kein DEFAULTS-Eintrag"
        >
          <AlertCircle size={11} strokeWidth={2.5} />
        </span>
      )}
      {inPlan && !missingDefault && (
        <span
          className="absolute left-3 top-3 rounded-full bg-primary/20 text-primary text-[9px] font-semibold uppercase tracking-wider px-1.5 py-px"
          aria-label="Teil des aktuellen Medikationsplans"
        >
          Plan
        </span>
      )}
      <SubstanceSeal name={sub.name} color={sub.color} />
      <p className="mt-2 font-medium text-[15px] text-ink leading-tight pr-3 flex items-center gap-1">
        <span className="truncate">{sub.name}</span>
        {sub.isNightMed && <Moon size={12} className="text-accent shrink-0" />}
      </p>
      {sub.defaultDose && <p className="text-xs text-ink-muted truncate">{sub.defaultDose}</p>}
      {sortMode && typeof frequency === 'number' && frequency > 0 && (
        <p className="mt-0.5 text-[11px] text-ink-faint tabular">{frequency}× letzte 90 T.</p>
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

/** Kompakter Pill-Button für den Sortier-Toggle „manuell / Häufigkeit". */
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
 * Sammel-Kachel "Morgendmedis"/"Nachtmedis": ein Tipp trägt alle
 * Plan-Substanzen des jeweiligen Slots zum gewählten Zeitpunkt ein.
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
  return (
    <button
      onClick={() => {
        haptics.medium();
        onPress();
      }}
      disabled={pending}
      title={`Alle ${count} Plan-Einträge auf einmal erfassen`}
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
        {count} {count === 1 ? 'Eintrag' : 'Einträge'}
      </p>
    </button>
  );
}

/** Eine Zeile im Sortier-Modus: per Griff ziehbar (framer-motion Reorder). */
function SortRow({ sub }: { sub: Substance }) {
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
        aria-label="Zum Sortieren ziehen"
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
