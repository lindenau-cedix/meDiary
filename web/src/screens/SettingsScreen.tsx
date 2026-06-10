import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, Monitor, Server, FlaskConical, Pill, FileText, Check, Loader2, Github } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextInput, TextArea } from '../components/ui/inputs';
import { SectionLabel } from '../components/ui/feedback';
import { SubstanceManager } from '../components/SubstanceManager';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { useTheme, type ThemePref } from '../lib/theme';
import { getApiBase, setApiBase, api } from '../lib/api';
import { useDefaults, useSaveDefaults } from '../lib/queries';

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

  const { data: defaults } = useDefaults();
  const saveDefaults = useSaveDefaults();
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
              placeholder={'## Substanzname\nMenge: 0,4–0,5 g\nNotiz: Hinweistext …'}
            />
            <p className="text-xs text-ink-faint leading-relaxed">
              Pro Substanz eine Überschrift <code className="text-ink-muted">## Substanzname</code>, darunter optional{' '}
              <code className="text-ink-muted">Menge:</code> und <code className="text-ink-muted">Notiz:</code>. Wird beim
              Eintragen übernommen, wenn Menge bzw. Notiz nicht selbst angegeben wurden. Wird bei jedem Eintrag frisch gelesen.
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
