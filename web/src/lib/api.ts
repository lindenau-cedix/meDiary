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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError(0, 'Server nicht erreichbar. Verbindung & Server-Adresse prüfen.', e);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = (data && (data.error?.formErrors?.[0] || data.error?.message || data.error)) || `Fehler ${res.status}`;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : `Fehler ${res.status}`, data);
  }
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
    create: (body: IntakeInput) =>
      request<IntakeCreateResult>('/api/intakes', { method: 'POST', body: JSON.stringify(body) }),
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
    save: (items: Plan['items'], note?: string | null) =>
      request<Plan>('/api/plan', { method: 'PUT', body: JSON.stringify({ items, note }) }),
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
};
