import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { LayoutGrid, FileText } from 'lucide-react';
import { cx } from '../../lib/cx';
import { haptics } from '../../lib/haptics';
import { useDefaults, useSaveDefaults, useSaveDefaultsSections } from '../../lib/queries';
import { useToast } from '../Toaster';
import type { DefaultsSection } from '../../lib/types';
import { StructuredView } from './StructuredView';
import { ErweitertView } from './ErweitertView';
import { AddSubstanceSheet } from './AddSubstanceSheet';
import { SaveBar } from './SaveBar';
import { sectionsFromRaw, sectionsEqual } from './state';

export interface DefaultsEditorHandle {
  /** Setzt einen Stub-Section-Namen aus dem Compliance-Bereich der
   *  Settings-Seite. Der Editor legt die Sektion nicht sofort an, sondern
   *  zeigt einen sichtbaren "Anlegen"-Chip, damit der Nutzer bestätigen
   *  kann, welcher Name verwendet werden soll. */
  prefillStubFromCompliance: (name: string) => void;
}

type Tab = 'structured' | 'raw';

interface DefaultsEditorProps {
  /** Optional: beim ersten Mount einen Stub-Namen aus dem Compliance-Log anbieten. */
  initialPrefillName?: string | null;
}

/**
 * Top-Level-Container des DEFAULTS.md-Editors. Hält den Draft-Zustand,
 * die Tab-Umschaltung „Strukturiert" ↔ „Erweitert (Markdown)" und die
 * Speicher-/Verwerfen-Logik.
 *
 * Zwei Modi:
 *  - Strukturiert: pro Substanz ein Formular (Menge/Notiz/Mit:/NACH-).
 *    Speichern über `useSaveDefaultsSections` (PUT /api/defaults/sections).
 *  - Erweitert: direkte Markdown-Bearbeitung. Speichern über
 *    `useSaveDefaults` (PUT /api/defaults mit rohem Text).
 *
 * Beim Wechsel von Strukturiert → Erweitert wird der Raw-Inhalt frisch
 * aus dem aktuellen Draft serialisiert (lokale Vorschau). Beim Wechsel
 * zurück wird der Raw-Inhalt auf den Snapshot zurückgesetzt; wurde
 * unterwegs editiert, fragt der Editor nach Bestätigung.
 *
 * Server validiert Strukturen (Doppelnamen, Selbst-Referenz, Längen).
 * Bei 400 zeigt der Editor einen Toast und behält den Draft.
 */
export const DefaultsEditor = forwardRef<DefaultsEditorHandle, DefaultsEditorProps>(function DefaultsEditor(
  { initialPrefillName = null },
  ref,
) {
  const toast = useToast();
  const { data: defaults, isLoading } = useDefaults();
  const saveStructured = useSaveDefaultsSections();
  const saveRaw = useSaveDefaults();
  const [tab, setTab] = useState<Tab>('structured');

  // Aus dem aktuell geladenen `raw` einmalig den strukturierten Draft
  // ableiten. Sobald die Datei serverseitig neu geladen wird (nach
  // Speichern), ersetzen wir den Draft durch das Resultat von
  // `sectionsFromRaw`, damit der Nutzer keinen Konflikt-Banner sieht.
  const initialStructured = useMemo(
    () => (defaults?.raw ? sectionsFromRaw(defaults.raw) : []),
    [defaults?.raw],
  );
  const [sections, setSections] = useState<DefaultsSection[]>(() => initialStructured);
  const [rawBuffer, setRawBuffer] = useState<string>(() => defaults?.raw ?? '');
  const [rawSnapshot, setRawSnapshot] = useState<string>(() => defaults?.raw ?? '');
  const prefilledNameRef = useRef<string | null>(initialPrefillName);

  // Sobald die Server-Daten aktualisiert werden (z. B. nach Save):
  // nur dann den Draft zurücksetzen, wenn die letzte Server-Antwort
  // mit unserem aktuellen Stand übereinstimmt — sonst hat der User
  // gerade editiert und wir wollen nicht trampeln.
  const lastSavedRef = useRef<DefaultsSection[] | null>(null);

  useEffect(() => {
    // Beim ersten erfolgreichen Laden den Draft setzen.
    if (defaults?.raw != null) {
      const fresh = sectionsFromRaw(defaults.raw);
      lastSavedRef.current = fresh;
      setSections(fresh);
      setRawBuffer(defaults.raw);
      setRawSnapshot(defaults.raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Imperative API: Compliance-Button auf der Settings-Seite kann einen
  // Stub-Namen vorlegen.
  useImperativeHandle(ref, () => ({
    prefillStubFromCompliance(name) {
      prefilledNameRef.current = name;
      setTab('structured');
      // Auf strukturiert umgeschaltet, Anwender klickt im Editor selbst auf "Anlegen".
    },
  }));

  // Dirty-Berechnung für den Footer (Save-Button).
  const structuredDirty = !sectionsEqual(sections, lastSavedRef.current ?? []);
  const rawDirty = rawBuffer !== rawSnapshot;
  const dirty = tab === 'structured' ? structuredDirty : rawDirty;

  // Beim Tab-Wechsel auf "raw": Raw aus dem aktuellen strukturierten Draft
  // erzeugen (lokale Vorschau-Serialisierung; Server ist die Wahrheit, aber
  // wir wollen, dass die Vorschau halbwegs passt, damit der Wechsel
  // nahtlos wirkt).
  const switchToRaw = () => {
    haptics.light();
    const serialized = approximateSerialize(sections);
    setRawBuffer(serialized);
    setRawSnapshot(serialized);
    setTab('raw');
  };

  const switchToStructured = () => {
    haptics.light();
    if (rawDirty && rawBuffer !== approximateSerialize(lastSavedRef.current ?? [])) {
      const ok = window.confirm(
        'Im Raw-Editor wurden Änderungen gemacht. Beim Zurückwechseln gehen diese Änderungen verloren. Fortfahren?',
      );
      if (!ok) return;
    }
    if (rawBuffer.trim()) {
      setSections(sectionsFromRaw(rawBuffer));
    }
    setTab('structured');
  };

  const save = async () => {
    try {
      if (tab === 'structured') {
        // Leere Sections (keinerlei Felder gesetzt) werden ohnehin
        // serverseitig verworfen — wir lassen sie aber drin, damit der
        // Client sie rendert und der Server sie „leise" entfernt.
        const sectionsToSave = sections
          .map((s) => ({ ...s, name: s.name.trim() }))
          .filter((s) => s.name.length > 0); // Drop namenlose Stubs
        await saveStructured.mutateAsync(sectionsToSave);
      } else {
        await saveRaw.mutateAsync(rawBuffer);
      }
      haptics.success();
      toast.show({ message: 'Standard-Notizen gespeichert' });
      // Nach Speichern den Draft mit Server-Antwort synchronisieren.
      const fresh = sectionsFromRaw(rawBuffer);
      lastSavedRef.current = fresh;
      setSections(fresh);
      setRawBuffer(rawBuffer);
      setRawSnapshot(rawBuffer);
      prefilledNameRef.current = null;
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: 'Speichern fehlgeschlagen', detail: (e as Error).message });
    }
  };

  const discard = () => {
    if (lastSavedRef.current) setSections(lastSavedRef.current);
    setRawBuffer(rawSnapshot);
    haptics.warning();
  };

  const openAddSubstance = () => {
    setAddOpen(true);
  };

  const onCreatedSubstance = (name: string) => {
    if (!sections.find((s) => s.name.trim() === name)) {
      setSections((prev) => [...prev, { name, amount: null, note: null, companions: [], preLines: [], postLines: [] }]);
    }
  };

  const [addOpen, setAddOpen] = useState(false);

  const sectionTabs: { id: Tab; label: string; Icon: typeof LayoutGrid }[] = [
    { id: 'structured', label: 'Strukturiert', Icon: LayoutGrid },
    { id: 'raw', label: 'Erweitert (Markdown)', Icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex rounded-2xl bg-surface2 p-1 self-start">
        {sectionTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => (t.id === 'raw' ? switchToRaw() : switchToStructured())}
            className={cx(
              'press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
            )}
          >
            <t.Icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'structured' ? (
        <StructuredView
          sections={sections}
          onChange={setSections}
          onOpenAddSubstance={openAddSubstance}
          prefilledName={prefilledNameRef.current}
          onPrefillConsumed={() => {
            prefilledNameRef.current = null;
          }}
        />
      ) : (
        <ErweitertView value={rawBuffer} onChange={setRawBuffer} parsedSections={sections} />
      )}

      <SaveBar
        dirty={dirty}
        saving={saveStructured.isPending || saveRaw.isPending}
        onSave={save}
        onDiscard={discard}
      />

      <AddSubstanceSheet open={addOpen} onClose={() => setAddOpen(false)} onCreated={onCreatedSubstance} />
    </div>
  );
});

/**
 * Sehr grobe Local-View-Serialisierung für die Raw-Tab-Vorschau. Der
 * Server ist die Wahrheit; dies hier dient nur dazu, dass der Wechsel
 * zur Raw-Ansicht halbwegs Sinn ergibt, ohne dass der Anwender
 * *zweimal* serialisiert.
 */
function approximateSerialize(sections: DefaultsSection[]): string {
  const out: string[] = [];
  for (const s of sections) {
    const trimmedName = s.name.trim();
    if (!trimmedName) continue;
    const lines: string[] = [];
    lines.push(`## ${trimmedName}`);
    if (s.preLines.length > 0) {
      lines.push('');
      for (const p of s.preLines) lines.push(p);
    }
    if (s.amount) {
      lines.push('');
      lines.push(`Menge: ${s.amount}`);
    }
    if (s.note) {
      lines.push('');
      const nl = s.note.split(/\r?\n/);
      lines.push(`Notiz: ${nl[0]}`);
      for (let i = 1; i < nl.length; i++) lines.push(nl[i]);
    }
    for (const c of s.companions) {
      if (!c.name.trim()) continue;
      lines.push('');
      const parts = [c.name.trim()];
      if (c.amount) parts.push(c.amount);
      if (c.note) parts.push(c.note);
      lines.push(`Mit: ${parts.join(' | ')}`);
    }
    if (s.postLines.length > 0) {
      lines.push('');
      for (const p of s.postLines) lines.push(p);
    }
    out.push(lines.join('\n'));
  }
  return out.join('\n\n') + (out.length > 0 ? '\n' : '');
}
