import type {
  SubstanceRow,
  IntakeRow,
  PlanVersionRow,
  PlanItemRow,
  AssessmentRow,
  HabitRow,
  DreamRow,
} from '../db.js';
import { METRIC_KEYS } from './metrics.js';
import { consumptionDay } from './time.js';

export function serializeSubstance(r: SubstanceRow) {
  return {
    id: r.id,
    name: r.name,
    defaultDose: r.default_dose,
    unit: r.unit,
    color: r.color,
    isNightMed: !!r.is_night_med,
    sortOrder: r.sort_order,
    archived: !!r.archived_at,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
  };
}

export function serializeIntake(r: IntakeRow) {
  return {
    id: r.id,
    substanceId: r.substance_id,
    substanceName: r.substance_name,
    takenAt: r.taken_at,
    // Konsum-/Medikations-Tag mit 03:30-Grenze (Europe/Berlin): Einnahmen
    // 00:00–03:29 zählen zum Vortag. Siehe server/src/lib/time.ts.
    date: consumptionDay(r.taken_at),
    amount: r.amount,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function serializePlanItem(r: PlanItemRow) {
  return {
    id: r.id,
    substanceId: r.substance_id,
    substanceName: r.substance_name,
    strength: r.strength,
    morning: r.morning,
    noon: r.noon,
    evening: r.evening,
    night: r.night,
    unit: r.unit,
    reason: r.reason,
    notes: r.notes,
    sortOrder: r.sort_order,
  };
}

export type SerializedPlanItem = ReturnType<typeof serializePlanItem>;

export function serializePlanVersion(v: PlanVersionRow, items: PlanItemRow[]) {
  return {
    versionId: v.id,
    createdAt: v.created_at,
    effectiveFrom: v.effective_from,
    note: v.note,
    items: items.map(serializePlanItem),
  };
}

export function serializeAssessment(r: AssessmentRow) {
  let scores: Record<string, number> = {};
  try {
    scores = JSON.parse(r.scores);
  } catch {
    scores = {};
  }
  // nur bekannte Metriken durchreichen
  const clean: Record<string, number> = {};
  for (const k of METRIC_KEYS) {
    if (typeof scores[k] === 'number') clean[k] = scores[k];
  }
  return {
    date: r.date,
    scores: clean,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function serializeHabit(r: HabitRow) {
  return {
    date: r.date,
    wakeFirstUnix: r.wake_first_unix,
    wakeLastUnix: r.wake_last_unix,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function serializeDream(r: DreamRow) {
  return {
    date: r.date,
    content: r.content,
    model: r.model,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
