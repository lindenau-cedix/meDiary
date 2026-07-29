/**
 * English counterpart of `../../de/screens/settings.ts`. Same keys, same
 * `{placeholder}` shapes — the `Messages` annotation in `../../de/index.ts`
 * enforces structural parity, so a missing or misspelled key is a compile
 * error, not a silent German fallback.
 *
 * Substance names, localStorage keys, route paths and `nameKey()`/`doseKey()`
 * normalisation are data — never translated.
 */
export const settings = {
  // ── page header ──
  'settings.title': 'Settings',

  // ── language switcher (per contract: language names stay in their own language) ──
  'settings.language.label': 'Language',
  'settings.language.german': 'Deutsch',
  'settings.language.english': 'English',

  // ── theme segmented control (System stays "System" in both locales) ──
  'settings.theme.label': 'Appearance',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',

  // ── substance management section ──
  'settings.substances.section': 'Substances',
  'settings.substances.manage': 'Manage substances',
  'settings.substances.manageSubtitle': 'Tap-list, colours, night medication',

  // ── WhatsApp section header (AdminWhatsappPanel) ──
  'settings.whatsapp.section': 'WhatsApp',
  'settings.whatsapp.title': 'WhatsApp connection',
  'settings.whatsapp.subtitle':
    'Pairing, test delivery and recipients for the nightly dream deliveries.',
  'settings.whatsapp.state.connected': 'Connected',
  'settings.whatsapp.state.qr': 'Pairing required',
  'settings.whatsapp.state.connecting': 'Connecting…',
  'settings.whatsapp.state.disconnected': 'Not connected',
  'settings.whatsapp.lastConnected': 'Last connected',
  'settings.whatsapp.connectedAs': 'Connected as',
  'settings.whatsapp.credentialsMissing':
    'No WhatsApp credentials are configured on the server. Reconnect is a no-op until the',
  'settings.whatsapp.credentialsEnvHint': 'WHATSAPP_*',
  'settings.whatsapp.credentialsSuffix': 'environment variables are set.',
  'settings.whatsapp.qrHeading': 'Scan within 60 seconds',
  'settings.whatsapp.qrAlt': 'WhatsApp QR code',
  'settings.whatsapp.qrPreparing': 'Preparing QR…',
  'settings.whatsapp.qrInstructions':
    'WhatsApp on the phone → Settings → Linked devices → Add device. Scan the QR within 60 seconds — it refreshes automatically.',
  'settings.whatsapp.qrInstructions.settings': 'Settings',
  'settings.whatsapp.qrInstructions.linked': 'Linked devices',
  'settings.whatsapp.qrInstructions.add': 'Add device',
  'settings.whatsapp.reconnect': 'Reconnect',
  'settings.whatsapp.reconnectRequested': 'Reconnect requested',
  'settings.whatsapp.reconnectFailedPrefix': 'Reconnect failed: ',
  'settings.whatsapp.testMessage': 'Test message',
  'settings.whatsapp.testSentPrefix': 'Test message sent to ',
  'settings.whatsapp.testSentFallbackRecipient': 'recipient',
  'settings.whatsapp.testFailed': 'Test message failed',
  'settings.whatsapp.testFailedDetail': 'Server acknowledged the test message but flagged it as not-ok.',
  'settings.whatsapp.testErrorPrefix': 'Test failed: ',
  'settings.whatsapp.recipients': 'Manage recipients',
  'settings.whatsapp.noRecipients': 'No recipients yet.',
  'settings.whatsapp.toggleNotImplemented': 'Toggle not implemented yet',
  'settings.whatsapp.toggleNotImplementedDetail': 'Enable or disable recipients directly in the DB.',
  'settings.whatsapp.toggleNotImplementedTitle': 'Toggle not implemented yet — change directly in the DB',
  'settings.whatsapp.recipientActiveAria': 'Recipient {phone} active',
  'settings.whatsapp.recipientAdded': 'Recipient added',
  'settings.whatsapp.recipientAddFailed': 'Could not add recipient',
  'settings.whatsapp.phonePlaceholder': '+4917…',
  'settings.whatsapp.displayNamePlaceholder': 'Display name (optional)',
  'settings.whatsapp.add': 'Add',
  'settings.whatsapp.phoneInvalid': 'Phone needs 8–15 digits (with or without +).',
  'settings.whatsapp.phoneHintPrefix': 'E.164 with or without “+”. Example: ',
  'settings.whatsapp.statusLoading': 'Loading WhatsApp status…',

  // ── data console link ──
  'settings.console.section': 'Data console',
  'settings.console.link': 'Chat with your data',
  'settings.console.subtitle': 'Bulk corrections in words — preview & confirm before any change',

  // ── import / export (XLSX) ──
  'settings.importExport.section': 'Import/Export',
  'settings.importExport.heading': 'Intakes as XLSX',
  'settings.importExport.headingHint': 'Medication plan and plan history remain unchanged.',
  'settings.importExport.warn': 'Import replaces all existing intakes with the contents of the file.',
  'settings.importExport.export': 'Export',
  'settings.importExport.import': 'Import',
  'settings.importExport.exportDone': 'Export created',
  'settings.importExport.exportDetail': 'XLSX file with intakes',
  'settings.importExport.exportFailed': 'Export failed',
  'settings.importExport.importConfirm':
    'This import deletes all existing intakes and replaces them with the XLSX file. Continue?',
  'settings.importExport.importDone': 'Import complete',
  'settings.importExport.importDetail': '{imported} imported, {replaced} replaced',
  'settings.importExport.importFailed': 'Import failed',

  // ── server URL ──
  'settings.server.section': 'Server',
  'settings.server.heading': 'meDiary API address',
  'settings.server.placeholder': 'https://my-server:4000',
  'settings.server.hint':
    'Leave empty when the frontend and API are served from the same address. In the Android app, enter your server address here.',
  'settings.server.saveAndTest': 'Save & test',
  'settings.server.connected': 'connected',
  'settings.server.unreachable': 'unreachable',
  'settings.server.connectedToast': 'Server connected',
  'settings.server.noConnection': 'No connection',
  'settings.server.noConnectionDetail': 'Address reachable?',

  // ── DEFAULTS compliance ──
  'settings.compliance.section': 'Check: DEFAULTS.md',
  'settings.compliance.heading': 'Does every substance have an entry in DEFAULTS.md?',
  'settings.compliance.refreshAria': 'Check again',
  'settings.compliance.refreshTitle': 'Check again',
  'settings.compliance.withEntry': '{count} with entry',
  'settings.compliance.withoutEntry': '{count} without entry',
  'settings.compliance.allCovered': 'All covered',
  'settings.compliance.totalSubstances': '{count} distinct substances',
  'settings.compliance.missingHeading': 'Without DEFAULTS entry',
  'settings.compliance.intakeCount': '{count} intake',
  'settings.compliance.intakeCountMany': '{count} intakes',
  'settings.compliance.noTile': 'no tile yet',
  'settings.compliance.addEntry': 'Entry',
  'settings.compliance.loading': 'Loading compliance report…',

  // ── DEFAULTS editor link ──
  'settings.defaults.section': 'Default notes (DEFAULTS.md)',
  'settings.defaults.link': 'Edit default notes',
  'settings.defaults.subtitle': 'A form per substance (amount, note, companions) — or directly in markdown',

  // ── about card ──
  'settings.about.section': 'About',
  'settings.about.tagline': 'Medication diary · v1.0',

  // ── SubstanceManager sheet ──
  'settings.substances.title': 'Substances',
  'settings.substances.subtitle': 'Your tap-list',
  'settings.substances.editHeading': 'Edit substance',
  'settings.substances.newHeading': 'New substance',
  'settings.substances.cancel': 'cancel',
  'settings.substances.namePlaceholder': 'Name, e.g. Quetiapine',
  'settings.substances.defaultDose': 'Default dose',
  'settings.substances.defaultDosePlaceholder': 'e.g. 150 mg',
  'settings.substances.unit': 'Unit (optional)',
  'settings.substances.unitPlaceholder': 'mg, tab, IU…',
  'settings.substances.color': 'Colour',
  'settings.substances.colorAria': 'Colour {color}',
  'settings.substances.saveChanges': 'Save changes',
  'settings.substances.add': 'Add substance',
  'settings.substances.emptyList': 'No substances yet — add your first one above.',
  'settings.substances.archivedHide': 'Hide archived',
  'settings.substances.archivedShow': 'Show archived ({count})',
  'settings.substances.restore': 'restore',
  'settings.substances.editAria': 'Edit',
  'settings.substances.archiveAria': 'Archive',
  'settings.substances.updated': 'Substance updated',
  'settings.substances.created': 'Substance added',
  'settings.substances.errorTitle': 'Error',
  'settings.substances.archived': 'Archived',
  'settings.substances.restored': 'Restored',
} as const;
