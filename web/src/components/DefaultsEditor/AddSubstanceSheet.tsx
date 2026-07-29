import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/inputs';
import { useToast } from '../Toaster';
import { haptics } from '../../lib/haptics';
import { useSubstances, useSubstanceMutations } from '../../lib/queries';
import { useT } from '../../lib/i18n';

interface AddSubstanceSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly created substance record so the editor can
   *  offer the substance as a tile right away. */
  onCreated: (name: string) => void;
}

/** Form sheet to create a new substance inline from the DEFAULTS editor. */
export function AddSubstanceSheet({ open, onClose, onCreated }: AddSubstanceSheetProps) {
  const toast = useToast();
  const t = useT();
  const { data: subs = [] } = useSubstances(false);
  const { create } = useSubstanceMutations();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('');

  const trimmed = name.trim();
  // The `'de'` locale tag below is a DATA INVARIANT — it gives umlaut-aware
  // `nameKey` semantics used for duplicate detection across the app. Do
  // not change.
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
      toast.show({ message: t('defaults.toast.substanceCreated'), detail: trimmed });
      onCreated(trimmed);
      setName('');
      setDose('');
      setUnit('');
      onClose();
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('defaults.toast.substanceCreateFailed'), detail: (e as Error).message });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('defaults.addSheet.title')} subtitle={t('defaults.addSheet.subtitle')}>
      <div className="space-y-3">
        <Field label={t('defaults.addSheet.fieldName')} hint={t('defaults.addSheet.fieldNameHint')}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('defaults.addSheet.fieldNamePlaceholder')}
            autoCapitalize="off"
            spellCheck={false}
          />
        </Field>
        {duplicates && (
          <p className="text-xs text-bad pl-1">{t('defaults.addSheet.duplicate')}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('defaults.addSheet.fieldDose')} hint={t('defaults.addSheet.fieldDoseHint')}>
            <TextInput
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder={t('defaults.addSheet.fieldDosePlaceholder')}
              inputMode="decimal"
              spellCheck={false}
            />
          </Field>
          <Field label={t('defaults.addSheet.fieldUnit')} hint={t('defaults.addSheet.fieldUnitHint')}>
            <TextInput
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={t('defaults.addSheet.fieldUnitPlaceholder')}
              spellCheck={false}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="md" icon={<X size={16} />} onClick={onClose}>
          {t('defaults.addSheet.cancel')}
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={submit}
          loading={create.isPending}
          disabled={!trimmed || !!duplicates}
        >
          {t('defaults.addSheet.create')}
        </Button>
      </div>
    </Sheet>
  );
}