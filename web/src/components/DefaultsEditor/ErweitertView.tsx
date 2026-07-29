import { TextArea } from '../ui/inputs';
import { useT } from '../../lib/i18n';
import type { DefaultsSection } from '../../lib/types';

interface ErweitertViewProps {
  /** Live-edit buffer in raw mode. */
  value: string;
  onChange: (next: string) => void;
  /** Preview parsing: what the sections currently in the buffer would become
   *  after the next save. Read-only. */
  parsedSections: DefaultsSection[];
}

/**
 * Raw Markdown editor. Deliberately plain, no syntax highlighter — keeps
 * the bundle dependency-free and mirrors the in-page textarea that
 * SettingsScreen used before this editor existed. It is offered in
 * addition to the structured editor so AFTER:/reservation blocks can be
 * maintained losslessly.
 *
 * The placeholder text uses the German parser tokens (`## Substanzname`,
 * `Menge:`, `Notiz:`, `Mit:`) — these are part of the Markdown grammar the
 * server parses, NOT UI copy.
 */
export function ErweitertView({ value, onChange, parsedSections }: ErweitertViewProps) {
  const t = useT();
  return (
    <div className="space-y-3">
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="font-mono text-[13px] leading-relaxed"
        placeholder={t('defaults.raw.placeholder')}
      />

      <div className="rounded-3xl bg-surface ring-1 ring-line p-4 space-y-2">
        <p className="text-sm font-medium text-ink">{t('defaults.raw.parsedHeading')}</p>
        {parsedSections.length === 0 ? (
          <p className="text-xs text-ink-faint">{t('defaults.raw.parsedEmpty')}</p>
        ) : (
          <ul className="text-xs text-ink-muted space-y-1 font-mono">
            {parsedSections.map((s, idx) => (
              <li key={idx}>
                ## {s.name}
                {s.amount && <span className="text-good">{t('defaults.raw.parsedWithAmount', { value: s.amount })}</span>}
                {s.note && <span className="text-accent">{t('defaults.raw.parsedWithNote')}</span>}
                {s.companions.length > 0 && (
                  <span className="text-primary">
                    {s.companions.length === 1
                      ? t('defaults.raw.parsedWithCompanions.one')
                      : t('defaults.raw.parsedWithCompanions.many', { count: s.companions.length })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-faint leading-relaxed">
        {t('defaults.raw.helpText')}
      </p>
    </div>
  );
}