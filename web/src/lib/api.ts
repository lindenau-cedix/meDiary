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
  ChatStatus,
  ChangeSet,
  ChangeSetsResponse,
  DeliveriesResponse,
  WhatsappStatus,
  WhatsappQrResponse,
  WhatsappTarget,
} from './types';
import { mirrorApiBaseToWidgets } from './widgetBridge';

const API_BASE_KEY = 'mediary.apiBase';

/**
 * Basis-URL der API. In der APK zur Laufzeit konfigurierbar (Einstellungen).
 *
 * Spiegelung: Auf Capacitor-Plattformen wird der Wert zusätzlich an den
 * nativen `WidgetBridgePlugin` weitergereicht, damit die
 * Android-Homescreen-Widgets (Sample-Widget) die URL kennen, ohne dass
 * der Nutzer die App jemals geöffnet haben muss. Im Browser ist das ein
 * No-Op (siehe `widgetBridge.ts`).
 */
export function getApiBase(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_KEY) : null;
  const env = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const url = (stored ?? env ?? '').replace(/\/$/, '');
  if (url) void mirrorApiBaseToWidgets(url);
  return url;
}

export function setApiBase(url: string): void {
  if (url) localStorage.setItem(API_BASE_KEY, url.replace(/\/$/, ''));
  else localStorage.removeItem(API_BASE_KEY);
  const normalized = url.replace(/\/$/, '');
  if (normalized) void mirrorApiBaseToWidgets(normalized);
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
    redeliver: (date: string) =>
      request<{ date: string; attempted: number; sent: number; failed: number }>(
        `/api/dreams/${date}/redeliver`,
        { method: 'POST' },
      ),
  },

  /**
   * Zustell-Log der Träume (WhatsApp). Offen lesbar; zeigt pro Traum-Tag den
   * Zustellversuch (Status, Sprachnachricht, Fehler, Zeitstempel).
   */
  deliveries: {
    list: (params?: { dreamDate?: string; limit?: number }) => {
      const q = params?.dreamDate ? `?dream_date=${encodeURIComponent(params.dreamDate)}` : '';
      const l = params?.limit ? `${q ? '&' : '?'}limit=${params.limit}` : '';
      return request<DeliveriesResponse>(`/api/deliveries${q}${l}`);
    },
  },

  /**
   * WhatsApp-Verbindung (Admin). `status()` ist offen lesbar (u. a. für das
   * „Erneut senden"-Gate im Traum-Log); QR/Reconnect/Test/Targets sind
   * Admin-Aktionen. Die Ziel-Tabellen-Antwort kommt als snake_case-Rohrow
   * vom Server (kein Serializer vorgeschaltet), darum ist die Liste in
   * `WhatsappTarget` ebenfalls snake_case.
   */
  whatsapp: {
    status: () => request<WhatsappStatus>('/api/whatsapp/status'),
    qr: () => request<WhatsappQrResponse>('/api/whatsapp/qr'),
    reconnect: () => request<{ ok: boolean }>('/api/whatsapp/reconnect', { method: 'POST' }),
    test: () => request<{ ok: boolean; recipient?: string }>('/api/whatsapp/test', { method: 'POST' }),
    targets: {
      list: () => request<{ targets: WhatsappTarget[] }>('/api/whatsapp/targets'),
      add: (body: { phone: string; displayName?: string }) =>
        request<{ target: WhatsappTarget }>('/api/whatsapp/targets', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
    },
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

  /**
   * Daten-Konsole („Chat with your data"). `message()` streamt per SSE (eigene
   * Funktion `streamChatMessage`); die Change-Set-Aktionen laufen über `request`.
   */
  chat: {
    status: () => request<ChatStatus>('/api/chat/status'),
    changeSets: (limit?: number) => request<ChangeSetsResponse>(`/api/chat/change-sets${qs({ limit })}`),
    apply: (id: number) =>
      request<{ changeSet: ChangeSet; affected: number; latestAppliedId: number | null }>(
        `/api/chat/change-sets/${id}/apply`,
        { method: 'POST' },
      ),
    undo: (id: number) =>
      request<{ changeSet: ChangeSet; latestAppliedId: number | null }>(`/api/chat/change-sets/${id}/undo`, {
        method: 'POST',
      }),
    discard: (id: number) =>
      request<{ changeSet: ChangeSet }>(`/api/chat/change-sets/${id}/discard`, { method: 'POST' }),
  },
};

// ───────────────────────── Chat-SSE-Streaming ─────────────────────────

export interface ChatStreamHandlers {
  onToken?: (text: string) => void;
  onThinking?: (text: string) => void;
  onTool?: (e: { phase: 'start' | 'result'; name: string; info?: string; summary?: string }) => void;
  onChangeSet?: (cs: ChangeSet) => void;
  onDone?: (d: { finalText: string; proposals: number }) => void;
  onError?: (msg: string) => void;
}

/**
 * Sendet eine Konsolen-Nachricht und konsumiert die SSE-Antwort des Servers
 * (`event:`/`data:`-Paare). Der gemeinsame `request`-Helfer taugt dafür nicht
 * (JSON-only), daher eigener Reader. `signal` bricht den Stream ab.
 */
export async function streamChatMessage(
  body: { message: string; history?: { role: 'user' | 'assistant'; text: string }[] },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/chat/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    handlers.onError?.('Server nicht erreichbar. Verbindung & Server-Adresse prüfen.');
    void e;
    return;
  }

  if (!res.ok || !res.body) {
    const data = await parseResponseText(res);
    handlers.onError?.(errorMessage(data, res.status));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (event: string, dataStr: string) => {
    let data: Record<string, unknown> = {};
    try {
      data = dataStr ? JSON.parse(dataStr) : {};
    } catch {
      return;
    }
    switch (event) {
      case 'token':
        handlers.onToken?.(String(data.text ?? ''));
        break;
      case 'thinking':
        handlers.onThinking?.(String(data.text ?? ''));
        break;
      case 'tool':
        handlers.onTool?.(data as { phase: 'start' | 'result'; name: string; info?: string; summary?: string });
        break;
      case 'changeset':
        handlers.onChangeSet?.((data as { changeSet: ChangeSet }).changeSet);
        break;
      case 'done':
        handlers.onDone?.({ finalText: String(data.finalText ?? ''), proposals: Number(data.proposals ?? 0) });
        break;
      case 'error':
        handlers.onError?.(String(data.error ?? 'Unbekannter Fehler'));
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of rawEvent.split('\n')) {
          const l = line.replace(/\r$/, '');
          if (l.startsWith('event:')) event = l.slice(6).trim();
          // Mehrere data:-Zeilen werden gemäß SSE-Spec mit \n verbunden.
          else if (l.startsWith('data:')) dataLines.push(l.slice(5).replace(/^ /, ''));
        }
        dispatch(event, dataLines.join('\n'));
      }
    }
  } catch (e) {
    if (!signal?.aborted) handlers.onError?.((e as Error).message);
  }
}
