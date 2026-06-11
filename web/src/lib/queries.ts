import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type IntakeInput, type SubstanceInput } from './api';
import type { Plan, PlanItem, PlanSlot } from './types';

export const qk = {
  substances: (archived = false) => ['substances', archived] as const,
  intakes: (params?: object) => ['intakes', params ?? {}] as const,
  plan: () => ['plan'] as const,
  planVersions: () => ['plan', 'versions'] as const,
  planDiff: (params: object) => ['plan', 'diff', params] as const,
  assessments: (from?: string, to?: string) => ['assessments', from, to] as const,
  assessment: (date: string) => ['assessment', date] as const,
  defaults: () => ['defaults'] as const,
  compliance: () => ['defaults', 'check'] as const,
  metrics: () => ['metrics'] as const,
};

// ---------- Substanzen ----------
export function useSubstances(includeArchived = false) {
  return useQuery({
    queryKey: qk.substances(includeArchived),
    queryFn: () => api.substances.list(includeArchived),
    staleTime: 30_000,
  });
}

export function useSubstanceMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['substances'] });
  return {
    create: useMutation({ mutationFn: (b: SubstanceInput) => api.substances.create(b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<SubstanceInput> & { archived?: boolean } }) =>
        api.substances.update(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: ({ id, hard }: { id: number; hard?: boolean }) => api.substances.remove(id, hard),
      onSuccess: invalidate,
    }),
    reorder: useMutation({ mutationFn: (ids: number[]) => api.substances.reorder(ids), onSuccess: invalidate }),
  };
}

// ---------- Einnahmen ----------
export function useIntakes(params?: { from?: string; to?: string; substanceId?: number; limit?: number }) {
  return useQuery({ queryKey: qk.intakes(params), queryFn: () => api.intakes.list(params) });
}

export function useIntakeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['intakes'] });
  return {
    create: useMutation({
      mutationFn: (b: IntakeInput) => api.intakes.create(b),
      onSuccess: (res) => {
        invalidate();
        // Eine Begleitsubstanz (DEFAULTS "Mit:") kann eine neue Kachel angelegt haben
        if (res.createdSubstance || res.companions?.some((c) => c.createdSubstance)) {
          qc.invalidateQueries({ queryKey: ['substances'] });
          qc.invalidateQueries({ queryKey: qk.compliance() });
        }
      },
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<IntakeInput> }) => api.intakes.update(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.intakes.remove(id), onSuccess: invalidate }),
    // Sammel-Eintrag aller Plan-Substanzen eines Slots ("Morgendmedis"/"Nachtmedis").
    planBatch: useMutation({
      mutationFn: (b: { slot: PlanSlot; takenAt?: string }) => api.intakes.planBatch(b),
      onSuccess: (res) => {
        invalidate();
        // Eine Plan-Substanz ohne eigene Kachel kann neu angelegt worden sein.
        if (res.entries.some((e) => e.createdSubstance)) {
          qc.invalidateQueries({ queryKey: ['substances'] });
          qc.invalidateQueries({ queryKey: qk.compliance() });
        }
      },
    }),
  };
}

export function useImportIntakes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.intakes.importXlsx(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intakes'] });
      qc.invalidateQueries({ queryKey: ['substances'] });
      qc.invalidateQueries({ queryKey: qk.compliance() });
    },
  });
}

// ---------- Plan ----------
export function usePlan() {
  return useQuery({ queryKey: qk.plan(), queryFn: () => api.plan.current() });
}
export function usePlanVersions() {
  return useQuery({ queryKey: qk.planVersions(), queryFn: () => api.plan.versions() });
}
export function usePlanDiff(params: { days?: number; fromDate?: string; toDate?: string }, enabled = true) {
  return useQuery({ queryKey: qk.planDiff(params), queryFn: () => api.plan.diff(params), enabled });
}
export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ items, note, effectiveFrom }: { items: PlanItem[]; note?: string | null; effectiveFrom?: string | null }) =>
      api.plan.save(items, note, effectiveFrom),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  });
}

// ---------- Assessments ----------
export function useAssessments(from?: string, to?: string) {
  return useQuery({ queryKey: qk.assessments(from, to), queryFn: () => api.assessments.list(from, to) });
}
export function useAssessment(date: string, enabled = true) {
  return useQuery({ queryKey: qk.assessment(date), queryFn: () => api.assessments.get(date), enabled });
}
export function useSaveAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, scores, note }: { date: string; scores: Record<string, number>; note?: string | null }) =>
      api.assessments.save(date, scores, note),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['assessments'] });
      qc.invalidateQueries({ queryKey: qk.assessment(vars.date) });
    },
  });
}

// ---------- Defaults & Meta ----------
export function useDefaults() {
  return useQuery({ queryKey: qk.defaults(), queryFn: () => api.defaults.get() });
}
export function useSaveDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.defaults.save(content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.defaults() });
      qc.invalidateQueries({ queryKey: qk.compliance() });
    },
  });
}
/** DEFAULTS-Compliance: welche Substanzen haben (k)einen Eintrag in DEFAULTS.md. */
export function useCompliance(enabled = true) {
  return useQuery({ queryKey: qk.compliance(), queryFn: () => api.defaults.check(), enabled });
}
export function useMetrics() {
  return useQuery({ queryKey: qk.metrics(), queryFn: () => api.metrics(), staleTime: Infinity });
}

export type { Plan };
