import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/inputs';
import { useToast } from '../Toaster';
import { haptics } from '../../lib/haptics';
import { useSubstances, useSubstanceMutations } from '../../lib/queries';

interface AddSubstanceSheetProps {
  open: boolean;
  onClose: () => void;
  /** Wird mit dem frisch angelegt Substance-Datensatz aufgerufen, damit
   *  der Editor die Substanz gleich als Substanz-Tile anbieten kann. */
  onCreated: (name: string) => void;
}

/** Form-Sheet zum Anlegen einer neuen Substanz inline im DEFAULTS-Editor. */
export function AddSubstanceSheet({ open, onClose, onCreated }: AddSubstanceSheetProps) {
  const toast = useToast();
  const { data: subs = [] } = useSubstances(false);
  const { create } = useSubstanceMutations();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('');

  const trimmed = name.trim();
  const duplicates = trimmed && subs.some((s) => s.name.toLocaleLowerCase('de') === trimmed.toLocaleLowerCase('de'));

  const submit = async () => {
    if (!trimmed || duplicates) return;
    try {
      const body = {
        name: trimmed,
        defaultDose: dose.trim() || null,
        unit: unit.trim() || null,
      };
      await create.mutateAsync(body);
      haptics.success();
      toast.show({ message: 'Substanz angelegt', detail: trimmed });
      onCreated(trimmed);
      setName('');
      setDose('');
      setUnit('');
      onClose();
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Substanz konnte nicht angelegt werden', detail: (e as Error).message });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="md" title="Neue Substanz" subtitle="Wird als QuickPick-Kachel verfügbar">
      <div className="space-y-3">
        <Field label="Name" hint="Wird zum Tippen in der Einnahme-Auswahl angezeigt.">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Modafinil"
            autoCapitalize="off"
            spellCheck={false}
          />
        </Field>
        {duplicates && (
          <p className="text-xs text-bad pl-1">Eine Substanz mit diesem Namen existiert bereits.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Standard-Dosis" hint="Optional">
            <TextInput
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="z. B. 100"
              inputMode="decimal"
              spellCheck={false}
            />
          </Field>
          <Field label="Einheit" hint="Optional">
            <TextInput
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="z. B. mg"
              spellCheck={false}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="md" icon={<X size={16} />} onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={submit}
          loading={create.isPending}
          disabled={!trimmed || !!duplicates}
        >
          Anlegen
        </Button>
      </div>
    </Sheet>
  );
}
