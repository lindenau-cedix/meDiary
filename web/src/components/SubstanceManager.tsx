import { useState } from 'react';
import { Plus, Trash2, Moon, Pencil, RotateCcw, Check, X } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { Field, TextInput, Switch } from './ui/inputs';
import { SubstanceSeal } from './SubstanceSeal';
import { useToast } from './Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { useSubstances, useSubstanceMutations } from '../lib/queries';
import type { Substance } from '../lib/types';

const SWATCHES = ['#5B8DB8', '#8E6BB0', '#D98E48', '#7EA46B', '#C9A14A', '#9C5C8A', '#5FA8A0', '#B5727A', '#6E8C6A', '#C2705A'];

interface FormState {
  id: number | null;
  name: string;
  defaultDose: string;
  unit: string;
  color: string;
  isNightMed: boolean;
}
const empty: FormState = { id: null, name: '', defaultDose: '', unit: '', color: SWATCHES[3], isNightMed: false };

export function SubstanceManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const { data: subs = [] } = useSubstances(true);
  const { create, update, remove } = useSubstanceMutations();
  const [form, setForm] = useState<FormState>(empty);

  const active = subs.filter((s) => !s.archived);
  const archived = subs.filter((s) => s.archived);
  const editing = form.id != null;

  const edit = (s: Substance) => {
    haptics.light();
    setForm({
      id: s.id,
      name: s.name,
      defaultDose: s.defaultDose ?? '',
      unit: s.unit ?? '',
      color: s.color ?? SWATCHES[3],
      isNightMed: s.isNightMed,
    });
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    const body = {
      name: form.name.trim(),
      defaultDose: form.defaultDose.trim() || null,
      unit: form.unit.trim() || null,
      color: form.color,
      isNightMed: form.isNightMed,
    };
    try {
      if (editing) await update.mutateAsync({ id: form.id!, body });
      else await create.mutateAsync(body);
      haptics.success();
      toast.show({ message: editing ? 'Substanz aktualisiert' : 'Substanz angelegt', detail: body.name });
      setForm(empty);
    } catch (e) {
      toast.show({ tone: 'warning', message: 'Fehler', detail: (e as Error).message });
    }
  };

  const archive = async (s: Substance) => {
    await remove.mutateAsync({ id: s.id });
    haptics.medium();
    toast.show({ message: 'Archiviert', detail: s.name });
    if (form.id === s.id) setForm(empty);
  };
  const restore = async (s: Substance) => {
    await update.mutateAsync({ id: s.id, body: { archived: false } });
    toast.show({ message: 'Wiederhergestellt', detail: s.name });
  };

  return (
    <Sheet open={open} onClose={onClose} size="lg" title="Substanzen" subtitle="Deine Liste zum Antippen">
      {/* Editor */}
      <div className="rounded-3xl bg-surface2/70 ring-1 ring-line p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-sans text-sm font-semibold text-ink-muted">
            {editing ? 'Substanz bearbeiten' : 'Neue Substanz'}
          </p>
          {editing && (
            <button onClick={() => setForm(empty)} className="press text-xs text-ink-faint inline-flex items-center gap-1">
              <X size={13} /> abbrechen
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <SubstanceSeal name={form.name || '?'} color={form.color} size="lg" />
          <div className="flex-1">
            <TextInput
              placeholder="Name, z. B. Quetiapin"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Standarddosis">
            <TextInput
              placeholder="z. B. 150 mg"
              value={form.defaultDose}
              onChange={(e) => setForm({ ...form, defaultDose: e.target.value })}
            />
          </Field>
          <Field label="Einheit (optional)">
            <TextInput
              placeholder="mg, Tbl., IE …"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </Field>
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink-muted pl-1 mb-2">Farbe</p>
          <div className="flex flex-wrap gap-2.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  haptics.select();
                  setForm({ ...form, color: c });
                }}
                className={cx(
                  'size-8 rounded-full press transition-transform',
                  form.color === c && 'ring-2 ring-offset-2 ring-offset-surface ring-ink/40 scale-110',
                )}
                style={{ backgroundColor: c }}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
          <span className="flex items-center gap-2.5">
            <Moon size={18} className="text-accent" />
            <span className="text-sm">
              <span className="font-medium text-ink">Nachtmedikation</span>
              <span className="block text-xs text-ink-muted">Löst nach Einnahme das Tagesbild aus</span>
            </span>
          </span>
          <Switch checked={form.isNightMed} onChange={(v) => setForm({ ...form, isNightMed: v })} />
        </label>

        <Button
          block
          size="lg"
          icon={editing ? <Check size={18} /> : <Plus size={18} />}
          loading={create.isPending || update.isPending}
          onClick={submit}
          disabled={!form.name.trim()}
        >
          {editing ? 'Änderungen speichern' : 'Substanz hinzufügen'}
        </Button>
      </div>

      {/* Liste */}
      <div className="mt-5 space-y-1.5">
        {active.map((s) => (
          <div
            key={s.id}
            className={cx(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-colors',
              form.id === s.id ? 'ring-primary/50 bg-primary-soft/40' : 'ring-transparent hover:bg-surface2',
            )}
          >
            <SubstanceSeal name={s.name} color={s.color} />
            <button className="flex-1 min-w-0 text-left" onClick={() => edit(s)}>
              <p className="font-medium text-ink truncate flex items-center gap-1.5">
                {s.name}
                {s.isNightMed && <Moon size={13} className="text-accent shrink-0" />}
              </p>
              {s.defaultDose && <p className="text-xs text-ink-muted">{s.defaultDose}</p>}
            </button>
            <button onClick={() => edit(s)} className="press grid place-items-center size-9 rounded-xl text-ink-faint hover:bg-surface2" aria-label="Bearbeiten">
              <Pencil size={16} />
            </button>
            <button onClick={() => archive(s)} className="press grid place-items-center size-9 rounded-xl text-ink-faint hover:bg-bad/10 hover:text-bad" aria-label="Archivieren">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {active.length === 0 && (
          <p className="text-center text-sm text-ink-muted py-6">Noch keine Substanzen — lege oben deine erste an.</p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-ink-faint hover:text-ink-muted"
          >
            {showArchived ? 'Archivierte verbergen' : `Archivierte anzeigen (${archived.length})`}
          </button>
          {showArchived && (
            <div className="mt-2 space-y-1.5">
              {archived.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 opacity-70">
                  <SubstanceSeal name={s.name} color={s.color} size="sm" />
                  <span className="flex-1 text-sm text-ink-muted truncate">{s.name}</span>
                  <button onClick={() => restore(s)} className="press inline-flex items-center gap-1 text-xs text-primary">
                    <RotateCcw size={13} /> wiederherstellen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
