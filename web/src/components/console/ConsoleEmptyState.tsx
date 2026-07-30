import { ChevronRight } from 'lucide-react';
import { useT } from '../../lib/i18n';

/**
 * Real empty state with concrete example commands (medication-specific) —
 * deliberately NOT a generic "how can I help?" Tap fills the composer.
 *
 * Example prompts are kept here as keys (`console.empty.example.*`) because
 * they describe *what kind* of correction the user can ask for. The model
 * itself does not see these strings; they only seed the input box.
 */
const EXAMPLE_KEYS = [
  'console.empty.example.1',
  'console.empty.example.2',
  'console.empty.example.3',
  'console.empty.example.4',
  'console.empty.example.5',
] as const;

export function ConsoleEmptyState({ onPick }: { onPick: (text: string) => void }) {
  const t = useT();
  return (
    <div className="py-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-faint">{t('console.empty.eyebrow')}</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
        {t('console.empty.description')}
      </p>

      <ul className="mt-4 space-y-1.5">
        {EXAMPLE_KEYS.map((key) => {
          const text = t(key);
          return (
            <li key={key}>
              <button
                onClick={() => onPick(text)}
                className="group flex w-full items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-left ring-1 ring-line transition-colors hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span className="mt-0.5 font-mono text-primary/70" aria-hidden>
                  ›
                </span>
                <span className="flex-1 text-[13px] leading-snug text-ink">{text}</span>
                <ChevronRight
                  size={15}
                  className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}