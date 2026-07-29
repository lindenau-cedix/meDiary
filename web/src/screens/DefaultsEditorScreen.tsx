import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { DefaultsEditor } from '../components/DefaultsEditor';
import { useT } from '../lib/i18n';

export function DefaultsEditorScreen() {
  const t = useT();
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
          {t('defaults.back')}
        </Link>
      </div>

      <PageHeader
        eyebrow={t('defaults.eyebrow')}
        title={t('defaults.title')}
      />

      <DefaultsEditor initialPrefillName={initialName} />
    </div>
  );
}