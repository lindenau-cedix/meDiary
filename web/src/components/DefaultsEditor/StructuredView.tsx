import { useMemo } from 'react';
import { Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/feedback';
import { SubstanceSection } from './SubstanceSection';
import { haptics } from '../../lib/haptics';
import { nameKey } from '../../lib/names';
import { useCompliance } from '../../lib/queries';
import { useT } from '../../lib/i18n';
import type { DefaultsSection } from '../../lib/types';
import type { ComplianceReport } from '../../lib/types';

interface StructuredViewProps {
  sections: DefaultsSection[];
  onChange: (next: DefaultsSection[]) => void;
  onOpenAddSubstance: () => void;
  /** Substance to be back-filled from the compliance area. */
  prefilledName?: string | null;
  onPrefillConsumed?: () => void;
}

export function StructuredView({
  sections,
  onChange,
  onOpenAddSubstance,
  prefilledName,
  onPrefillConsumed,
}: StructuredViewProps) {
  const t = useT();
  const { data: compliance } = useCompliance();
  const compliantKeys = useMemo(() => new Set((compliance?.compliant ?? []).map((c) => nameKey(c.name))), [compliance]);
  const missingNames = useMemo(
    () => new Set((compliance?.missing ?? []).map((c) => nameKey(c.name))),
    [compliance],
  );

  const updateSection = (idx: number, next: DefaultsSection) => {
    const arr = sections.slice();
    arr[idx] = next;
    onChange(arr);
  };
  const removeSection = (idx: number) => onChange(sections.filter((_, i) => i !== idx));
  const addEmpty = () => {
    onChange([...sections, emptySection()]);
    haptics.light();
  };

  // Offer compliance-prefilled substances that aren't already in the draft.
  const missingSuggestions: { name: string; intakeCount: number }[] = useMemo(() => {
    if (!compliance) return [];
    const haveKeys = new Set(sections.map((s) => nameKey(s.name)));
    return compliance.missing
      .filter((c) => !haveKeys.has(nameKey(c.name)))
      .slice(0, 6)
      .map((c) => ({ name: c.name, intakeCount: c.intakeCount }));
  }, [compliance, sections]);

  const applyMissing = (name: string) => {
    onChange([...sections, emptySection(name)]);
    haptics.light();
  };

  return (
    <div className="space-y-3">
      <ComplianceSummary compliance={compliance} />

      {sections.length === 0 && (
        <Card className="p-6 text-center space-y-3">
          <p className="text-ink-muted">{t('defaults.empty.title')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" size="md" icon={<Plus size={16} />} onClick={addEmpty}>
              {t('defaults.empty.addBlank')}
            </Button>
            <Button variant="soft" size="md" onClick={onOpenAddSubstance}>
              {t('defaults.empty.addWithTile')}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {sections.map((section, idx) => {
          const k = nameKey(section.name);
          return (
            <SubstanceSection
              key={k}
              section={section}
              complianceKey={k}
              isMissing={!!section.name.trim() && !compliantKeys.has(k) && missingNames.has(k)}
              onChange={(next) => updateSection(idx, next)}
              onRemove={() => removeSection(idx)}
            />
          );
        })}
      </div>

      {prefilledName && (
        <div className="rounded-3xl ring-1 ring-primary/40 bg-primary-soft px-4 py-3 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg shrink-0">
            <ShieldAlert size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">{t('defaults.prefill.title', { name: prefilledName })}</p>
            <p className="text-xs text-ink-muted">
              {t('defaults.prefill.detail')}
            </p>
          </div>
          <Button variant="soft" size="sm" onClick={() => applyMissing(prefilledName)}>
            {t('defaults.prefill.create')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onPrefillConsumed ?? (() => {})}>
            {t('defaults.prefill.discard')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button variant="primary" size="md" icon={<Plus size={16} />} onClick={addEmpty}>
          {t('defaults.action.addSection')}
        </Button>
        <Button variant="soft" size="md" onClick={onOpenAddSubstance}>
          {t('defaults.action.addWithTile')}
        </Button>
      </div>

      {missingSuggestions.length > 0 && (
        <div className="rounded-3xl ring-1 ring-line bg-surface p-4 space-y-2 mt-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <ShieldCheck size={14} />
            <span className="font-semibold uppercase tracking-wide">{t('defaults.compliance.eyebrow')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {missingSuggestions.map((m) => (
              <Button
                key={m.name}
                variant="soft"
                size="sm"
                onClick={() => applyMissing(m.name)}
              >
                + {m.name}
                <span className="ml-1 text-[10px] text-ink-faint">{t('defaults.compliance.suggestionCount', { count: m.intakeCount })}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function emptySection(name = ''): DefaultsSection {
  return { name, amount: null, note: null, companions: [], preLines: [], postLines: [] };
}

function ComplianceSummary({ compliance }: { compliance: ComplianceReport | undefined }) {
  const t = useT();
  if (!compliance) {
    return (
      <Card className="p-4 text-xs text-ink-faint">{t('defaults.compliance.summaryLoading')}</Card>
    );
  }
  const compliantCount = compliance.compliant.length;
  const missingCount = compliance.missing.length;
  return (
    <Card className="p-4 flex items-center gap-3 text-xs">
      <span className="grid size-9 place-items-center rounded-xl bg-surface2 text-primary">
        <ShieldCheck size={16} />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="good">{t('defaults.compliance.withEntry', { count: compliantCount })}</Badge>
        {missingCount > 0 ? (
          <Badge tone="warn">{t('defaults.compliance.withoutEntry', { count: missingCount })}</Badge>
        ) : (
          <Badge tone="good">{t('defaults.compliance.fullyCovered')}</Badge>
        )}
        <span className="text-ink-faint">{t('defaults.compliance.totalSubstances', { count: compliance.total })}</span>
      </div>
    </Card>
  );
}