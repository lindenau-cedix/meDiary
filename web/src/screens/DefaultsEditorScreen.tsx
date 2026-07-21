import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { DefaultsEditor } from '../components/DefaultsEditor';

export function DefaultsEditorScreen() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialName = params.get('prefill');

  return (
    <div className="space-y-5 pb-12">
      <div>
        <Link
          to="/einstellungen"
          className="press inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <ChevronLeft size={14} />
          Zurück zu Einstellungen
        </Link>
      </div>

      <PageHeader
        eyebrow="Wird automatisch als Notiz/Menge übernommen"
        title="Standard-Notizen"
      />

      <DefaultsEditor initialPrefillName={initialName} />
    </div>
  );
}
