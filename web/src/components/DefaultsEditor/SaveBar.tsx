import { Check, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/** Sticky-Footer im Editor: Verwerfen links (nur wenn dirty), Speichern
 *  rechts (mit Lade-Spinner während des Mutates). Wird vom Container so
 *  positioniert, dass er auch in der Listen-Scroll-Position am unteren
 *  Bildschirmrand sichtbar bleibt. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: SaveBarProps) {
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
          Verwerfen
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Check size={18} />}
          onClick={onSave}
          loading={saving}
          disabled={!dirty || saving}
        >
          Speichern
        </Button>
      </div>
    </footer>
  );
}
