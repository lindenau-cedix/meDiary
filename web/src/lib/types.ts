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

/** PC-Nutzungszeiten (vom Client per POST /api/habit/uptime gemeldet). */
export interface DiaryDayHabit {
  /** Erste User-Interaktion im 24h-Fenster vor dem Tages-Cron (Unix-Sek). */
  pcFirstInteractionUnix: number | null;
  /** Letzte User-Interaktion vor dem Tages-Cron (Unix-Sek). */
  pcLastInteractionUnix: number | null;
}

// ───────────────────────── Habit (PC-Uptime & Co.) ─────────────────────────

/** Tages-Habit-Eintrag (z. B. PC-Nutzungszeiten, gemeldet per /api/habit/uptime). */
export interface Habit {
  date: string;
  pcFirstInteractionUnix: number | null;
  pcLastInteractionUnix: number | null;
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
