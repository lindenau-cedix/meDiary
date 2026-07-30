import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sun,
  Moon,
  Monitor,
  Server,
  FlaskConical,
  Pill,
  FileText,
  Check,
  Loader2,
  Github,
  AlertCircle,
  Plus,
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  SquareTerminal,
  ChevronRight,
  Languages,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextInput } from '../components/ui/inputs';
import { SectionLabel, Badge } from '../components/ui/feedback';
import { SubstanceManager } from '../components/SubstanceManager';
import { AdminWhatsappPanel } from '../components/AdminWhatsappPanel';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { useTheme, type ThemePref } from '../lib/theme';
import { getApiBase, setApiBase, api } from '../lib/api';
import { useCompliance, useImportIntakes } from '../lib/queries';
import { useI18n, useT, type Locale } from '../lib/i18n';

const THEME_OPTIONS: { value: ThemePref; labelKey: 'settings.theme.system' | 'settings.theme.light' | 'settings.theme.dark'; Icon: typeof Sun }[] = [
  { value: 'system', labelKey: 'settings.theme.system', Icon: Monitor },
  { value: 'light', labelKey: 'settings.theme.light', Icon: Sun },
  { value: 'dark', labelKey: 'settings.theme.dark', Icon: Moon },
];

const LANGUAGE_OPTIONS: { value: Locale; labelKey: 'settings.language.german' | 'settings.language.english' }[] = [
  { value: 'de', labelKey: 'settings.language.german' },
  { value: 'en', labelKey: 'settings.language.english' },
];

export function SettingsScreen() {
  const { pref, setPref } = useTheme();
  const { locale, setLocale } = useI18n();
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [testing, setTesting] = useState<'idle' | 'ok' | 'fail' | 'loading'>('idle');
  const [manageOpen, setManageOpen] = useState(false);
  const [exportingIntakes, setExportingIntakes] = useState(false);
  const intakeImportRef = useRef<HTMLInputElement>(null);

  const importIntakes = useImportIntakes();
  const { data: compliance, isFetching: complianceLoading, refetch: refetchCompliance } = useCompliance();

  const saveServer = async () => {
    setApiBase(serverUrl.trim());
    setTesting('loading');
    try {
      await api.health();
      setTesting('ok');
      qc.invalidateQueries();
      haptics.success();
      toast.show({ message: t('settings.server.connectedToast') });
    } catch {
      setTesting('fail');
      haptics.warning();
      toast.show({ tone: 'warning', message: t('settings.server.noConnection'), detail: t('settings.server.noConnectionDetail') });
    }
  };

  const exportIntakes = async () => {
    setExportingIntakes(true);
    try {
      const blob = await api.intakes.exportXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meDiary-intakes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      haptics.success();
      toast.show({ message: t('settings.importExport.exportDone'), detail: t('settings.importExport.exportDetail') });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('settings.importExport.exportFailed'), detail: (e as Error).message });
    } finally {
      setExportingIntakes(false);
    }
  };

  const importIntakeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const confirmed = window.confirm(t('settings.importExport.importConfirm'));
    if (!confirmed) return;

    try {
      const result = await importIntakes.mutateAsync(file);
      haptics.success();
      toast.show({
        message: t('settings.importExport.importDone'),
        detail: t('settings.importExport.importDetail', { imported: result.imported, replaced: result.replaced }),
      });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('settings.importExport.importFailed'), detail: (e as Error).message });
    }
  };

  /** Forward to the new editor and seed the structured editor with the
   *  substance name via a "create" chip. */
  const goAddMissing = (name: string) => {
    haptics.light();
    navigate(`/standardnotizen?prefill=${encodeURIComponent(name)}`);
  };

  const missing = compliance?.missing ?? [];

  return (
    <>
      <PageHeader title={t('settings.title')} />

      <div className="space-y-7">
        {/* Appearance */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.theme.label')}</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, labelKey, Icon }) => (
              <button
                key={value}
                onClick={() => {
                  haptics.select();
                  setPref(value);
                }}
                className={cx(
                  'press flex flex-col items-center gap-1.5 rounded-2xl py-3.5 ring-1 transition-colors',
                  pref === value ? 'bg-primary-soft ring-primary/40 text-primary' : 'bg-surface ring-line text-ink-muted',
                )}
              >
                <Icon size={20} />
                <span className="text-[13px] font-medium">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Language */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.language.label')}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGE_OPTIONS.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => {
                  haptics.select();
                  setLocale(value);
                }}
                className={cx(
                  'press flex items-center justify-center gap-1.5 rounded-2xl py-3.5 ring-1 transition-colors',
                  locale === value ? 'bg-primary-soft ring-primary/40 text-primary' : 'bg-surface ring-line text-ink-muted',
                )}
              >
                <Languages size={18} />
                <span className="text-[13px] font-medium">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Substances */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.substances.section')}</SectionLabel>
          <Card className="overflow-hidden">
            <button
              onClick={() => setManageOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface2 transition-colors text-left"
            >
              <span className="grid place-items-center size-9 rounded-xl bg-surface2 text-primary">
                <Pill size={18} />
              </span>
              <span className="flex-1">
                <span className="block font-medium text-ink">{t('settings.substances.manage')}</span>
                <span className="block text-xs text-ink-muted">{t('settings.substances.manageSubtitle')}</span>
              </span>
            </button>
          </Card>
        </section>

        {/* WhatsApp (Admin) — gated; renders nothing when adminEnabled=false */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.whatsapp.section')}</SectionLabel>
          <AdminWhatsappPanel />
        </section>

        {/* Data console */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.console.section')}</SectionLabel>
          <Card className="overflow-hidden">
            <Link
              to="/konsole"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface2"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-surface2 text-primary">
                <SquareTerminal size={18} />
              </span>
              <span className="flex-1">
                <span className="block font-medium text-ink">{t('settings.console.link')}</span>
                <span className="block text-xs text-ink-muted">{t('settings.console.subtitle')}</span>
              </span>
              <ChevronRight size={18} className="text-ink-faint" />
            </Link>
          </Card>
        </section>

        {/* Import/Export */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.importExport.section')}</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <FileSpreadsheet size={18} />
              <div className="min-w-0">
                <p className="text-sm">{t('settings.importExport.heading')}</p>
                <p className="text-xs text-ink-faint">{t('settings.importExport.headingHint')}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-warn/10 px-3 py-2.5 text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{t('settings.importExport.warn')}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="soft"
                icon={<Download size={17} />}
                onClick={exportIntakes}
                loading={exportingIntakes}
              >
                {t('settings.importExport.export')}
              </Button>
              <Button
                variant="danger"
                icon={<Upload size={17} />}
                onClick={() => intakeImportRef.current?.click()}
                loading={importIntakes.isPending}
              >
                {t('settings.importExport.import')}
              </Button>
            </div>
            <input
              ref={intakeImportRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={importIntakeFile}
            />
          </Card>
        </section>

        {/* Server */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.server.section')}</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <Server size={18} />
              <p className="text-sm">{t('settings.server.heading')}</p>
            </div>
            <TextInput
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setTesting('idle');
              }}
              placeholder={t('settings.server.placeholder')}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-ink-faint leading-relaxed">{t('settings.server.hint')}</p>
            <div className="flex items-center gap-3">
              <Button
                variant="soft"
                icon={
                  testing === 'loading' ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : testing === 'ok' ? (
                    <Check size={17} className="text-good" />
                  ) : (
                    <FlaskConical size={17} />
                  )
                }
                onClick={saveServer}
              >
                {t('settings.server.saveAndTest')}
              </Button>
              {testing === 'ok' && <span className="text-sm text-good">{t('settings.server.connected')}</span>}
              {testing === 'fail' && <span className="text-sm text-bad">{t('settings.server.unreachable')}</span>}
            </div>
          </Card>
        </section>

        {/* DEFAULTS compliance */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.compliance.section')}</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <ShieldCheck size={18} />
              <p className="text-sm">{t('settings.compliance.heading')}</p>
              <div className="flex-1" />
              <button
                onClick={() => refetchCompliance()}
                className="press grid place-items-center size-8 rounded-xl text-ink-faint hover:text-ink-muted hover:bg-surface2"
                aria-label={t('settings.compliance.refreshAria')}
                title={t('settings.compliance.refreshTitle')}
              >
                <RefreshCw size={15} className={complianceLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {compliance ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="good">{t('settings.compliance.withEntry', { count: compliance.compliant.length })}</Badge>
                  {missing.length > 0 ? (
                    <Badge tone="warn">{t('settings.compliance.withoutEntry', { count: missing.length })}</Badge>
                  ) : (
                    <Badge tone="good">{t('settings.compliance.allCovered')}</Badge>
                  )}
                  <span className="text-ink-faint">· {t('settings.compliance.totalSubstances', { count: compliance.total })}</span>
                </div>

                {missing.length > 0 && (
                  <div className="rounded-2xl ring-1 ring-line overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-ink-muted bg-surface2/60">
                      {t('settings.compliance.missingHeading')}
                    </p>
                    <ul className="divide-y divide-hairline">
                      {missing.map((m) => (
                        <li key={m.name} className="flex items-center gap-3 px-3 py-2.5">
                          <AlertCircle size={16} className="text-warn shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{m.name}</p>
                            <p className="text-xs text-ink-faint">
                              {m.intakeCount === 1
                                ? t('settings.compliance.intakeCount', { count: m.intakeCount })
                                : t('settings.compliance.intakeCountMany', { count: m.intakeCount })}
                              {m.inSubstances ? '' : ` · ${t('settings.compliance.noTile')}`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="soft"
                            icon={<Plus size={14} />}
                            onClick={() => goAddMissing(m.name)}
                          >
                            {t('settings.compliance.addEntry')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-faint">{t('settings.compliance.loading')}</p>
            )}
          </Card>
        </section>

        {/* DEFAULTS.md */}
        <section>
          <SectionLabel className="px-1 mb-2.5">{t('settings.defaults.section')}</SectionLabel>
          <Card className="overflow-hidden">
            <Link
              to="/standardnotizen"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface2"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-surface2 text-primary">
                <FileText size={18} />
              </span>
              <span className="flex-1">
                <span className="block font-medium text-ink">{t('settings.defaults.link')}</span>
                <span className="block text-xs text-ink-muted">{t('settings.defaults.subtitle')}</span>
              </span>
              <ChevronRight size={18} className="text-ink-faint" />
            </Link>
          </Card>
        </section>

        {/* About */}
        <section className="pb-4">
          <SectionLabel className="px-1 mb-2.5">{t('settings.about.section')}</SectionLabel>
          <Card className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-2xl bg-primary text-primary-fg font-display text-lg">
              m
            </span>
            <div className="flex-1">
              <p className="font-medium text-ink">meDiary</p>
              <p className="text-xs text-ink-muted">{t('settings.about.tagline')}</p>
            </div>
            <Github size={18} className="text-ink-faint" />
          </Card>
        </section>
      </div>

      <SubstanceManager open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}
