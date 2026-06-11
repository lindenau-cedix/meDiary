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

export interface IntakeCreateResult {
  intake: Intake;
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
  /** Wirkungsdatum ("gültig ab", YYYY-MM-DD) der Version. */
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

export interface SubstanceDefault {
  note: string | null;
  amount: string | null;
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
