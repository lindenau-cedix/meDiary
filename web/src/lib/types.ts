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

/** Auto-recorded companion intake (DEFAULTS.md `Mit:`). */
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

/** Day slot of the medication plan (Morning/Midday/Evening/Night). */
export type PlanSlot = 'morning' | 'noon' | 'evening' | 'night';

/** One intake produced by a collective entry ("Morning meds"/"Night meds"). */
export interface PlanBatchEntry {
  intake: Intake;
  createdSubstance: boolean;
}

/** Response of POST /api/intakes/plan-batch — all intakes of one slot. */
export interface PlanBatchResult {
  slot: PlanSlot;
  count: number;
  entries: PlanBatchEntry[];
  nightMed: boolean;
  assessmentDate: string | null;
  assessmentExists: boolean;
}

/** One entry in the batch request POST /api/intakes/batch. */
export interface IntakeBatchEntryInput {
  substanceId?: number | null;
  substanceName?: string;
  amount?: string | null;
  notes?: string | null;
}

/** One produced intake (plus companions) from POST /api/intakes/batch. */
export interface IntakeBatchEntry {
  intake: Intake;
  createdSubstance: boolean;
  companions: IntakeCompanion[];
}

/** Response of POST /api/intakes/batch — multiple substances at the same timestamp. */
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
  /** Effective-from date ("valid from", YYYY-MM-DD or YYYY-MM-DDTHH:mm) of the version. */
  effectiveFrom: string | null;
  note: string | null;
  items: PlanItem[];
  /** Only on GET /api/plan: versions with an effective-from date in the future. */
  upcoming?: UpcomingPlanVersion[];
}

export interface PlanVersionSummary {
  versionId: number;
  createdAt: string;
  effectiveFrom: string;
  /** = effectiveFrom (effective date, for display/snapshots). */
  date: string;
  note: string | null;
  itemCount: number;
  active: boolean;
  upcoming: boolean;
  /** Only on GET /api/plan/versions?withItems=1 — the items of this version.
   *  The history uses this to match each intake against the plan version
   *  that was effective at the time. */
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

/** Companion substance from a `Mit:` line in DEFAULTS.md. */
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

// ---------- Structured DEFAULTS sections (PUT /api/defaults/sections) ----------

/** Wire shape of a companion in a section. */
export interface DefaultsSectionCompanion {
  name: string;
  amount: string | null;
  note: string | null;
}

/** Wire shape of a substance section.
 *  `preLines` / `postLines` carry unstructured lines (e.g. `NACH
 *  2026-08-01 12:00 CEST: …` comment blocks) through losslessly. */
export interface DefaultsSection {
  name: string;
  amount: string | null;
  note: string | null;
  companions: DefaultsSectionCompanion[];
  preLines: string[];
  postLines: string[];
}

/** Payload for `PUT /api/defaults/sections`. */
export interface DefaultsSectionsPayload {
  sections: DefaultsSection[];
}

// ───────────────────────── Diary ─────────────────────────

/** A note-bearing intake in the short diary version. */
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

/** Daily wake-time (reported by the client via POST /api/habit/uptime).
 *  See `server/src/routes/habit.ts` for the algorithm. */
export interface DiaryDayHabit {
  /** First wake moment of the day (Unix seconds). */
  wakeFirstUnix: number | null;
  /** Last wake moment of the day (Unix seconds). */
  wakeLastUnix: number | null;
}

/**
 * Daily report of the Hermes agent (delivered by the 03:30 Berlin cron via
 * POST /api/report/new). Rendered in the Info subtab as a separate section
 * AND fed into the dream context — see gatherDreamContext.
 */
export interface DiaryDayReport {
  /** Full report text (Markdown or plain). */
  report: string;
  /** Optional source marker (e.g. "hermes-cron-0330"). */
  source: string | null;
}

// ───────────────────────── Habit (wake time & co.) ─────────────────────────

/** Daily habit entry (e.g. wake time, reported via /api/habit/uptime). */
export interface Habit {
  date: string;
  wakeFirstUnix: number | null;
  wakeLastUnix: number | null;
  createdAt?: string;
  updatedAt?: string;
  exists?: boolean;
}

/** One consumption day in the short version (list of notes). */
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

/** One generated full-text entry for a day. */
export interface DiaryEntry {
  date: string;
  heading: string;
  body: string;
}

/** State of the AI full-text diary. */
export interface DiaryState {
  /** Is ANTHROPIC_API_KEY configured? (otherwise generation is unavailable) */
  available: boolean;
  model: string;
  raw: string;
  entries: DiaryEntry[];
  /** All days with notes/assessment (base set for generation). */
  noteworthyDays: string[];
  /** Days that already have a full entry. */
  generatedDays: string[];
  /** Days with content but without a full entry yet. */
  pendingDays: string[];
  lastGeneratedAt: string | null;
}

export interface DiaryGenerateResult extends DiaryState {
  generated: number;
  skippedExisting: number;
  errors: { date: string; error: string }[];
}

// ───────────────────────── Dreams (nightly summary) ─────────────────────────

/** A "dream" = the daily AI summary (system_prompt.md → MiniMax M3). */
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
  /** Is MINIMAX_API_KEY configured? (otherwise the server does not dream) */
  available: boolean;
  /** Is a generation currently running? */
  busy: boolean;
}

/** Response of GET /api/dreams/latest (startup dialog). */
export interface DreamLatest extends Partial<Dream> {
  exists: boolean;
  available: boolean;
}

// ───────────────────────── Data console (Chat with your data) ─────────────────────────

export type ChangeSetStatus = 'proposed' | 'applied' | 'undone' | 'discarded';

/** One before→after row of the change-set preview. */
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

/** A proposed/applied change set from the data console. */
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

/** One entry in the (client-side) console transcript. */
export type TranscriptRole = 'user' | 'assistant';

export interface ToolEvent {
  phase: 'start' | 'result';
  name: string;
  info?: string;
  summary?: string;
}

// ───────────────────────── Dream delivery (WhatsApp delivery log) ─────────────────────────

/** Delivery status of a dream to the recipient (WhatsApp). */
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'abandoned';
/** Status of the optional voice note (ElevenLabs → WhatsApp). */
export type VoiceStatus = 'none' | 'sent' | 'failed';

/** A delivery record: the attempt to deliver a dream for a given day. */
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

// ───────────────────────── WhatsApp connection (admin) ─────────────────────────

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
 * Configured WhatsApp recipient (mirror of the raw SQLite row from
 * `delivery_targets`). The server returns it unchanged (snake_case)
 * because the `/api/whatsapp/targets` endpoint deliberately does not
 * have a serializer in front — see `server/src/routes/whatsapp.ts`.
 */
export interface WhatsappTarget {
  id: number;
  channel: string;
  phone: string;
  display_name: string | null;
  enabled: number;       // 0 or 1 (SQLite boolean)
  created_at: string;
}

// ───────────────────────── Ingredient profiles (AI, "Compound balance" stats) ─────────────────────────

/** Typical serving of a substance, as logged by the user. */
export interface SubstanceServing {
  label: string;
  value: number;
  unit: string;
  /** Volume of ONE serving in ml (drinks) — allows ml conversion. */
  milliliters?: number | null;
  /** Mass of ONE serving in g (solids) — allows g/mg conversion. */
  grams?: number | null;
}

/** One active ingredient in a serving (mg). */
export interface IngredientEntry {
  /** Canonical source-spanning key (e.g. "caffeine"). */
  compound: string;
  /** Display name (e.g. "Caffeine"). */
  label: string;
  category: string;
  mgPerServing: number;
}

/** AI profile of a substance (serving + ingredients). */
export interface SubstanceProfile {
  serving: SubstanceServing;
  ingredients: IngredientEntry[];
  summary: string;
  confidence: 'low' | 'medium' | 'high';
}

/** A cached profile plus metadata (addressed by nameKey). */
export interface SubstanceProfileDTO {
  name: string;
  profile: SubstanceProfile;
  model: string;
  updatedAt: string;
  /** True if the input has been modified since the analysis. */
  stale: boolean;
}

/** State of the AI ingredient analysis (GET /api/ingredients). */
export interface IngredientsState {
  available: boolean;
  model: string;
  /** Profiles by nameKey. */
  profiles: Record<string, SubstanceProfileDTO>;
  /** Substances (with intakes) lacking a profile. */
  missing: string[];
  /** Substances with a stale profile. */
  stale: string[];
  /** Total substances (with ≥ 1 intake). */
  total: number;
}

/** Result of POST /api/ingredients/analyze. */
export interface IngredientsAnalyzeResult {
  analyzed: number;
  skipped: number;
  total: number;
  errors: { names: string[]; error: string }[];
  state: IngredientsState;
}
