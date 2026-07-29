import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import {
  ArrowUp,
  Square,
  Settings2,
  History as HistoryIcon,
  Database,
  Search,
  ShieldCheck,
  Terminal,
  KeyRound,
  WifiOff,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { IconButton } from '../components/ui/IconButton';
import { Sheet } from '../components/ui/Sheet';
import { ConsoleEmptyState } from '../components/console/ConsoleEmptyState';
import { ChangeSetCard } from '../components/console/ChangeSetCard';
import { useToast } from '../components/Toaster';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { streamChatMessage, ApiError } from '../lib/api';
import { useChatStatus, useChangeSets, useChangeSetActions } from '../lib/queries';
import { useT } from '../lib/i18n';
import type { ChangeSet, ChangeSetStatus } from '../lib/types';

// ───────────────────────── Transcript model ─────────────────────────

interface ToolLine {
  name: string;
  info: string;
  summary?: string;
  done: boolean;
}
interface UserEntry {
  kind: 'user';
  id: string;
  text: string;
}
interface AssistantEntry {
  kind: 'assistant';
  id: string;
  text: string;
  tools: ToolLine[];
  changeSetIds: number[];
  thinking: boolean;
  streaming: boolean;
  error?: string;
}
type Entry = UserEntry | AssistantEntry;

let seq = 0;
const nextId = () => `e${++seq}`;

// Per-tool verb labels — kept in a constant so the streaming assistant loop
// can render them as the tool runs. We resolve the user-facing label inside
// the component (with `useT`) for a real locale switch.
const TOOL_KEYS: Record<string, { Icon: typeof Database; verbKey: 'console.tool.schema' | 'console.tool.query' | 'console.tool.proposal' }> = {
  inspect_schema: { Icon: Database, verbKey: 'console.tool.schema' },
  run_read_query: { Icon: Search, verbKey: 'console.tool.query' },
  propose_change_set: { Icon: ShieldCheck, verbKey: 'console.tool.proposal' },
};

// ───────────────────────── Screen ─────────────────────────

export function ConsoleScreen() {
  const toast = useToast();
  const reduce = useReducedMotion();
  const t = useT();
  const status = useChatStatus();
  const changeSetsQuery = useChangeSets();
  const actions = useChangeSetActions();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [changeSets, setChangeSets] = useState<Record<number, ChangeSet>>({});
  const [latestAppliedId, setLatestAppliedId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate the change-set history once (for the audit log + undo state).
  useEffect(() => {
    const data = changeSetsQuery.data;
    if (!data) return;
    setChangeSets((prev) => {
      const next = { ...prev };
      for (const cs of data.changeSets) if (!next[cs.id]) next[cs.id] = cs;
      return next;
    });
    setLatestAppliedId((prev) => prev ?? data.latestAppliedId);
  }, [changeSetsQuery.data]);

  // Auto-scroll to the bottom on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [entries, reduce]);

  const patchAssistant = (id: string, fn: (a: AssistantEntry) => AssistantEntry) =>
    setEntries((prev) => prev.map((e) => (e.id === id && e.kind === 'assistant' ? fn(e) : e)));

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;

    // History: completed text turns only (excluding the new prompt).
    const history = entries
      .filter((e) => e.kind === 'user' || (e.kind === 'assistant' && !!e.text && !e.error))
      .map((e) => ({ role: e.kind, text: e.text }))
      .slice(-20);

    const assistantId = nextId();
    setEntries((prev) => [
      ...prev,
      { kind: 'user', id: nextId(), text },
      { kind: 'assistant', id: assistantId, text: '', tools: [], changeSetIds: [], thinking: false, streaming: true },
    ]);
    setInput('');
    setStreaming(true);
    haptics.light();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    streamChatMessage(
      { message: text, history },
      {
        onToken: (tk) => patchAssistant(assistantId, (a) => ({ ...a, text: a.text + tk, thinking: false })),
        onThinking: () => patchAssistant(assistantId, (a) => ({ ...a, thinking: a.text === '' })),
        onTool: (e) =>
          patchAssistant(assistantId, (a) => {
            const tools = [...a.tools];
            if (e.phase === 'start') {
              tools.push({ name: e.name, info: e.info ?? '', done: false });
            } else {
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].name === e.name && !tools[i].done) {
                  tools[i] = { ...tools[i], done: true, summary: e.summary };
                  break;
                }
              }
            }
            return { ...a, tools, thinking: false };
          }),
        onChangeSet: (cs) => {
          setChangeSets((prev) => ({ ...prev, [cs.id]: cs }));
          patchAssistant(assistantId, (a) => ({ ...a, changeSetIds: [...a.changeSetIds, cs.id] }));
          haptics.select();
        },
        onDone: ({ finalText }) =>
          patchAssistant(assistantId, (a) => ({
            ...a,
            text: finalText || a.text,
            streaming: false,
            thinking: false,
          })),
        onError: (msg) => patchAssistant(assistantId, (a) => ({ ...a, error: msg, streaming: false, thinking: false })),
      },
      ctrl.signal,
    ).finally(() => {
      setStreaming(false);
      abortRef.current = null;
      patchAssistant(assistantId, (a) => ({ ...a, streaming: false, thinking: false }));
    });
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  // ── Change-set actions ──
  const applyChangeSet = async (id: number) => {
    setBusyId(id);
    try {
      const res = await actions.apply.mutateAsync(id);
      setChangeSets((p) => ({ ...p, [id]: res.changeSet }));
      setLatestAppliedId(res.latestAppliedId);
      haptics.success();
      toast.show({
        message: t('console.toast.applied'),
        detail:
          res.affected === 1
            ? t('console.toast.appliedDetail.one', { count: res.affected })
            : t('console.toast.appliedDetail.many', { count: res.affected }),
      });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('console.toast.applyFailed'), detail: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };
  const undoChangeSet = async (id: number) => {
    setBusyId(id);
    try {
      const res = await actions.undo.mutateAsync(id);
      setChangeSets((p) => ({ ...p, [id]: res.changeSet }));
      setLatestAppliedId(res.latestAppliedId);
      haptics.success();
      toast.show({ message: t('console.toast.undone') });
    } catch (e) {
      haptics.warning();
      toast.show({ tone: 'warning', message: t('console.toast.undoFailed'), detail: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };
  const discardChangeSet = async (id: number) => {
    setBusyId(id);
    try {
      const res = await actions.discard.mutateAsync(id);
      setChangeSets((p) => ({ ...p, [id]: res.changeSet }));
    } catch (e) {
      toast.show({ tone: 'warning', message: t('console.toast.discardFailed'), detail: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const renderCard = (id: number) => {
    const cs = changeSets[id];
    if (!cs) return null;
    return (
      <ChangeSetCard
        key={id}
        changeSet={cs}
        canUndo={cs.status === 'applied' && latestAppliedId === cs.id}
        busy={busyId === id}
        onApply={applyChangeSet}
        onUndo={undoChangeSet}
        onDiscard={discardChangeSet}
      />
    );
  };

  const offline = status.error instanceof ApiError && status.error.status === 0;
  const available = status.data?.available ?? true;
  const auditList = useMemo(
    () => Object.values(changeSets).sort((a, b) => b.id - a.id),
    [changeSets],
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <Terminal size={13} className="text-primary" />
            {t('console.eyebrow')}{status.data?.model ? ` · ${status.data.model}` : ''}
          </span>
        }
        title={t('console.title')}
        action={
          <div className="flex items-center gap-1">
            {auditList.length > 0 && (
              <IconButton label={t('console.historyAria')} onClick={() => setAuditOpen(true)}>
                <HistoryIcon size={20} />
              </IconButton>
            )}
            <Link to="/einstellungen">
              <IconButton label={t('console.settingsAria')}>
                <Settings2 size={20} />
              </IconButton>
            </Link>
          </div>
        }
      />

      {offline ? (
        <NoticeCard icon={<WifiOff size={20} />} title={t('console.offline.title')} tone="accent">
          {t('console.offline.detail')}
        </NoticeCard>
      ) : !available ? (
        <NoticeCard icon={<KeyRound size={20} />} title={t('console.unconfigured.title')} tone="warn">
          {t('console.unconfigured.detail')}
        </NoticeCard>
      ) : null}

      {/* Transcript */}
      <div className="min-h-[40vh] space-y-5 pb-2">
        {entries.length === 0 ? (
          available && !offline && <ConsoleEmptyState onPick={(tk) => { setInput(tk); textareaRef.current?.focus(); }} />
        ) : (
          entries.map((e) =>
            e.kind === 'user' ? (
              <UserTurn key={e.id} text={e.text} />
            ) : (
              <AssistantTurn key={e.id} entry={e} renderCard={renderCard} />
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — floats above the tab bar */}
      {available && !offline && (
        <div
          className="sticky z-30 -mx-4 px-4 pb-1 pt-2"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
        >
          <div className="glass flex items-end gap-2 rounded-2xl p-2 ring-1 ring-line shadow-raised">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={t('console.placeholder')}
              spellCheck={false}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none no-scrollbar"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
              }}
            />
            {streaming ? (
              <button
                onClick={stop}
                aria-label={t('console.stopAria')}
                className="press grid size-10 shrink-0 place-items-center rounded-xl bg-surface2 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Square size={16} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!input.trim()}
                aria-label={t('console.sendAria')}
                className="press grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <p className="px-1 pt-1 text-center font-mono text-[10.5px] text-ink-faint">
            {t('console.composerHint')}
          </p>
        </div>
      )}

      {/* Audit log */}
      <Sheet open={auditOpen} onClose={() => setAuditOpen(false)} title={t('console.audit.title')} subtitle={t('console.audit.subtitle')} size="lg">
        <div className="space-y-2 pb-2">
          {auditList.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">{t('console.audit.empty')}</p>
          ) : (
            auditList.map((cs) => <AuditRow key={cs.id} cs={cs} latestAppliedId={latestAppliedId} />)
          )}
        </div>
      </Sheet>
    </>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function UserTurn({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 select-none font-mono text-[14px] font-bold text-primary" aria-hidden>
        ›
      </span>
      <p className="flex-1 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

function AssistantTurn({
  entry,
  renderCard,
}: {
  entry: AssistantEntry;
  renderCard: (id: number) => ReactNode;
}) {
  const t = useT();
  return (
    <div className="space-y-2.5 border-l-2 border-hairline pl-3.5">
      {/* Tool log */}
      {entry.tools.length > 0 && (
        <div className="space-y-1">
          {entry.tools.map((tool, i) => {
            const meta = TOOL_KEYS[tool.name];
            const Icon = meta?.Icon ?? Database;
            const verb = meta ? t(meta.verbKey) : tool.name;
            return (
              <div key={i} className="flex items-center gap-2 font-mono text-[11.5px] text-ink-faint">
                <Icon size={12} className={cx(tool.done ? 'text-ink-faint' : 'text-primary')} />
                <span className="text-ink-muted">{verb}</span>
                {tool.info && tool.name === 'run_read_query' && (
                  <span className="truncate opacity-70">{tool.info.replace(/\s+/g, ' ').slice(0, 60)}</span>
                )}
                {tool.summary && <span className="text-ink-faint">· {tool.summary}</span>}
                {!tool.done && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Thinking indicator */}
      {entry.thinking && entry.text === '' && (
        <p className="flex items-center gap-1.5 text-[13px] text-ink-faint">
          <span className="size-1.5 animate-pulse rounded-full bg-ink-faint" /> {t('console.thinking')}
        </p>
      )}

      {/* Text */}
      {entry.text && (
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
          {entry.text}
          {entry.streaming && <span className="ml-0.5 inline-block h-[1.05em] w-[2px] -translate-y-[1px] animate-pulse bg-primary align-middle" />}
        </p>
      )}

      {/* Change sets */}
      {entry.changeSetIds.length > 0 && (
        <div className="space-y-2.5 pt-0.5">{entry.changeSetIds.map((id) => renderCard(id))}</div>
      )}

      {/* Error */}
      {entry.error && (
        <p className="rounded-lg bg-bad/10 px-2.5 py-1.5 font-mono text-[12px] text-bad">{entry.error}</p>
      )}
    </div>
  );
}

const AUDIT_STATUS: Record<ChangeSetStatus, string> = {
  proposed: 'text-accent',
  applied: 'text-good',
  undone: 'text-ink-muted',
  discarded: 'text-ink-faint',
};

function AuditRow({ cs, latestAppliedId }: { cs: ChangeSet; latestAppliedId: number | null }) {
  const t = useT();
  return (
    <div className="rounded-xl bg-surface2/50 px-3 py-2.5 ring-1 ring-hairline">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-ink-faint">#{cs.id}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{cs.title}</span>
        <span className={cx('font-mono text-[11px]', AUDIT_STATUS[cs.status])}>{cs.status}</span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
        {cs.createdAt.slice(0, 16).replace('T', ' ')} ·{' '}
        {cs.affected === 1
          ? t('console.audit.rows.one', { count: cs.affected })
          : t('console.audit.rows.many', { count: cs.affected })}
        {cs.status === 'applied' && latestAppliedId === cs.id && ` · ${t('console.audit.reversible')}`}
      </p>
    </div>
  );
}

function NoticeCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: 'accent' | 'warn';
  children: ReactNode;
}) {
  return (
    <div className={cx('mb-4 flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1', tone === 'warn' ? 'ring-warn/40' : 'ring-accent/40')}>
      <span className={cx('mt-0.5 shrink-0', tone === 'warn' ? 'text-warn' : 'text-accent')}>{icon}</span>
      <div className="flex-1 text-sm">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{children}</p>
      </div>
    </div>
  );
}