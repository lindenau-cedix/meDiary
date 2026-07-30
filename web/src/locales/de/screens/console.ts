/**
 * German strings for the Daten-Konsole (chat-with-your-data) screen.
 *
 * Key prefix: `console.*`. Reuses generic keys from `common.ts`
 * (`action.save` / `action.undo` / `action.cancel`) where they fit.
 */
export const console_ = {
  // ── page header ──
  'console.title': 'Konsole',
  'console.eyebrow': 'Daten-Konsole',
  'console.historyAria': 'Verlauf der Änderungen',
  'console.settingsAria': 'Einstellungen',

  // ── status banners ──
  'console.offline.title': 'Server nicht erreichbar',
  'console.offline.detail': 'Adresse in den Einstellungen prüfen.',
  'console.unconfigured.title': 'Konsole nicht konfiguriert',
  'console.unconfigured.detail':
    'Setze CHAT_API_KEY (oder MINIMAX_API_KEY) in der .env, um die Daten-Konsole zu aktivieren. Lesen & Anzeigen funktionieren auch ohne Schlüssel.',

  // ── composer ──
  'console.placeholder': 'Frage stellen oder Korrektur beschreiben …',
  'console.sendAria': 'Senden',
  'console.stopAria': 'Stoppen',
  'console.composerHint': '⏎ senden · ⇧⏎ neue Zeile · Vorschau vor jeder Änderung',

  // ── transcript ──
  'console.thinking': 'überlegt …',
  'console.tool.schema': 'Schema',
  'console.tool.query': 'Abfrage',
  'console.tool.proposal': 'Vorschlag',

  // ── empty state ──
  'console.empty.eyebrow': 'Beispiele',
  'console.empty.description':
    'Untersuche deine Daten oder beschreibe eine Korrektur in eigenen Worten. Änderungen werden dir als Vorschau gezeigt — nichts wird ohne deine Bestätigung geschrieben.',
  'console.empty.example.1':
    'Führe „Magnesiumcitrat" und „Magnesium" zu einer Substanz zusammen und behalte alle Einnahmen.',
  'console.empty.example.2':
    'Ich habe vergessen, Vitamin D einzutragen — trag es an jedem Werktag der letzten zwei Wochen um 09:00 nach.',
  'console.empty.example.3': 'Lösche alle Einnahmen vor dem 01.01.2026.',
  'console.empty.example.4':
    'Meine Einnahmen von der Reise sind wegen der Zeitzone einen Tag zu spät — verschiebe alle mit Notiz „Tokio" um 24 Stunden zurück.',
  'console.empty.example.5':
    'Welche Substanzen habe ich seit über einem Monat nicht mehr eingetragen?',

  // ── change-set card ──
  'console.changeSet.affected.one': '{count} Zeile betroffen',
  'console.changeSet.affected.many': '{count} Zeilen betroffen',
  'console.changeSet.operations': '{count} Operationen',
  'console.changeSet.confirmLarge': 'Wirklich {count} Zeilen ändern?',
  'console.changeSet.status.proposed': 'Vorschlag',
  'console.changeSet.status.applied': 'Angewandt',
  'console.changeSet.status.undone': 'Rückgängig',
  'console.changeSet.status.discarded': 'Verworfen',
  'console.changeSet.applied': 'Angewandt',
  'console.changeSet.undoOnlyLatest': 'nur jüngste Änderung umkehrbar',

  // ── toasts ──
  'console.toast.applied': 'Änderung angewandt',
  'console.toast.appliedDetail.one': '{count} Zeile geändert',
  'console.toast.appliedDetail.many': '{count} Zeilen geändert',
  'console.toast.applyFailed': 'Anwenden fehlgeschlagen',
  'console.toast.undone': 'Rückgängig gemacht',
  'console.toast.undoFailed': 'Undo fehlgeschlagen',
  'console.toast.discardFailed': 'Verwerfen fehlgeschlagen',

  // ── audit log ──
  'console.audit.title': 'Änderungs-Verlauf',
  'console.audit.subtitle': 'Audit-Log der Konsole',
  'console.audit.empty': 'Noch keine Änderungen.',
  'console.audit.rows.one': '{count} Zeile',
  'console.audit.rows.many': '{count} Zeilen',
  'console.audit.reversible': 'umkehrbar',

  // ── diff table ──
  'console.diff.empty': 'Keine betroffenen Zeilen.',
  'console.diff.truncated': '… nur {shown} von {total} Zeilen gezeigt',
  'console.diff.field.substance': 'Substanz',
  'console.diff.field.takenAt': 'Zeit',
  'console.diff.field.amount': 'Menge',
  'console.diff.field.notes': 'Notiz',
  'console.diff.field.name': 'Name',
  'console.diff.field.archived': 'Archiviert',
  'console.diff.field.isNightMed': 'Nachtmed',
} as const;