import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings2, Plus, Check, Clock3, Moon, ChevronRight, WifiOff } from 'lucide-react';
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
import { greeting, nowLocalInput, todayStr, formatFull, formatTime } from '../lib/format';
import { useSubstances, useIntakes, useIntakeMutations, useDefaults } from '../lib/queries';
import { ApiError } from '../lib/api';
import type { Substance } from '../lib/types';

export function QuickEntryScreen() {
  const toast = useToast();
  const { data: substances = [], error } = useSubstances();
  const { data: defaults } = useDefaults();
  const today = todayStr();
  const { data: todayIntakes = [] } = useIntakes({ from: today, limit: 50 });
  const { create, remove } = useIntakeMutations();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [takenAt, setTakenAt] = useState(nowLocalInput());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [assessment, setAssessment] = useState<{ open: boolean; date: string }>({ open: false, date: today });

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

  const resetComposer = () => {
    setSelectedId(null);
    setAmount('');
    setNote('');
    setTakenAt(nowLocalInput());
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
      toast.show({
        message: `${sub.name} eingetragen`,
        detail: [created.amount, formatTime(created.takenAt)].filter(Boolean).join(' · '),
        action: {
          label: 'Rückgängig',
          onClick: () => remove.mutate(created.id),
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
      </Card>

      {/* Substanz-Raster */}
      <div className="mt-5 flex items-center justify-between px-1 mb-2.5">
        <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
          Substanz wählen
        </p>
        <button
          onClick={() => setManageOpen(true)}
          className="press text-[13px] font-medium text-primary inline-flex items-center gap-1"
        >
          Verwalten
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {substances.map((s) => (
          <SubstanceTile
            key={s.id}
            sub={s}
            selected={selectedId === s.id}
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
  onSelect,
  onInstant,
}: {
  sub: Substance;
  selected: boolean;
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
