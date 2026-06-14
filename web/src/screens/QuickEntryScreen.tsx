import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { Settings2, Plus, Check, Clock3, Moon, Sunrise, ChevronRight, WifiOff, AlertCircle, GripVertical, ArrowUpDown } from 'lucide-react';
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
import type { Substance, PlanSlot } from '../lib/types';

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
  // berechnet). So greift die 03:30-Grenze zuverlässig in beide
  // Richtungen, unabhängig davon, ob wir uns vor oder nach 03:30
  // befinden — der Server-Filter `from/to` arbeitet auf Wand­uhr-Zeit
  // und kann den Rand nicht exakt treffen.
  const todayIntakesRaw = useIntakes(
    { from: consumptionTodayOffset(-1), limit: 200 },
  );
  const todayIntakes = useMemo(
    () => (todayIntakesRaw.data ?? []).filter((it) => it.date === today),
    [todayIntakesRaw.data, today],
  );
  const { data: plan } = usePlan();
  const { create, remove, planBatch } = useIntakeMutations();

  // Sammel-Einträge "Morgendmedis"/"Nachtmedis": tragen mit einem Tipp alle
  // Substanzen des aktuell wirksamen Plans für den jeweiligen Slot ein. Nur
  // sichtbar, wenn der Plan für den Slot überhaupt etwas vorsieht.
  const morningCount = useMemo(() => (plan?.items ?? []).filter((i) => i.morning?.trim()).length, [plan]);
  const nightCount = useMemo(() => (plan?.items ?? []).filter((i) => i.night?.trim()).length, [plan]);

  // Substanz-Namen, für die DEFAULTS.md keinen Eintrag hat. Case-insensitive
  // Schlüsselvergleich spiegelt das Server-Verhalten.
  const missingDefaults = useMemo(() => {
    const set = new Set<string>();
    if (compliance?.missing) {
      for (const m of compliance.missing) set.add(m.name.toLowerCase());
    }
    return set;
  }, [compliance]);
  const hasAnyMissing = missingDefaults.size > 0;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [takenAt, setTakenAt] = useState(nowLocalInput());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [assessment, setAssessment] = useState<{ open: boolean; date: string }>({ open: false, date: today });

  // Sortier-Modus: Reihenfolge der Kacheln per Drag anpassen. Die Reihenfolge
  // wird automatisch (debounced) als `sort_order` gespeichert und beim nächsten
  // Laden serverseitig über `ORDER BY sort_order` wieder abgerufen.
  const { reorder } = useSubstanceMutations();
  const [sortMode, setSortMode] = useState(false);
  const [ordered, setOrdered] = useState<Substance[]>([]);
  const saveTimer = useRef<number | null>(null);
  const pendingIds = useRef<number[] | null>(null);

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
    setSelectedId(null);
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

  const selected = useMemo(
    () => substances.find((s) => s.id === selectedId) ?? null,
    [substances, selectedId],
  );

  // Default-Notiz + -Menge aus DEFAULTS.md (Vorschau)
  const selectedDefault = useMemo(() => {
    if (!selected || !defaults) return null;
    const entry = Object.entries(defaults.defaults).find(
      ([k]) => k.toLowerCase() === selected.name.toLowerCase(),
    );
    return entry?.[1] ?? null;
  }, [selected, defaults]);
  const defaultNote = selectedDefault?.note ?? null;
  // Begleitsubstanzen (DEFAULTS "Mit:"), die beim Eintragen automatisch mitkommen
  const companionDefaults = selectedDefault?.companions ?? [];

  const resetComposer = () => {
    setSelectedId(null);
    setAmount('');
    setNote('');
    // `takenAt` bleibt bewusst stehen, damit mehrere Einträge
    // hintereinander mit demselben Zeitpunkt erfasst werden können
    // (z. B. "Morgendmedis"-Block oder mehrere Substanzen kurz
    // nacheinander). Erst beim erneuten Aufruf des Bildschirms
    // wird der Zeitpunkt über das `useState(nowLocalInput())`-
    // Initial auf "jetzt" gesetzt.
  };

  const submit = async (sub: Substance, opts?: { instant?: boolean }) => {
    try {
      const res = await create.mutateAsync({
        substanceId: sub.id,
        takenAt,
        amount: amount.trim() || null,
        notes: note.trim() || null,
      });
      haptics.success();
      const created = res.intake;
      const companions = res.companions ?? [];
      toast.show({
        message: `${sub.name} eingetragen`,
        detail: [
          created.amount,
          formatTime(created.takenAt),
          ...companions.map((c) => `+ ${c.intake.substanceName}`),
        ]
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
      resetComposer();
      if (res.nightMed && !res.assessmentExists && res.assessmentDate) {
        // kurze Verzögerung, damit der Toast sichtbar ist, dann Tagesbild
        setTimeout(() => setAssessment({ open: true, date: res.assessmentDate! }), opts?.instant ? 280 : 180);
      }
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Eintrag fehlgeschlagen', detail: (e as Error).message });
    }
  };

  // Sammel-Eintrag aller Plan-Substanzen eines Slots zum gewählten Zeitpunkt.
  const submitBatch = async (slot: PlanSlot, label: string) => {
    if (planBatch.isPending) return;
    setSelectedId(null);
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
      resetComposer();
      if (res.nightMed && !res.assessmentExists && res.assessmentDate) {
        // kurze Verzögerung, damit der Toast sichtbar ist, dann Tagesbild
        setTimeout(() => setAssessment({ open: true, date: res.assessmentDate! }), 280);
      }
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Eintrag fehlgeschlagen', detail: (e as Error).message });
    }
  };

  const isOffline = error instanceof ApiError && error.status === 0;

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()} · ${formatFull(today).replace(/,?\s\d{4}$/, '')}`}
        title="Heute"
        action={
          <Link to="/einstellungen">
            <IconButton label="Einstellungen">
              <Settings2 size={20} />
            </IconButton>
          </Link>
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

      {/* Composer */}
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

        <div className="grid grid-cols-[1fr_1.3fr] gap-3">
          <TextInput
            inputMode="text"
            placeholder={selected?.defaultDose ?? selectedDefault?.amount ?? 'Menge'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Menge"
          />
          <TextInput
            placeholder={defaultNote ? 'Notiz (Standard hinterlegt)' : 'Notiz'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Notiz"
          />
        </div>
        {selected && defaultNote && !note.trim() && (
          <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
            <span className="text-accent font-medium">Standard:</span> {defaultNote}
          </p>
        )}
        {selected && companionDefaults.length > 0 && (
          <p className="text-xs text-ink-muted leading-snug pl-1 line-clamp-2">
            <span className="text-accent font-medium">Automatisch dazu:</span>{' '}
            {companionDefaults
              .map((c) => (c.amount ? `${c.name} (${c.amount})` : c.name))
              .join(', ')}
          </p>
        )}
      </Card>

      {/* Substanz-Raster */}
      <div className="mt-5 flex items-center justify-between px-1 mb-2.5">
        <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
          {sortMode ? 'Reihenfolge ziehen' : 'Substanz wählen'}
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
          {substances.map((s) => (
            <SubstanceTile
              key={s.id}
              sub={s}
              selected={selectedId === s.id}
              missingDefault={missingDefaults.has(s.name.toLowerCase())}
              onSelect={() => {
                haptics.select();
                setSelectedId((id) => (id === s.id ? null : s.id));
                if (s.defaultDose && !amount) setAmount('');
              }}
              onInstant={() => submit(s, { instant: true })}
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
            {todayIntakes.slice(0, 6).map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="tabular text-sm font-semibold text-ink-muted w-11 shrink-0">
                  {formatTime(it.takenAt)}
                </span>
                <SubstanceSeal name={it.substanceName} color={substances.find((s) => s.id === it.substanceId)?.color} size="sm" />
                <span className="flex-1 min-w-0 text-sm text-ink truncate">{it.substanceName}</span>
                {it.amount && <span className="text-xs text-ink-muted shrink-0 tabular">{it.amount}</span>}
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* schwebende Bestätigung */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed inset-x-0 z-30 px-4 bottom-[calc(env(safe-area-inset-bottom)+4.6rem)]"
          >
            <div className="mx-auto max-w-app glass ring-1 ring-line shadow-float rounded-3xl p-2 pl-3 flex items-center gap-3">
              <SubstanceSeal name={selected.name} color={selected.color} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate flex items-center gap-1.5">
                  {selected.name}
                  {selected.isNightMed && <Moon size={13} className="text-accent" />}
                </p>
                <p className="text-xs text-ink-muted truncate tabular">
                  {(amount || selected.defaultDose || '—')} · {takenAt.slice(11, 16)} Uhr
                </p>
              </div>
              <Button
                size="lg"
                icon={<Check size={19} />}
                loading={create.isPending}
                onClick={() => submit(selected)}
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

function SubstanceTile({
  sub,
  selected,
  missingDefault,
  onSelect,
  onInstant,
}: {
  sub: Substance;
  selected: boolean;
  missingDefault?: boolean;
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
      title={missingDefault ? 'Kein DEFAULTS-Eintrag – in Einstellungen ergänzen' : undefined}
      className={cx(
        'press relative min-h-[5.5rem] rounded-3xl p-3 text-left ring-1 transition-all duration-150 overflow-hidden',
        selected ? 'ring-2 bg-surface shadow-raised' : 'ring-line bg-surface hover:bg-surface2',
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
      <SubstanceSeal name={sub.name} color={sub.color} />
      <p className="mt-2 font-medium text-[15px] text-ink leading-tight pr-3 flex items-center gap-1">
        <span className="truncate">{sub.name}</span>
        {sub.isNightMed && <Moon size={12} className="text-accent shrink-0" />}
      </p>
      {sub.defaultDose && <p className="text-xs text-ink-muted truncate">{sub.defaultDose}</p>}
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

/**
 * Sammel-Kachel "Morgendmedis"/"Nachtmedis": ein Tipp trägt alle
 * Plan-Substanzen des jeweiligen Slots zum gewählten Zeitpunkt ein. Bewusst
 * keine Auswahl/Bestätigungsleiste wie bei einer Substanz — es ist eine
 * Sofort-Aktion (Rückgängig per Toast).
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
