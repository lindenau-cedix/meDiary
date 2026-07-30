import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useToast } from './Toaster';
import { Switch, TextInput } from './ui/inputs';
import {
  useWhatsappStatus,
  useWhatsappQr,
  useWhatsappTargets,
  useAddWhatsappTarget,
} from '../lib/queries';
import { api } from '../lib/api';
import { cx } from '../lib/cx';
import { haptics } from '../lib/haptics';
import { activeIntlLocale, useT } from '../lib/i18n';
import type { WhatsappTarget } from '../lib/types';

type State = 'connected' | 'qr' | 'connecting' | 'disconnected';

type StateLabelKey =
  | 'settings.whatsapp.state.connected'
  | 'settings.whatsapp.state.qr'
  | 'settings.whatsapp.state.connecting'
  | 'settings.whatsapp.state.disconnected';

/**
 * Format an ISO/local timestamp in the current locale (e.g. "9. Juni 2026, 14:23"
 * in `de-DE`, "9 June 2026, 14:23" in `en-GB`). Built lazily per call so a
 * language switch takes effect on the next render. Broken input falls back
 * to the raw string so a malformed `lastConnectedAt` doesn't blow up the tile.
 */
function formatStamp(ts: string, intlLocale: string): string {
  const fmt = new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return fmt.format(d);
}

/**
 * Mask a JID ("4917••••••@s.whatsapp.net") so the real phone number never
 * appears in plaintext on screen — same idea as `maskRecipient` in
 * SentDreamDrawer.
 */
function maskJid(jid: string): string {
  const at = jid.indexOf('@');
  const local = at >= 0 ? jid.slice(0, at) : jid;
  const domain = at >= 0 ? jid.slice(at) : '';
  if (local.length <= 4) return jid;
  return `${local.slice(0, 4)}${'•'.repeat(Math.min(6, local.length - 4))}${domain}`;
}

const STATE_META: Record<State, { labelKey: StateLabelKey; pill: string; Icon: typeof Wifi }> = {
  connected: { labelKey: 'settings.whatsapp.state.connected', pill: 'bg-emerald-900/40 text-emerald-300', Icon: Wifi },
  qr: { labelKey: 'settings.whatsapp.state.qr', pill: 'bg-amber-900/40 text-amber-200', Icon: QrCode },
  connecting: { labelKey: 'settings.whatsapp.state.connecting', pill: 'bg-zinc-800 text-zinc-300', Icon: Loader2 },
  disconnected: { labelKey: 'settings.whatsapp.state.disconnected', pill: 'bg-rose-900/40 text-rose-300', Icon: WifiOff },
};

/**
 * Admin panel for the WhatsApp connection. Renders NOTHING when the server
 * reports `adminEnabled=false` — the parent decides whether to mount the panel
 * at all. Deliberately no "admin-only" hint: non-admins never see the panel
 * because it is mounted on the Settings tab and renders nothing there either.
 */
export function AdminWhatsappPanel() {
  const t = useT();
  const intlLocale = activeIntlLocale();
  const toast = useToast();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useWhatsappStatus();
  const state: State | null = status?.state ?? null;
  const isAdmin = status?.adminEnabled === true;

  // QR polling only while the pairing is actually waiting for a QR — otherwise
  // useQuery would spam 404 in the background.
  const { data: qrData } = useWhatsappQr(state === 'qr');
  const { data: targetsResp, isFetching: targetsLoading, refetch: refetchTargets } = useWhatsappTargets(isAdmin);

  const reconnect = useMutation({
    mutationFn: () => api.whatsapp.reconnect(),
    onSuccess: () => {
      toast.show({ message: t('settings.whatsapp.reconnectRequested'), tone: 'info' });
      void refetchStatus();
    },
    onError: (e) =>
      toast.show({
        message: `${t('settings.whatsapp.reconnectFailedPrefix')}${(e as Error).message}`,
        tone: 'warning',
      }),
  });

  const sendTest = useMutation({
    mutationFn: () => api.whatsapp.test(),
    onSuccess: (d) =>
      toast.show({
        message: d.ok
          ? `${t('settings.whatsapp.testSentPrefix')}${d.recipient ?? t('settings.whatsapp.testSentFallbackRecipient')}`
          : t('settings.whatsapp.testFailed'),
        tone: d.ok ? 'success' : 'warning',
        detail: d.ok ? undefined : t('settings.whatsapp.testFailedDetail'),
      }),
    onError: (e) =>
      toast.show({ message: `${t('settings.whatsapp.testErrorPrefix')}${(e as Error).message}`, tone: 'warning' }),
  });

  // Gate: not admin → render nothing.
  if (!isAdmin) return null;

  if (statusLoading || !status) {
    return (
      <div className="rounded-[18px] bg-[#1F1D17] border border-white/5 p-6 flex items-center gap-3 text-ink-muted">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">{t('settings.whatsapp.statusLoading')}</span>
      </div>
    );
  }

  const meta = state ? STATE_META[state] : STATE_META.disconnected;
  const StateIcon = meta.Icon;

  return (
    <section className="rounded-[18px] bg-[#1F1D17] border border-white/5 p-6 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center size-9 rounded-xl bg-[#97A87C]/15 text-[#97A87C]">
            <MessageCircle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[17px] text-[#ECE7DB] leading-tight">{t('settings.whatsapp.title')}</h2>
            <p className="text-[12px] text-white/35 leading-snug">{t('settings.whatsapp.subtitle')}</p>
          </div>
        </div>
        <span
          className={cx(
            'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            meta.pill,
          )}
        >
          <StateIcon size={13} className={cx(state === 'connecting' && 'animate-spin')} />
          {t(meta.labelKey)}
        </span>
      </header>

      {/* Details */}
      <dl className="space-y-1.5 text-[12px]">
        {status.lastConnectedAt && (
          <MetaLine label={t('settings.whatsapp.lastConnected')} value={formatStamp(status.lastConnectedAt, intlLocale)} />
        )}
        {status.jid && (
          <MetaLine label={t('settings.whatsapp.connectedAs')} value={maskJid(status.jid)} mono />
        )}
        {status.lastError && (
          <p className="text-[12px] text-rose-300/80 leading-snug pt-1 whitespace-pre-wrap break-words">
            {status.lastError}
          </p>
        )}
        {!status.configured && !status.lastError && (
          <p className="text-[12px] text-amber-300/80 leading-snug">
            {t('settings.whatsapp.credentialsMissing')}{' '}
            <code className="mx-1 text-amber-200/90">{t('settings.whatsapp.credentialsEnvHint')}</code>
            {t('settings.whatsapp.credentialsSuffix')}
          </p>
        )}
      </dl>

      {/* QR area */}
      {state === 'qr' && (
        <div className="rounded-2xl bg-black/40 ring-1 ring-white/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-[#97A87C]">{t('settings.whatsapp.qrHeading')}</p>
          <div className="mx-auto grid place-items-center bg-white rounded-2xl p-3 w-full max-w-[320px] aspect-square">
            {qrData?.qr ? (
              <img
                src={`data:image/png;base64,${qrData.qr}`}
                alt={t('settings.whatsapp.qrAlt')}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Loader2 size={26} className={animateSpin} />
                <span className="text-xs">{t('settings.whatsapp.qrPreparing')}</span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-white/55 leading-relaxed">
            {t('settings.whatsapp.qrInstructions')}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            haptics.select();
            reconnect.mutate();
          }}
          disabled={reconnect.isPending || state === 'connecting'}
          className="inline-flex items-center gap-1.5 bg-[#97A87C] hover:bg-[#8A9B70] disabled:opacity-50 disabled:pointer-events-none text-[#15140F] font-medium rounded-xl px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97A87C]/60"
        >
          <RefreshCw size={15} className={cx(reconnect.isPending && animateSpin)} />
          {t('settings.whatsapp.reconnect')}
        </button>
        <button
          onClick={() => {
            haptics.select();
            sendTest.mutate();
          }}
          disabled={state !== 'connected' || sendTest.isPending}
          className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none text-[#ECE7DB] rounded-xl px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <Send size={15} className={cx(sendTest.isPending && animateSpin)} />
          {t('settings.whatsapp.testMessage')}
        </button>
      </div>

      {/* Recipients disclosure */}
      <RecipientsSection
        targetsResp={targetsResp}
        loading={targetsLoading}
        onRefresh={() => refetchTargets()}
      />
    </section>
  );
}

const animateSpin = 'animate-spin';

function MetaLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-white/55">
      <dt className="opacity-70">{label}</dt>
      <dd className={cx('text-right tabular', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

/**
 * Collapsible recipients list. Closed by default so the main focus stays on
 * connection status + QR. The add form is inline so no modal is needed.
 */
function RecipientsSection({
  targetsResp,
  loading,
  onRefresh,
}: {
  targetsResp: { targets: WhatsappTarget[] } | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const targets = targetsResp?.targets ?? [];

  return (
    <div className="pt-2 border-t border-white/5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="press w-full flex items-center justify-between gap-2 py-2 text-left text-[13px] text-[#ECE7DB]/85 hover:text-[#ECE7DB] transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t('settings.whatsapp.recipients')}
          <span className="text-[11px] text-white/40">({targets.length})</span>
        </span>
        {loading && <Loader2 size={12} className="animate-spin text-white/40" />}
      </button>

      {open && (
        <div className="pt-2 space-y-3">
          {targets.length === 0 && !loading && (
            <p className="text-[12px] text-white/45">{t('settings.whatsapp.noRecipients')}</p>
          )}
          <ul className="divide-y divide-white/5 rounded-xl bg-black/30 ring-1 ring-white/5 overflow-hidden">
            {targets.map((tgt) => (
              <li key={tgt.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[#ECE7DB] tabular truncate">{tgt.phone}</p>
                  {tgt.display_name && (
                    <p className="text-[11px] text-white/45 truncate">{tgt.display_name}</p>
                  )}
                </div>
                {/* Toggle is a deliberate v1 no-op: no PATCH endpoint on the server. */}
                <span title={t('settings.whatsapp.toggleNotImplementedTitle')} className="inline-flex">
                  <Switch
                    checked={tgt.enabled === 1}
                    onChange={() =>
                      toast.show({
                        message: t('settings.whatsapp.toggleNotImplemented'),
                        detail: t('settings.whatsapp.toggleNotImplementedDetail'),
                        tone: 'warning',
                      })
                    }
                    label={t('settings.whatsapp.recipientActiveAria', { phone: tgt.phone })}
                  />
                </span>
              </li>
            ))}
          </ul>
          <AddRecipientForm onAdded={onRefresh} />
        </div>
      )}
    </div>
  );
}

/**
 * Inline form to create a new recipient. Phone validation runs client-side
 * (8–15 digits after stripping non-digit characters) — the server has the
 * same check, but this saves a roundtrip on typos.
 */
function AddRecipientForm({ onAdded }: { onAdded: () => void }) {
  const t = useT();
  const toast = useToast();
  const add = useAddWhatsappTarget();
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');

  const digits = phone.replace(/[^\d]/g, '');
  const phoneValid = digits.length >= 8 && digits.length <= 15;
  const canSubmit = phoneValid && !add.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    add.mutate(
      { phone: digits, displayName: displayName.trim() || undefined },
      {
        onSuccess: () => {
          toast.show({ message: t('settings.whatsapp.recipientAdded'), tone: 'success' });
          setPhone('');
          setDisplayName('');
          onAdded();
        },
        onError: (err) =>
          toast.show({
            message: t('settings.whatsapp.recipientAddFailed'),
            detail: (err as Error).message,
            tone: 'warning',
          }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-black/30 ring-1 ring-white/5 p-3 space-y-2.5">
      <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
        <TextInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('settings.whatsapp.phonePlaceholder')}
          inputMode="tel"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-10"
        />
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('settings.whatsapp.displayNamePlaceholder')}
          autoCapitalize="words"
          className="h-10"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-1.5 bg-[#97A87C] hover:bg-[#8A9B70] disabled:opacity-50 disabled:pointer-events-none text-[#15140F] font-medium rounded-xl px-4 h-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97A87C]/60"
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {t('settings.whatsapp.add')}
        </button>
      </div>
      <p className="text-[11px] text-white/40 inline-flex items-center gap-1">
        {phone.length > 0 && !phoneValid ? (
          <>
            <AlertTriangle size={11} className="text-amber-300" />
            {t('settings.whatsapp.phoneInvalid')}
          </>
        ) : (
          <>
            {t('settings.whatsapp.phoneHintPrefix')}
            <span className="tabular text-white/55">{t('settings.whatsapp.phonePlaceholder')}</span>
          </>
        )}
      </p>
    </form>
  );
}
