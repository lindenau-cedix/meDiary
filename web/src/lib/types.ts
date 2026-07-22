export interface Substance {
  id: number;
  name: string;
  defaultDose: string | null;
  unit: string | null;
  color: string | null;
  isNightMed: boolean;
  sortOrder: number;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface Intake {
  id: number;
  substanceId: number | null;
  substanceName: string;
  takenAt: string;
  date: string;
  amount: string | null;
  notes: string | null;
  createdAt: string;
}

/** Automatisch miterfasste Begleit-Einnahme (DEFAULTS.md `Mit:`). */
export interface IntakeCompanion {
  intake: Intake;
  createdSubstance: boolean;
}

export interface IntakeCreateResult {
  intake: Intake;
  nightMed: boolean;
  assessmentDate: string | null;
  assessmentExists: boolean;
  createdSubstance?: boolean;
  companions?: IntakeCompanion[];
}

export interface IntakeImportResult {
  imported: number;
  replaced: number;
  createdSubstances: number;
}

/** Tages-Slot des Medikationsplans (Morgens/Mittags/Abends/Nachts). */
export type PlanSlot = 'morning' | 'noon' | 'evening' | 'night';

/** Eine vom Sammel-Eintrag ("Morgendmedis"/"Nachtmedis") erzeugte Einnahme. */
export interface PlanBatchEntry {
  intake: Intake;
  createdSubstance: boolean;
}

/** Antwort von POST /api/intakes/plan-batch — alle Einnahmen eines Slots. */
export interface PlanBatchResult {
  slot: PlanSlot;
  count: number;
  entries: PlanBatchEntry[];
  nightMed: boolean;
  assessmentDate: string | null;
  assessmentExists: boolean;
}

/** Ein Eintrag im Sammel-Request POST /api/intakes/batch. */
export interface IntakeBatchEntryInput {
  substanceId?: number | null;
  substanceName?: string;
  amount?: string | null;
  notes?: string | null;
}

/** Eine erzeugte Einnahme (samt Begleitsubstanzen) aus POST /api/intakes/batch. */
export interface IntakeBatchEntry {
  intake: Intake;
  createdSubstance: boolean;
  companions: IntakeCompanion[];
}

/** Antwort von POST /api/intakes/batch — mehrere Substanzen zum selben Zeitpunkt. */
export interface IntakeBatchResult {
  count: number;
  entries: IntakeBatchEntry[];
  nightMed: boolean;
  assessmentDate: string | null;
  assessmentExists: boolean;
}

export interface PlanItem {
  id?: number;
  substanceId: number | null;
  substanceName: string;
  strength: string | null;
  morning: string | null;
  noon: string | null;
  evening: string | null;
  night: string | null;
  unit: string | null;
  reason: string | null;
  notes: string | null;
  sortOrder?: number;
}

export interface UpcomingPlanVersion {
  versionId: number;
  effectiveFrom: string;
  note: string | null;
  itemCount: number;
}

export interface Plan {
  versionId: number | null;
  createdAt: string | null;
  /** Wirkungszeitpunkt ("gültig ab", YYYY-MM-DD oder YYYY-MM-DDTHH:mm) der Version. */
  effectiveFrom: string | null;
  note: string | null;
  items: PlanItem[];
  /** Nur bei GET /api/plan: Versionen mit Wirkungsdatum in der Zukunft. */
  upcoming?: UpcomingPlanVersion[];
}

export interface PlanVersionSummary {
  versionId: number;
  createdAt: string;
  effectiveFrom: string;
  /** = effectiveFrom (Wirkungsdatum, für Anzeige/Snapshots). */
  date: string;
  note: string | null;
  itemCount: number;
  active: boolean;
  upcoming: boolean;
  /** Nur bei GET /api/plan/versions?withItems=1 — die Items dieser Version.
   *  Der Verlauf misst damit jede Einnahme gegen die zu ihrem Zeitpunkt
   *  wirksame Plan-Version. */
  items?: PlanItem[];
}

export interface PlanDiff {
  from: { versionId: number | null; createdAt: string | null; date: string | null };
  to: { versionId: number | null; createdAt: string | null; date: string | null };
  added: PlanItem[];
  removed: PlanItem[];
  changed: { substanceName: string; before: PlanItem; after: PlanItem; fields: string[] }[];
  unchanged: PlanItem[];
  hasChanges: boolean;
}

export interface Assessment {
  date: string;
  scores: Record<string, number>;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
  exists?: boolean;
}

export type MetricPolarity = 'positive' | 'negative';

export interface Metric {
  key: string;
  label: string;
  short: string;
  polarity: MetricPolarity;
  lowLabel: string;
  highLabel: string;
}

/** Begleitsubstanz aus einer `Mit:`-Zeile in DEFAULTS.md. */
export interface CompanionDefault {
  name: string;
  amount: string | null;
  note: string | null;
}

export interface SubstanceDefault {
  note: string | null;
  amount: string | null;
  companions?: CompanionDefault[];
}

export interface DefaultsPayload {
  defaults: Record<string, SubstanceDefault>;
  raw: string;
}

export interface SubstanceCompliance {
  name: string;
  intakeCount: number;
  inSubstances: boolean;
  hasDefault: boolean;
  matchedKey: string | null;
}

export interface ComplianceReport {
  checkedAt: string;
  defaultsAvailable: boolean;
  total: number;
  compliant: SubstanceCompliance[];
  missing: SubstanceCompliance[];
}

// ---------- Strukturierte DEFAULTS-Sections (PUT /api/defaults/sections) ----------

/** Wire-Shape eines Begleitstoffs in einer Section. */
export interface DefaultsSectionCompanion {
  name: string;
  amount: string | null;
  note: string | null;
}

/** Wire-Shape einer Substanz-Section.
 *  `preLines` / `postLines` tragen nicht-strukturierte Zeilen (z.B. `NACH
 *  2026-08-01 12:00 CEST: …` Kommentarblöcke) verlustfrei durch. */
export interface DefaultsSection {
  name: string;
  amount: string | null;
  note: string | null;
  companions: DefaultsSectionCompanion[];
  preLines: string[];
  postLines: string[];
}

/** Payload für `PUT /api/defaults/sections`. */
export interface DefaultsSectionsPayload {
  sections: DefaultsSection[];
}

// ───────────────────────── Tagebuch ─────────────────────────

/** Eine Notiz-tragende Einnahme in der Kurzversion des Tagebuchs. */
export interface DiaryIntakeNote {
  id: number;
  takenAt: string;
  time: string;
  substanceName: string;
  amount: string | null;
  note: string | null;
}

export interface DiaryDayAssessment {
  scores: Record<string, number>;
  note: string | null;
}

/** Tägliche Wachzeit (vom Client per POST /api/habit/uptime gemeldet).
 *  Siehe `server/src/routes/habit.ts` für den Algorithmus. */
export interface DiaryDayHabit {
  /** Erster Wach-Moment des Tages (Unix-Sek). */
  wakeFirstUnix: number | null;
  /** Letzter Wach-Moment des Tages (Unix-Sek). */
  wakeLastUnix: number | null;
}

/**
 * Tagesbericht des Hermes-Agents (eingeliefert vom 03:30-Berlin-Cron per
 * POST /api/report/new). Wird im Info-Subtab als eigener Abschnitt angezeigt
 * UND in den Traum-Kontext gespeist — siehe gatherDreamContext.
 */
export interface DiaryDayReport {
  /** Vollständiger Berichtstext (Markdown oder Plain). */
  report: string;
  /** Optionaler Marker (z. B. "hermes-cron-0330"). */
  source: string | null;
}

// ───────────────────────── Habit (Wachzeit & Co.) ─────────────────────────

/** Tages-Habit-Eintrag (z. B. Wachzeit, gemeldet per /api/habit/uptime). */
export interface Habit {
  date: string;
  wakeFirstUnix: number | null;
  wakeLastUnix: number | null;
  createdAt?: string;
  updatedAt?: string;
  exists?: boolean;
}

/** Ein Konsum-Tag in der Kurzversion (Liste der Notizen). */
export interface DiaryNoteDay {
  date: string;
  weekday: string;
  label: string;
  intakes: DiaryIntakeNote[];
  assessment: DiaryDayAssessment | null;
  habit: DiaryDayHabit | null;
  report: DiaryDayReport | null;
}

export interface DiaryNotesResponse {
  days: DiaryNoteDay[];
}

/** Ein generierter Volltext-Eintrag eines Tages. */
export interface DiaryEntry {
  date: string;
  heading: string;
  body: string;
}

/** Zustand des KI-Voll-Tagebuchs. */
export interface DiaryState {
  /** ANTHROPIC_API_KEY hinterlegt? (sonst kann nicht generiert werden) */
  available: boolean;
  model: string;
  raw: string;
  entries: DiaryEntry[];
  /** Alle Tage mit Notizen/Tagesbild (Grundmenge für die Generierung). */
  noteworthyDays: string[];
  /** Tage, für die bereits ein Voll-Eintrag existiert. */
  generatedDays: string[];
  /** Tage mit Inhalt, aber noch ohne Voll-Eintrag. */
  pendingDays: string[];
  lastGeneratedAt: string | null;
}

export interface DiaryGenerateResult extends DiaryState {
  generated: number;
  skippedExisting: number;
  errors: { date: string; error: string }[];
}

// ───────────────────────── Träume (nächtliche Auswertung) ─────────────────────────

/** Ein „Traum" = die tägliche KI-Auswertung (system_prompt.md → MiniMax M3). */
export interface Dream {
  date: string;
  content: string;
  model: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DreamListResponse {
  dreams: Dream[];
  /** MINIMAX_API_KEY hinterlegt? (sonst träumt der Server nicht) */
  available: boolean;
  /** Läuft gerade eine Generierung? */
  busy: boolean;
}

/** Antwort von GET /api/dreams/latest (Startup-Dialog). */
export interface DreamLatest extends Partial<Dream> {
  exists: boolean;
  available: boolean;
}

// ───────────────────────── Daten-Konsole (Chat with your data) ─────────────────────────

export type ChangeSetStatus = 'proposed' | 'applied' | 'undone' | 'discarded';

/** Eine before→after-Zeile der Change-Set-Vorschau. */
export interface DiffRow {
  table: 'intakes' | 'substances';
  id: number | null;
  op: 'update' | 'delete' | 'create';
  label: string;
  before: Record<string, string | null> | null;
  after: Record<string, string | null> | null;
  changedKeys: string[];
}

export interface OperationPreview {
  type: string;
  label: string;
  affected: number;
  warning?: string;
}

export interface ChangeSetPreview {
  operations: OperationPreview[];
  totalAffected: number;
  samples: DiffRow[];
  sampleTruncated: boolean;
}

/** Ein vorgeschlagenes/angewandtes Change-Set der Daten-Konsole. */
export interface ChangeSet {
  id: number;
  createdAt: string;
  appliedAt: string | null;
  undoneAt: string | null;
  status: ChangeSetStatus;
  prompt: string;
  title: string;
  summary: string | null;
  affected: number;
  operations: unknown[];
  preview: ChangeSetPreview | null;
}

export interface ChatStatus {
  available: boolean;
  model: string | null;
}

export interface ChangeSetsResponse {
  changeSets: ChangeSet[];
  latestAppliedId: number | null;
  available: boolean;
}

/** Ein Eintrag im (client-seitigen) Konsolen-Transkript. */
export type TranscriptRole = 'user' | 'assistant';

export interface ToolEvent {
  phase: 'start' | 'result';
  name: string;
  info?: string;
  summary?: string;
}

// ───────────────────────── Traum-Zustellung (WhatsApp-Delivery-Log) ─────────────────────────

/** Zustellstatus eines Traums an den Empfänger (WhatsApp). */
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'abandoned';
/** Status der optionalen Sprachnachricht (ElevenLabs → WhatsApp). */
export type VoiceStatus = 'none' | 'sent' | 'failed';

/** Ein Zustell-Datensatz: der Versuch, einen Traum eines Tages zuzustellen. */
export interface DreamDelivery {
  id: number;
  dreamDate: string;
  channel: string;
  recipient: string;
  status: DeliveryStatus;
  voiceStatus: VoiceStatus;
  attempts: number;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveriesResponse {
  deliveries: DreamDelivery[];
}

// ───────────────────────── WhatsApp-Verbindung (Admin) ─────────────────────────

export type WhatsappConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WhatsappStatus {
  state: WhatsappConnectionState;
  hasCreds: boolean;
  lastConnectedAt: string | null;
  lastQrAt: string | null;
  lastError: string | null;
  configured: boolean;
  adminEnabled: boolean;
  jid: string | null;
}

export interface WhatsappQrResponse { qr: string; }   // base64 PNG, no data: prefix

/**
 * Konfigurierter WhatsApp-Empfänger (Spiegel der SQLite-Rohzeile aus
 * `delivery_targets`). Wird vom Server unverändert (snake_case) zurückgegeben,
 * weil der `/api/whatsapp/targets`-Endpunkt bewusst keinen Serializer
 * vorschaltet — siehe `server/src/routes/whatsapp.ts`.
 */
export interface WhatsappTarget {
  id: number;
  channel: string;
  phone: string;
  display_name: string | null;
  enabled: number;       // 0 oder 1 (SQLite-Boolean)
  created_at: string;
}
