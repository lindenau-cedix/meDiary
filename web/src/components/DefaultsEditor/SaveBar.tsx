import { Check, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useT } from '../../lib/i18n';

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/** Sticky footer in the editor: discard on the left (only when dirty), save
 *  on the right (with a loading spinner while the mutate runs). The
 *  container positions it so it stays visible at the bottom of the screen
 *  even while the list scrolls. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: SaveBarProps) {
  const t = useT();
  return (
    <footer className="sticky bottom-0 left-0 right-0 mt-4 -mx-4 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 bg-bg/95 backdrop-blur border-t border-hairline">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="md"
          icon={<X size={16} />}
          onClick={onDiscard}
          disabled={!dirty || saving}
        >
          {t('defaults.saveBar.discard')}
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Check size={18} />}
          onClick={onSave}
          loading={saving}
          disabled={!dirty || saving}
        >
          {t('defaults.saveBar.save')}
        </Button>
      </div>
    </footer>
  );
}