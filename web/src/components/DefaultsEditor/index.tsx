import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { LayoutGrid, FileText } from 'lucide-react';
import { cx } from '../../lib/cx';
import { haptics } from '../../lib/haptics';
import { useDefaults, useSaveDefaults, useSaveDefaultsSections } from '../../lib/queries';
import { useToast } from '../Toaster';
import { useT, type MessageKey } from '../../lib/i18n';
import type { DefaultsSection } from '../../lib/types';
import { StructuredView } from './StructuredView';
import { ErweitertView } from './ErweitertView';
import { AddSubstanceSheet } from './AddSubstanceSheet';
import { SaveBar } from './SaveBar';
import { sectionsFromRaw, sectionsEqual } from './state';

export interface DefaultsEditorHandle {
  /** Sets a stub section name from the compliance area of the Settings page.
   *  The editor does not create the section right away — it shows a visible
   *  "Create" chip so the user can confirm which name should be used. */
  prefillStubFromCompliance: (name: string) => void;
}

type Tab = 'structured' | 'raw';

interface DefaultsEditorProps {
  /** Optional: pre-fill a stub name from the compliance log on first mount. */
  initialPrefillName?: string | null;
}

/**
 * Top-level container for the DEFAULTS.md editor. Holds the draft state,
 * the tab switcher ("Structured" ↔ "Advanced (Markdown)") and the
 * save/discard logic.
 *
 * Two modes:
 *  - Structured: per-substance form (amount/note/companions/AFTER blocks).
 *    Save via `useSaveDefaultsSections` (PUT /api/defaults/sections).
 *  - Advanced: direct Markdown editing. Save via `useSaveDefaults`
 *    (PUT /api/defaults with raw text).
 *
 * When switching from Structured → Advanced, the raw buffer is regenerated
 * from the current draft (local preview). When switching back, the raw
 * buffer is reset to the snapshot; if it was edited meanwhile the editor
 * asks for confirmation.
 *
 * Server validates structures (duplicate names, self-reference, lengths).
 * On 400 the editor shows a toast and keeps the draft.
 */
export const DefaultsEditor = forwardRef<DefaultsEditorHandle, DefaultsEditorProps>(function DefaultsEditor(
  { initialPrefillName = null },
  ref,
) {
  const toast = useToast();
  const t = useT();
  const { data: defaults, isLoading } = useDefaults();
  const saveStructured = useSaveDefaultsSections();
  const saveRaw = useSaveDefaults();
  const [tab, setTab] = useState<Tab>('structured');

  // Derive the structured draft from the currently loaded `raw` exactly once.
  // When the server reloads the file (after a save), we replace the draft
  // with `sectionsFromRaw` so the user never sees a conflict banner.
  const initialStructured = useMemo(
    () => (defaults?.raw ? sectionsFromRaw(defaults.raw) : []),
    [defaults?.raw],
  );
  const [sections, setSections] = useState<DefaultsSection[]>(() => initialStructured);
  const [rawBuffer, setRawBuffer] = useState<string>(() => defaults?.raw ?? '');
  const [rawSnapshot, setRawSnapshot] = useState<string>(() => defaults?.raw ?? '');
  const prefilledNameRef = useRef<string | null>(initialPrefillName);

  // Whenever the server data changes (e.g. after a save), only reset the
  // draft if the last server response still matches what we currently have —
  // otherwise the user just edited something and we must not trample it.
  const lastSavedRef = useRef<DefaultsSection[] | null>(null);

  useEffect(() => {
    // Set the draft on the first successful load.
    if (defaults?.raw != null) {
      const fresh = sectionsFromRaw(defaults.raw);
      lastSavedRef.current = fresh;
      setSections(fresh);
      setRawBuffer(defaults.raw);
      setRawSnapshot(defaults.raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Imperative API: the compliance button on the Settings page can hand us a
  // stub name.
  useImperativeHandle(ref, () => ({
    prefillStubFromCompliance(name) {
      prefilledNameRef.current = name;
      setTab('structured');
      // We switched to structured; the user clicks "Create" inside the editor.
    },
  }));

  // Dirty computation for the footer Save button.
  const structuredDirty = !sectionsEqual(sections, lastSavedRef.current ?? []);
  const rawDirty = rawBuffer !== rawSnapshot;
  const dirty = tab === 'structured' ? structuredDirty : rawDirty;

  // When switching to the "raw" tab: regenerate the raw buffer from the
  // current structured draft (local preview serialization; the server is the
  // truth, but we want the preview to roughly match so the switch feels
  // seamless).
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
      const ok = window.confirm(t('defaults.confirm.discardRawChanges'));
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
        // Empty sections (no fields set) are dropped server-side anyway —
        // we keep them here so the client can render them and the server can
        // silently remove them.
        const sectionsToSave = sections
          .map((s) => ({ ...s, name: s.name.trim() }))
          .filter((s) => s.name.length > 0); // Drop nameless stubs
        await saveStructured.mutateAsync(sectionsToSave);
      } else {
        await saveRaw.mutateAsync(rawBuffer);
      }
      haptics.success();
      toast.show({ message: t('defaults.toast.saved') });
      // After saving, sync the draft with the server's view of the buffer.
      const fresh = sectionsFromRaw(rawBuffer);
      lastSavedRef.current = fresh;
      setSections(fresh);
      setRawBuffer(rawBuffer);
      setRawSnapshot(rawBuffer);
      prefilledNameRef.current = null;
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('defaults.toast.saveFailed'), detail: (e as Error).message });
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

  const sectionTabs: { id: Tab; labelKey: MessageKey; Icon: typeof LayoutGrid }[] = [
    { id: 'structured', labelKey: 'defaults.tab.structured', Icon: LayoutGrid },
    { id: 'raw', labelKey: 'defaults.tab.raw', Icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex rounded-2xl bg-surface2 p-1 self-start">
        {sectionTabs.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            onClick={() => (tabDef.id === 'raw' ? switchToRaw() : switchToStructured())}
            className={cx(
              'press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
              tab === tabDef.id ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
            )}
          >
            <tabDef.Icon size={15} />
            {t(tabDef.labelKey)}
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
 * Coarse local-view serialization for the raw-tab preview. The server is
 * the truth; this just exists so the switch to raw mode looks sensible
 * without the user having to serialize twice.
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
      // NOTE: `Mit:` stays a parser token — translate UI, not the Markdown.
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