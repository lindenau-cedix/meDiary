/**
 * German strings for the Settings screen, the SubstanceManager sheet and the
 * AdminWhatsappPanel. Shared keys for the same widget live here so the theme
 * and language switcher stay in sync.
 *
 * Substance names, localStorage keys, route paths and `nameKey()`/`doseKey()`
 * normalisation are data — never translated.
 */
export const settings = {
  // ── page header ──
  'settings.title': 'Einstellungen',

  // ── language switcher (per contract: language names stay in their own language) ──
  'settings.language.label': 'Sprache',
  'settings.language.german': 'Deutsch',
  'settings.language.english': 'English',

  // ── theme segmented control (System stays "System" in both locales) ──
  'settings.theme.label': 'Darstellung',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Hell',
  'settings.theme.dark': 'Dunkel',

  // ── substance management section ──
  'settings.substances.section': 'Substanzen',
  'settings.substances.manage': 'Substanzen verwalten',
  'settings.substances.manageSubtitle': 'Liste zum Antippen, Farben, Nachtmedikation',

  // ── WhatsApp section header (AdminWhatsappPanel) ──
  'settings.whatsapp.section': 'WhatsApp',
  'settings.whatsapp.title': 'WhatsApp-Verbindung',
  'settings.whatsapp.subtitle':
    'Pairing, Test-Versand und Empfänger für die nächtlichen Traum-Zustellungen.',
  'settings.whatsapp.state.connected': 'Verbunden',
  'settings.whatsapp.state.qr': 'Pairing erforderlich',
  'settings.whatsapp.state.connecting': 'Verbinde …',
  'settings.whatsapp.state.disconnected': 'Nicht verbunden',
  'settings.whatsapp.lastConnected': 'Zuletzt verbunden',
  'settings.whatsapp.connectedAs': 'Verbunden als',
  'settings.whatsapp.credentialsMissing':
    'Auf dem Server sind keine WhatsApp-Credentials konfiguriert. Reconnect ist wirkungslos, bis die',
  'settings.whatsapp.credentialsEnvHint': 'WHATSAPP_*',
  'settings.whatsapp.credentialsSuffix': '-Umgebungsvariablen gesetzt sind.',
  'settings.whatsapp.qrHeading': 'In 60 Sekunden scannen',
  'settings.whatsapp.qrAlt': 'WhatsApp QR-Code',
  'settings.whatsapp.qrPreparing': 'QR wird vorbereitet …',
  'settings.whatsapp.qrInstructions':
    'WhatsApp auf dem Telefon → Einstellungen → Verknüpfte Geräte → Gerät hinzufügen. QR-Code innerhalb von 60 Sekunden scannen — erneuert sich automatisch.',
  'settings.whatsapp.qrInstructions.settings': 'Einstellungen',
  'settings.whatsapp.qrInstructions.linked': 'Verknüpfte Geräte',
  'settings.whatsapp.qrInstructions.add': 'Gerät hinzufügen',
  'settings.whatsapp.reconnect': 'Neu verbinden',
  'settings.whatsapp.reconnectRequested': 'Reconnect angefordert',
  'settings.whatsapp.reconnectFailedPrefix': 'Reconnect fehlgeschlagen: ',
  'settings.whatsapp.testMessage': 'Testnachricht',
  'settings.whatsapp.testSentPrefix': 'Testnachricht gesendet an ',
  'settings.whatsapp.testSentFallbackRecipient': 'Empfänger',
  'settings.whatsapp.testFailed': 'Testnachricht fehlgeschlagen',
  'settings.whatsapp.testFailedDetail':
    'Server hat die Testnachricht quittiert, aber als nicht-ok markiert.',
  'settings.whatsapp.testErrorPrefix': 'Test fehlgeschlagen: ',
  'settings.whatsapp.recipients': 'Empfänger verwalten',
  'settings.whatsapp.noRecipients': 'Noch keine Empfänger angelegt.',
  'settings.whatsapp.toggleNotImplemented': 'Toggle noch nicht implementiert',
  'settings.whatsapp.toggleNotImplementedDetail': 'Empfänger direkt in der DB aktivieren/deaktivieren.',
  'settings.whatsapp.toggleNotImplementedTitle':
    'Toggle noch nicht implementiert — direkt in der DB ändern',
  'settings.whatsapp.recipientActiveAria': 'Empfänger {phone} aktiv',
  'settings.whatsapp.recipientAdded': 'Empfänger angelegt',
  'settings.whatsapp.recipientAddFailed': 'Empfänger konnte nicht angelegt werden',
  'settings.whatsapp.phonePlaceholder': '+4917…',
  'settings.whatsapp.displayNamePlaceholder': 'Anzeigename (optional)',
  'settings.whatsapp.add': 'Hinzufügen',
  'settings.whatsapp.phoneInvalid':
    'Phone braucht 8–15 Ziffern (mit oder ohne +).',
  'settings.whatsapp.phoneHintPrefix': 'E.164 mit oder ohne „+". Beispiel: ',
  'settings.whatsapp.statusLoading': 'WhatsApp-Status wird geladen …',

  // ── data console link ──
  'settings.console.section': 'Daten-Konsole',
  'settings.console.link': 'Chat mit deinen Daten',
  'settings.console.subtitle': 'Massen-Korrekturen in Worten — Vorschau & Bestätigung vor jeder Änderung',

  // ── import / export (XLSX) ──
  'settings.importExport.section': 'Import/Export',
  'settings.importExport.heading': 'Konsumvorgänge als XLSX',
  'settings.importExport.headingHint':
    'Medikationsplan und Plan-Verlauf bleiben unverändert.',
  'settings.importExport.warn':
    'Import ersetzt alle vorhandenen Einnahmen durch den Inhalt der Datei.',
  'settings.importExport.export': 'Exportieren',
  'settings.importExport.import': 'Importieren',
  'settings.importExport.exportDone': 'Export erstellt',
  'settings.importExport.exportDetail': 'XLSX-Datei mit Einnahmen',
  'settings.importExport.exportFailed': 'Export fehlgeschlagen',
  'settings.importExport.importConfirm':
    'Dieser Import löscht alle vorhandenen Einnahmen und ersetzt sie durch die XLSX-Datei. Fortfahren?',
  'settings.importExport.importDone': 'Import abgeschlossen',
  'settings.importExport.importDetail': '{imported} importiert, {replaced} ersetzt',
  'settings.importExport.importFailed': 'Import fehlgeschlagen',

  // ── server URL ──
  'settings.server.section': 'Server',
  'settings.server.heading': 'Adresse der meDiary-API',
  'settings.server.placeholder': 'https://mein-server:4000',
  'settings.server.hint':
    'Leer lassen, wenn Frontend und API von derselben Adresse ausgeliefert werden. In der Android-App hier die Adresse deines Servers eintragen.',
  'settings.server.saveAndTest': 'Speichern & testen',
  'settings.server.connected': 'verbunden',
  'settings.server.unreachable': 'nicht erreichbar',
  'settings.server.connectedToast': 'Server verbunden',
  'settings.server.noConnection': 'Keine Verbindung',
  'settings.server.noConnectionDetail': 'Adresse erreichbar?',

  // ── DEFAULTS compliance ──
  'settings.compliance.section': 'Prüfung: DEFAULTS.md',
  'settings.compliance.heading': 'Hat jede Substanz einen Eintrag in DEFAULTS.md?',
  'settings.compliance.refreshAria': 'Erneut prüfen',
  'settings.compliance.refreshTitle': 'Erneut prüfen',
  'settings.compliance.withEntry': '{count} mit Eintrag',
  'settings.compliance.withoutEntry': '{count} ohne Eintrag',
  'settings.compliance.allCovered': 'Alles abgedeckt',
  'settings.compliance.totalSubstances': '{count} unterschiedliche Substanzen',
  'settings.compliance.missingHeading': 'Ohne DEFAULTS-Eintrag',
  'settings.compliance.intakeCount': '{count} Einnahme',
  'settings.compliance.intakeCountMany': '{count} Einnahmen',
  'settings.compliance.noTile': 'noch keine Kachel',
  'settings.compliance.addEntry': 'Eintrag',
  'settings.compliance.loading': 'Lade Compliance-Bericht …',

  // ── DEFAULTS editor link ──
  'settings.defaults.section': 'Standard-Notizen (DEFAULTS.md)',
  'settings.defaults.link': 'Standard-Notizen bearbeiten',
  'settings.defaults.subtitle': 'Pro Substanz ein Formular (Menge, Notiz, Begleitstoffe) — oder direkt im Markdown',

  // ── about card ──
  'settings.about.section': 'Über',
  'settings.about.tagline': 'Medikations-Tagebuch · v1.0',

  // ── SubstanceManager sheet ──
  'settings.substances.title': 'Substanzen',
  'settings.substances.subtitle': 'Deine Liste zum Antippen',
  'settings.substances.editHeading': 'Substanz bearbeiten',
  'settings.substances.newHeading': 'Neue Substanz',
  'settings.substances.cancel': 'abbrechen',
  'settings.substances.namePlaceholder': 'Name, z. B. Quetiapin',
  'settings.substances.defaultDose': 'Standarddosis',
  'settings.substances.defaultDosePlaceholder': 'z. B. 150 mg',
  'settings.substances.unit': 'Einheit (optional)',
  'settings.substances.unitPlaceholder': 'mg, Tbl., IE …',
  'settings.substances.color': 'Farbe',
  'settings.substances.colorAria': 'Farbe {color}',
  'settings.substances.saveChanges': 'Änderungen speichern',
  'settings.substances.add': 'Substanz hinzufügen',
  'settings.substances.emptyList': 'Noch keine Substanzen — lege oben deine erste an.',
  'settings.substances.archivedHide': 'Archivierte verbergen',
  'settings.substances.archivedShow': 'Archivierte anzeigen ({count})',
  'settings.substances.restore': 'wiederherstellen',
  'settings.substances.editAria': 'Bearbeiten',
  'settings.substances.archiveAria': 'Archivieren',
  'settings.substances.updated': 'Substanz aktualisiert',
  'settings.substances.created': 'Substanz angelegt',
  'settings.substances.errorTitle': 'Fehler',
  'settings.substances.archived': 'Archiviert',
  'settings.substances.restored': 'Wiederhergestellt',
} as const;
