import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type IntakeInput, type SubstanceInput } from './api';
import type { Plan, PlanItem, PlanSlot, IntakeBatchEntryInput, DefaultsSection } from './types';

export const qk = {
  substances: (archived = false) => ['substances', archived] as const,
  intakes: (params?: object) => ['intakes', params ?? {}] as const,
  plan: () => ['plan'] as const,
  planVersions: () => ['plan', 'versions'] as const,
  planVersionsWithItems: () => ['plan', 'versions', 'withItems'] as const,
  planDiff: (params: object) => ['plan', 'diff', params] as const,
  assessments: (from?: string, to?: string) => ['assessments', from, to] as const,
  assessment: (date: string) => ['assessment', date] as const,
  defaults: () => ['defaults'] as const,
  compliance: () => ['defaults', 'check'] as const,
  metrics: () => ['metrics'] as const,
  diary: () => ['diary'] as const,
  diaryNotes: (params?: object) => ['diary', 'notes', params ?? {}] as const,
  dreams: (params?: object) => ['dreams', params ?? {}] as const,
  dreamLatest: () => ['dreams', 'latest'] as const,
  deliveries: (params?: { dreamDate?: string; limit?: number }) => ['deliveries', params ?? {}] as const,
  whatsappStatus: () => ['whatsapp', 'status'] as const,
  whatsappQr: () => ['whatsapp', 'qr'] as const,
  whatsappTargets: () => ['whatsapp', 'targets'] as const,
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
    // Mehrere Substanzen auf einmal (gleicher Zeitpunkt, je eigene Menge/Notiz).
    batch: useMutation({
      mutationFn: (b: { takenAt?: string; companions?: boolean; entries: IntakeBatchEntryInput[] }) =>
        api.intakes.batch(b),
      onSuccess: (res) => {
        invalidate();
        if (res.entries.some((e) => e.createdSubstance || e.companions.some((c) => c.createdSubstance))) {
          qc.invalidateQueries({ queryKey: ['substances'] });
          qc.invalidateQueries({ queryKey: qk.compliance() });
        }
      },
    }),
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
/** Alle Plan-Versionen inklusive Items — für die zeitpunktgenaue „planmäßig"-
 *  Bewertung im Verlauf (jede Einnahme gegen die damals wirksame Version). */
export function usePlanVersionsWithItems() {
  return useQuery({
    queryKey: qk.planVersionsWithItems(),
    queryFn: () => api.plan.versions({ withItems: true }),
  });
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
/** Strukturierte Sections speichern (PUT /api/defaults/sections). */
export function useSaveDefaultsSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sections: DefaultsSection[]) => api.defaults.saveSections(sections),
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

// ---------- Tagebuch ----------
export function useDiaryNotes(params?: { from?: string; to?: string }) {
  return useQuery({ queryKey: qk.diaryNotes(params), queryFn: () => api.diary.notes(params) });
}
export function useDiary() {
  return useQuery({ queryKey: qk.diary(), queryFn: () => api.diary.get() });
}
export function useGenerateDiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { scope?: 'missing' | 'all'; from?: string; to?: string; max?: number }) =>
      api.diary.generate(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diary'] }),
  });
}
export function useSaveDiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.diary.save(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diary'] }),
  });
}

// ---------- Träume (nächtliche Auswertung) ----------
export function useDreams(params?: { from?: string; to?: string; limit?: number }) {
  return useQuery({ queryKey: qk.dreams(params), queryFn: () => api.dreams.list(params), staleTime: 30_000 });
}

// ---------- Traum-Zustellung (WhatsApp-Delivery-Log) ----------
export function useDeliveries(params?: { dreamDate?: string; limit?: number }) {
  return useQuery({
    queryKey: qk.deliveries(params),
    queryFn: () => api.deliveries.list(params),
    staleTime: 15_000,
  });
}
export function useWhatsappStatus() {
  return useQuery({
    queryKey: qk.whatsappStatus(),
    queryFn: () => api.whatsapp.status(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
export function useWhatsappQr(enabled: boolean) {
  return useQuery({
    queryKey: qk.whatsappQr(),
    queryFn: () => api.whatsapp.qr(),
    enabled,
    refetchInterval: 5_000,
  });
}
/**
 * Liste der WhatsApp-Empfänger. Wird vom Panel nur abgefragt, wenn der
 * Admin-Schalter aktiv ist — Nicht-Admins lösen damit nie eine
 * CF-Access-401-Welle aus.
 */
export function useWhatsappTargets(enabled: boolean) {
  return useQuery({
    queryKey: qk.whatsappTargets(),
    queryFn: () => api.whatsapp.targets.list(),
    enabled,
    staleTime: 30_000,
  });
}
/** Neuen Empfänger anlegen; invalidiert die Liste nach Erfolg. */
export function useAddWhatsappTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; displayName?: string }) => api.whatsapp.targets.add(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.whatsappTargets() });
    },
  });
}
export function useRedeliverDream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.dreams.redeliver(date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

// ---------- Daten-Konsole (Chat with your data) ----------
export function useChatStatus() {
  return useQuery({ queryKey: ['chat', 'status'], queryFn: () => api.chat.status(), staleTime: 60_000 });
}
export function useChangeSets(enabled = true) {
  return useQuery({
    queryKey: ['chat', 'change-sets'],
    queryFn: () => api.chat.changeSets(),
    enabled,
    staleTime: 5_000,
  });
}
/**
 * Anwenden/Undo/Verwerfen eines Change-Sets. Da die Konsole Einnahmen &
 * Substanzen verändert, wird nach Erfolg breit invalidiert (gesamte App), damit
 * Verlauf/Heute/Plan/Werte den neuen Stand zeigen.
 */
export function useChangeSetActions() {
  const qc = useQueryClient();
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['chat', 'change-sets'] });
    qc.invalidateQueries({ queryKey: ['intakes'] });
    qc.invalidateQueries({ queryKey: ['substances'] });
    qc.invalidateQueries({ queryKey: qk.compliance() });
    qc.invalidateQueries({ queryKey: ['plan'] });
    qc.invalidateQueries({ queryKey: ['assessments'] });
  };
  return {
    apply: useMutation({ mutationFn: (id: number) => api.chat.apply(id), onSuccess: refreshAll }),
    undo: useMutation({ mutationFn: (id: number) => api.chat.undo(id), onSuccess: refreshAll }),
    discard: useMutation({
      mutationFn: (id: number) => api.chat.discard(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'change-sets'] }),
    }),
  };
}

export type { Plan };
