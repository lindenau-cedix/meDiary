import { useRef, useState, type ChangeEvent } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextInput, TextArea } from '../components/ui/inputs';
import { SectionLabel, Badge } from '../components/ui/feedback';
import { SubstanceManager } from '../components/SubstanceManager';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { useTheme, type ThemePref } from '../lib/theme';
import { getApiBase, setApiBase, api } from '../lib/api';
import { useDefaults, useSaveDefaults, useCompliance, useImportIntakes } from '../lib/queries';

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Hell', Icon: Sun },
  { value: 'dark', label: 'Dunkel', Icon: Moon },
];

export function SettingsScreen() {
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();

  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [testing, setTesting] = useState<'idle' | 'ok' | 'fail' | 'loading'>('idle');
  const [manageOpen, setManageOpen] = useState(false);
  const [exportingIntakes, setExportingIntakes] = useState(false);
  const intakeImportRef = useRef<HTMLInputElement>(null);

  const { data: defaults } = useDefaults();
  const saveDefaults = useSaveDefaults();
  const importIntakes = useImportIntakes();
  const { data: compliance, isFetching: complianceLoading, refetch: refetchCompliance } = useCompliance();
  const [defaultsText, setDefaultsText] = useState<string | null>(null);
  const defaultsValue = defaultsText ?? defaults?.raw ?? '';

  const saveServer = async () => {
    setApiBase(serverUrl.trim());
    setTesting('loading');
    try {
      await api.health();
      setTesting('ok');
      qc.invalidateQueries();
      haptics.success();
      toast.show({ message: 'Server verbunden' });
    } catch {
      setTesting('fail');
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Keine Verbindung', detail: 'Adresse erreichbar?' });
    }
  };

  const onSaveDefaults = async () => {
    await saveDefaults.mutateAsync(defaultsValue);
    setDefaultsText(null);
    haptics.success();
    toast.show({ message: 'Standard-Notizen gespeichert' });
  };

  const exportIntakes = async () => {
    setExportingIntakes(true);
    try {
      const blob = await api.intakes.exportXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meDiary-konsumvorgaenge-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      haptics.success();
      toast.show({ message: 'Export erstellt', detail: 'XLSX-Datei mit Einnahmen' });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Export fehlgeschlagen', detail: (e as Error).message });
    } finally {
      setExportingIntakes(false);
    }
  };

  const importIntakeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const confirmed = window.confirm(
      'Dieser Import löscht alle vorhandenen Einnahmen und ersetzt sie durch die XLSX-Datei. Fortfahren?',
    );
    if (!confirmed) return;

    try {
      const result = await importIntakes.mutateAsync(file);
      haptics.success();
      toast.show({
        message: 'Import abgeschlossen',
        detail: `${result.imported} importiert, ${result.replaced} ersetzt`,
      });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Import fehlgeschlagen', detail: (e as Error).message });
    }
  };

  /**
   * Fügt einen neuen DEFAULTS-Abschnitt für eine Substanz ein, die bisher
   * keinen Eintrag hatte. Schnell-Pflege, damit der Compliance-Bericht
   * nicht ständig rot leuchtet.
   */
  const addMissingDefault = (name: string) => {
    const heading = `## ${name}`;
    const block = `\n${heading}\nNotiz: \n`;
    // Wenn am Ende kein Newline steht, einen setzen.
    const base = defaultsValue.endsWith('\n') || defaultsValue === '' ? defaultsValue : `${defaultsValue}\n`;
    const next = `${base}${block}`;
    setDefaultsText(next);
    haptics.light();
    // Scrollt den Editor ins Sichtfeld, damit der User direkt weiter pflegen kann.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Standard-Notizen (Markdown)"], textarea[placeholder*="## Substanzname"]');
      el?.focus();
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const missing = compliance?.missing ?? [];

  return (
    <>
      <PageHeader title="Einstellungen" />

      <div className="space-y-7">
        {/* Darstellung */}
        <section>
          <SectionLabel className="px-1 mb-2.5">Darstellung</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
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
                <span className="text-[13px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Substanzen */}
        <section>
          <SectionLabel className="px-1 mb-2.5">Substanzen</SectionLabel>
          <Card className="overflow-hidden">
            <button
              onClick={() => setManageOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface2 transition-colors text-left"
            >
              <span className="grid place-items-center size-9 rounded-xl bg-surface2 text-primary">
                <Pill size={18} />
              </span>
              <span className="flex-1">
                <span className="block font-medium text-ink">Substanzen verwalten</span>
                <span className="block text-xs text-ink-muted">Liste zum Antippen, Farben, Nachtmedikation</span>
              </span>
            </button>
          </Card>
        </section>

        {/* Import/Export */}
        <section>
          <SectionLabel className="px-1 mb-2.5">Import/Export</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <FileSpreadsheet size={18} />
              <div className="min-w-0">
                <p className="text-sm">Konsumvorgänge als XLSX</p>
                <p className="text-xs text-ink-faint">
                  Medikationsplan und Plan-Verlauf bleiben unverändert.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-warn/10 px-3 py-2.5 text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">
                Import ersetzt alle vorhandenen Einnahmen durch den Inhalt der Datei.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="soft"
                icon={<Download size={17} />}
                onClick={exportIntakes}
                loading={exportingIntakes}
              >
                Exportieren
              </Button>
              <Button
                variant="danger"
                icon={<Upload size={17} />}
                onClick={() => intakeImportRef.current?.click()}
                loading={importIntakes.isPending}
              >
                Importieren
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
          <SectionLabel className="px-1 mb-2.5">Server</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <Server size={18} />
              <p className="text-sm">Adresse der meDiary-API</p>
            </div>
            <TextInput
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setTesting('idle');
              }}
              placeholder="https://mein-server:4000"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-ink-faint leading-relaxed">
              Leer lassen, wenn Frontend und API von derselben Adresse ausgeliefert werden. In der Android-App hier die
              Adresse deines Servers eintragen.
            </p>
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
                Speichern & testen
              </Button>
              {testing === 'ok' && <span className="text-sm text-good">verbunden</span>}
              {testing === 'fail' && <span className="text-sm text-bad">nicht erreichbar</span>}
            </div>
          </Card>
        </section>

        {/* DEFAULTS-Compliance */}
        <section>
          <SectionLabel className="px-1 mb-2.5">Prüfung: DEFAULTS.md</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <ShieldCheck size={18} />
              <p className="text-sm">Hat jede Substanz einen Eintrag in DEFAULTS.md?</p>
              <div className="flex-1" />
              <button
                onClick={() => refetchCompliance()}
                className="press grid place-items-center size-8 rounded-xl text-ink-faint hover:text-ink-muted hover:bg-surface2"
                aria-label="Erneut prüfen"
                title="Erneut prüfen"
              >
                <RefreshCw size={15} className={complianceLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {compliance ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="good">{compliance.compliant.length} mit Eintrag</Badge>
                  {missing.length > 0 ? (
                    <Badge tone="warn">{missing.length} ohne Eintrag</Badge>
                  ) : (
                    <Badge tone="good">Alles abgedeckt</Badge>
                  )}
                  <span className="text-ink-faint">· {compliance.total} unterschiedliche Substanzen</span>
                </div>

                {missing.length > 0 && (
                  <div className="rounded-2xl ring-1 ring-line overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-ink-muted bg-surface2/60">
                      Ohne DEFAULTS-Eintrag
                    </p>
                    <ul className="divide-y divide-hairline">
                      {missing.map((m) => (
                        <li key={m.name} className="flex items-center gap-3 px-3 py-2.5">
                          <AlertCircle size={16} className="text-warn shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{m.name}</p>
                            <p className="text-xs text-ink-faint">
                              {m.intakeCount} Einnahme{m.intakeCount === 1 ? '' : 'n'}
                              {m.inSubstances ? '' : ' · noch keine Kachel'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="soft"
                            icon={<Plus size={14} />}
                            onClick={() => addMissingDefault(m.name)}
                          >
                            Eintrag
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-faint">Lade Compliance-Bericht …</p>
            )}
          </Card>
        </section>

        {/* DEFAULTS.md */}
        <section>
          <SectionLabel className="px-1 mb-2.5">Standard-Notizen (DEFAULTS.md)</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-ink-muted">
              <FileText size={18} />
              <p className="text-sm">Wird automatisch als Notiz übernommen</p>
            </div>
            <TextArea
              value={defaultsValue}
              onChange={(e) => setDefaultsText(e.target.value)}
              rows={9}
              spellCheck={false}
              className="font-mono text-[13px] leading-relaxed"
              placeholder={'## Substanzname\nMenge: 0,4–0,5 g\nNotiz: Hinweistext …\nMit: Begleitsubstanz | Menge | Notiz'}
            />
            <p className="text-xs text-ink-faint leading-relaxed">
              Pro Substanz eine Überschrift <code className="text-ink-muted">## Substanzname</code>, darunter optional{' '}
              <code className="text-ink-muted">Menge:</code>, <code className="text-ink-muted">Notiz:</code> und{' '}
              <code className="text-ink-muted">Mit:</code>. Menge/Notiz werden beim Eintragen übernommen, wenn sie nicht
              selbst angegeben wurden. <code className="text-ink-muted">Mit: Name | Menge | Notiz</code> trägt die genannte
              Begleitsubstanz automatisch als eigene Einnahme mit ein (Menge/Notiz optional — sonst gelten deren eigene
              Standards). Wird bei jedem Eintrag frisch gelesen.
            </p>
            <Button
              icon={<Check size={18} />}
              onClick={onSaveDefaults}
              loading={saveDefaults.isPending}
              disabled={defaultsText === null}
            >
              Speichern
            </Button>
          </Card>
        </section>

        {/* Über */}
        <section className="pb-4">
          <SectionLabel className="px-1 mb-2.5">Über</SectionLabel>
          <Card className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-2xl bg-primary text-primary-fg font-display text-lg">
              m
            </span>
            <div className="flex-1">
              <p className="font-medium text-ink">meDiary</p>
              <p className="text-xs text-ink-muted">Medikations-Tagebuch · v1.0</p>
            </div>
            <Github size={18} className="text-ink-faint" />
          </Card>
        </section>
      </div>

      <SubstanceManager open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}
