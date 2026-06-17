import type {
  Substance,
  Intake,
  IntakeCreateResult,
  Plan,
  PlanVersionSummary,
  PlanDiff,
  Assessment,
  Metric,
  DefaultsPayload,
  ComplianceReport,
  IntakeImportResult,
  PlanSlot,
  PlanBatchResult,
  IntakeBatchEntryInput,
  IntakeBatchResult,
  DiaryNotesResponse,
  DiaryState,
  DiaryGenerateResult,
  Habit,
  DreamListResponse,
  DreamLatest,
  Dream,
} from './types';

const API_BASE_KEY = 'mediary.apiBase';

/** Basis-URL der API. In der APK zur Laufzeit konfigurierbar (Einstellungen). */
export function getApiBase(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_KEY) : null;
  const env = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return (stored ?? env ?? '').replace(/\/$/, '');
}

export function setApiBase(url: string): void {
  if (url) localStorage.setItem(API_BASE_KEY, url.replace(/\/$/, ''));
  else localStorage.removeItem(API_BASE_KEY);
}

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

function errorMessage(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const details = err as { formErrors?: unknown[]; message?: unknown };
      if (typeof details.formErrors?.[0] === 'string') return details.formErrors[0];
      if (typeof details.message === 'string') return details.message;
    }
  }
  return `Fehler ${status}`;
}

async function parseResponseText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError(0, 'Server nicht erreichbar. Verbindung & Server-Adresse prüfen.', e);
  }
  if (res.status === 204) return undefined as T;
  const data = await parseResponseText(res);
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data, res.status), data);
  }
  return data as T;
}

async function requestBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path));
  } catch (e) {
    throw new ApiError(0, 'Server nicht erreichbar. Verbindung & Server-Adresse prüfen.', e);
  }
  if (!res.ok) {
    const data = await parseResponseText(res);
    throw new ApiError(res.status, errorMessage(data, res.status), data);
  }
  return res.blob();
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type':
          file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: file,
    });
  } catch (e) {
    throw new ApiError(0, 'Server nicht erreichbar. Verbindung & Server-Adresse prüfen.', e);
  }
  const data = await parseResponseText(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status), data);
  return data as T;
}

export interface SubstanceInput {
  name: string;
  defaultDose?: string | null;
  unit?: string | null;
  color?: string | null;
  isNightMed?: boolean;
  sortOrder?: number;
}

export interface IntakeInput {
  substanceId?: number | null;
  substanceName?: string;
  takenAt?: string;
  amount?: string | null;
  notes?: string | null;
  /** false = Begleitsubstanzen aus DEFAULTS `Mit:` nicht automatisch miterfassen. */
  companions?: boolean;
}

export const api = {
  health: () => request<{ ok: boolean; time: string }>('/api/health'),
  metrics: () => request<Metric[]>('/api/metrics'),

  substances: {
    list: (includeArchived = false) =>
      request<Substance[]>(`/api/substances${qs({ includeArchived })}`),
    create: (body: SubstanceInput) =>
      request<Substance>('/api/substances', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<SubstanceInput> & { archived?: boolean }) =>
      request<Substance>(`/api/substances/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number, hard = false) =>
      request<void>(`/api/substances/${id}${qs({ hard })}`, { method: 'DELETE' }),
    reorder: (ids: number[]) =>
      request<{ ok: boolean }>('/api/substances/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  },

  intakes: {
    list: (params?: { from?: string; to?: string; substanceId?: number; limit?: number }) =>
      request<Intake[]>(`/api/intakes${qs(params)}`),
    exportXlsx: () => requestBlob('/api/intakes/export.xlsx'),
    importXlsx: (file: File) => uploadFile<IntakeImportResult>('/api/intakes/import', file),
    create: (body: IntakeInput) =>
      request<IntakeCreateResult>('/api/intakes', { method: 'POST', body: JSON.stringify(body) }),
    planBatch: (body: { slot: PlanSlot; takenAt?: string }) =>
      request<PlanBatchResult>('/api/intakes/plan-batch', { method: 'POST', body: JSON.stringify(body) }),
    batch: (body: { takenAt?: string; companions?: boolean; entries: IntakeBatchEntryInput[] }) =>
      request<IntakeBatchResult>('/api/intakes/batch', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<IntakeInput>) =>
      request<Intake>(`/api/intakes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => request<void>(`/api/intakes/${id}`, { method: 'DELETE' }),
  },

  plan: {
    current: () => request<Plan>('/api/plan'),
    at: (params: { date?: string; days?: number }) => request<Plan>(`/api/plan/at${qs(params)}`),
    versions: () => request<PlanVersionSummary[]>('/api/plan/versions'),
    version: (id: number) => request<Plan>(`/api/plan/version/${id}`),
    diff: (params: { days?: number; fromDate?: string; toDate?: string }) =>
      request<PlanDiff>(`/api/plan/diff${qs(params)}`),
    save: (items: Plan['items'], note?: string | null, effectiveFrom?: string | null) =>
      request<Plan>('/api/plan', { method: 'PUT', body: JSON.stringify({ items, note, effectiveFrom }) }),
  },

  assessments: {
    list: (from?: string, to?: string) => request<Assessment[]>(`/api/assessments${qs({ from, to })}`),
    get: (date: string) => request<Assessment>(`/api/assessments/${date}`),
    save: (date: string, scores: Record<string, number>, note?: string | null) =>
      request<Assessment>(`/api/assessments/${date}`, { method: 'PUT', body: JSON.stringify({ scores, note }) }),
    remove: (date: string) => request<void>(`/api/assessments/${date}`, { method: 'DELETE' }),
  },

  defaults: {
    get: () => request<DefaultsPayload>('/api/defaults'),
    save: (content: string) =>
      request<DefaultsPayload>('/api/defaults', { method: 'PUT', body: JSON.stringify({ content }) }),
    check: () => request<ComplianceReport>('/api/defaults/check'),
  },

  diary: {
    notes: (params?: { from?: string; to?: string }) =>
      request<DiaryNotesResponse>(`/api/diary/notes${qs(params)}`),
    get: () => request<DiaryState>('/api/diary'),
    generate: (body: { scope?: 'missing' | 'all'; from?: string; to?: string; max?: number }) =>
      request<DiaryGenerateResult>('/api/diary/generate', { method: 'POST', body: JSON.stringify(body) }),
    save: (content: string) =>
      request<DiaryState>('/api/diary', { method: 'PUT', body: JSON.stringify({ content }) }),
  },

  /**
   * Träume — die nächtlichen KI-Auswertungen. Lesen ist offen; das Generieren
   * läuft serverseitig (Scheduler) bzw. über den geschützten Trigger und ist
   * hier bewusst NICHT exponiert (die UI zeigt nur die Historie).
   */
  dreams: {
    list: (params?: { from?: string; to?: string; limit?: number }) =>
      request<DreamListResponse>(`/api/dreams${qs(params)}`),
    latest: () => request<DreamLatest>('/api/dreams/latest'),
    get: (date: string) => request<Dream & { exists: boolean }>(`/api/dreams/${date}`),
  },

  /**
   * Habit-Daten (z. B. PC-Nutzungszeiten, gemeldet per POST /api/habit/uptime).
   * `uptime()` ist der primäre Endpunkt für den lokalen Client-Cron; die
   * Read-Methoden helfen beim Smoke-Test und sind hier nur der Vollständigkeit
   * halber exponiert.
   */
  habit: {
    uptime: (body: { last_user_interaction_unix: number; first_user_interaction_24h_unix: number }) =>
      request<Habit>('/api/habit/uptime', { method: 'POST', body: JSON.stringify(body) }),
    list: (params?: { from?: string; to?: string }) =>
      request<Habit[]>(`/api/habit${qs(params)}`),
    get: (date: string) => request<Habit>(`/api/habit/${date}`),
    remove: (date: string) => request<void>(`/api/habit/${date}`, { method: 'DELETE' }),
  },
};
