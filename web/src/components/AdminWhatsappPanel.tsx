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
import type { WhatsappTarget } from '../lib/types';

/**
 * Formatiert einen ISO-/Local-String im de-DE-Look ("9. Juni 2026, 14:23").
 * Kaputter Input → Roh-String, damit eine fehlerhafte `lastConnectedAt`
 * nicht die ganze Kachel sprengt.
 */
const stampFmt = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
function formatStamp(ts: string): string {
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return stampFmt.format(d);
}

/**
 * JID maskieren ("4917••••••@s.whatsapp.net"), damit die echte Telefonnummer
 * nicht im Klartext auf dem Bildschirm steht — gleiche Idee wie `maskRecipient`
 * im SentDreamDrawer.
 */
function maskJid(jid: string): string {
  const at = jid.indexOf('@');
  const local = at >= 0 ? jid.slice(0, at) : jid;
  const domain = at >= 0 ? jid.slice(at) : '';
  if (local.length <= 4) return jid;
  return `${local.slice(0, 4)}${'•'.repeat(Math.min(6, local.length - 4))}${domain}`;
}

type State = 'connected' | 'qr' | 'connecting' | 'disconnected';

const STATE_META: Record<State, { label: string; pill: string; Icon: typeof Wifi }> = {
  connected: { label: 'Verbunden', pill: 'bg-emerald-900/40 text-emerald-300', Icon: Wifi },
  qr: { label: 'Pairing erforderlich', pill: 'bg-amber-900/40 text-amber-200', Icon: QrCode },
  connecting: { label: 'Verbinde …', pill: 'bg-zinc-800 text-zinc-300', Icon: Loader2 },
  disconnected: { label: 'Nicht verbunden', pill: 'bg-rose-900/40 text-rose-300', Icon: WifiOff },
};

/**
 * Admin-Panel für die WhatsApp-Verbindung. Rendert NICHTS, wenn der Server
 * `adminEnabled=false` meldet — der Parent entscheidet, ob er das Panel
 * überhaupt einbindet. Bewusst kein "Admin-only"-Hinweis: Nicht-Admins
 * sehen das Panel nie, weil es auf den Settings-Tab gemountet ist und
 * dort ebenfalls nichts anzeigt.
 */
export function AdminWhatsappPanel() {
  const toast = useToast();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useWhatsappStatus();
  const state: State | null = status?.state ?? null;
  const isAdmin = status?.adminEnabled === true;

  // QR-Polling nur, wenn das Pairing tatsächlich auf einen QR wartet —
  // sonst würde useQuery im Hintergrund ständig 404 produzieren.
  const { data: qrData } = useWhatsappQr(state === 'qr');
  const { data: targetsResp, isFetching: targetsLoading, refetch: refetchTargets } = useWhatsappTargets(isAdmin);

  const reconnect = useMutation({
    mutationFn: () => api.whatsapp.reconnect(),
    onSuccess: () => {
      toast.show({ message: 'Reconnect angefordert', tone: 'info' });
      void refetchStatus();
    },
    onError: (e) => toast.show({ message: `Reconnect fehlgeschlagen: ${(e as Error).message}`, tone: 'warning' }),
  });

  const sendTest = useMutation({
    mutationFn: () => api.whatsapp.test(),
    onSuccess: (d) =>
      toast.show({
        message: d.ok ? `Testnachricht gesendet an ${d.recipient ?? 'Empfänger'}` : 'Testnachricht fehlgeschlagen',
        tone: d.ok ? 'success' : 'warning',
        detail: d.ok ? undefined : 'Server hat die Testnachricht quittiert, aber als nicht-ok markiert.',
      }),
    onError: (e) => toast.show({ message: `Test fehlgeschlagen: ${(e as Error).message}`, tone: 'warning' }),
  });

  // Gate: kein Admin → nichts rendern.
  if (!isAdmin) return null;

  if (statusLoading || !status) {
    return (
      <div className="rounded-[18px] bg-[#1F1D17] border border-white/5 p-6 flex items-center gap-3 text-ink-muted">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">WhatsApp-Status wird geladen …</span>
      </div>
    );
  }

  const meta = state ? STATE_META[state] : STATE_META.disconnected;
  const StateIcon = meta.Icon;

  return (
    <section className="rounded-[18px] bg-[#1F1D17] border border-white/5 p-6 space-y-5">
      {/* Kopf */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center size-9 rounded-xl bg-[#97A87C]/15 text-[#97A87C]">
            <MessageCircle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[17px] text-[#ECE7DB] leading-tight">WhatsApp-Verbindung</h2>
            <p className="text-[12px] text-white/35 leading-snug">
              Pairing, Test-Versand und Empfänger für die nächtlichen Traum-Zustellungen.
            </p>
          </div>
        </div>
        <span
          className={cx(
            'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            meta.pill,
          )}
        >
          <StateIcon size={13} className={cx(state === 'connecting' && 'animate-spin')} />
          {meta.label}
        </span>
      </header>

      {/* Details */}
      <dl className="space-y-1.5 text-[12px]">
        {status.lastConnectedAt && (
          <MetaLine label="Zuletzt verbunden" value={formatStamp(status.lastConnectedAt)} />
        )}
        {status.jid && <MetaLine label="Verbunden als" value={maskJid(status.jid)} mono />}
        {status.lastError && (
          <p className="text-[12px] text-rose-300/80 leading-snug pt-1 whitespace-pre-wrap break-words">
            {status.lastError}
          </p>
        )}
        {!status.configured && !status.lastError && (
          <p className="text-[12px] text-amber-300/80 leading-snug">
            Auf dem Server sind keine WhatsApp-Credentials konfiguriert. Reconnect ist wirkungslos, bis die
            <code className="mx-1 text-amber-200/90">WHATSAPP_*</code>-Umgebungsvariablen gesetzt sind.
          </p>
        )}
      </dl>

      {/* QR-Bereich */}
      {state === 'qr' && (
        <div className="rounded-2xl bg-black/40 ring-1 ring-white/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-[#97A87C]">In 60 Sekunden scannen</p>
          <div className="mx-auto grid place-items-center bg-white rounded-2xl p-3 w-full max-w-[320px] aspect-square">
            {qrData?.qr ? (
              <img
                src={`data:image/png;base64,${qrData.qr}`}
                alt="WhatsApp QR-Code"
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Loader2 size={26} className={animateSpin} />
                <span className="text-xs">QR wird vorbereitet …</span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-white/55 leading-relaxed">
            WhatsApp auf dem Telefon → <span className="text-[#ECE7DB]/85">Einstellungen</span> →{' '}
            <span className="text-[#ECE7DB]/85">Verknüpfte Geräte</span> →{' '}
            <span className="text-[#ECE7DB]/85">Gerät hinzufügen</span>. QR-Code innerhalb von 60 Sekunden scannen —
            erneuert sich automatisch.
          </p>
        </div>
      )}

      {/* Aktions-Buttons */}
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
          Neu verbinden
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
          Testnachricht
        </button>
      </div>

      {/* Empfänger-Disclosure */}
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
 * Auf-/zuklappbare Empfängerliste. Default zu, damit der Hauptfokus auf
 * Connection-Status + QR liegt. Add-Form ist inline, damit kein Modal nötig ist.
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
          Empfänger verwalten
          <span className="text-[11px] text-white/40">({targets.length})</span>
        </span>
        {loading && <Loader2 size={12} className="animate-spin text-white/40" />}
      </button>

      {open && (
        <div className="pt-2 space-y-3">
          {targets.length === 0 && !loading && (
            <p className="text-[12px] text-white/45">Noch keine Empfänger angelegt.</p>
          )}
          <ul className="divide-y divide-white/5 rounded-xl bg-black/30 ring-1 ring-white/5 overflow-hidden">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[#ECE7DB] tabular truncate">{t.phone}</p>
                  {t.display_name && (
                    <p className="text-[11px] text-white/45 truncate">{t.display_name}</p>
                  )}
                </div>
                {/* Toggle ist v1 absichtlich ein No-Op: kein PATCH-Endpoint am Server. */}
                <span title="Toggle noch nicht implementiert — direkt in der DB ändern" className="inline-flex">
                  <Switch
                    checked={t.enabled === 1}
                    onChange={() =>
                      toast.show({
                        message: 'Toggle noch nicht implementiert',
                        detail: 'Empfänger direkt in der DB aktivieren/deaktivieren.',
                        tone: 'warning',
                      })
                    }
                    label={`Empfänger ${t.phone} aktiv`}
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
 * Inline-Form zum Anlegen eines neuen Empfängers. Phone-Validierung läuft
 * clientseitig (8–15 Ziffern nach Stripping nicht-Ziffern-Zeichen) — der
 * Server hat denselben Check, aber das spart einen Roundtrip bei Tippfehlern.
 */
function AddRecipientForm({ onAdded }: { onAdded: () => void }) {
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
          toast.show({ message: 'Empfänger angelegt', tone: 'success' });
          setPhone('');
          setDisplayName('');
          onAdded();
        },
        onError: (err) =>
          toast.show({
            message: 'Empfänger konnte nicht angelegt werden',
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
          placeholder="+4917…"
          inputMode="tel"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-10"
        />
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Anzeigename (optional)"
          autoCapitalize="words"
          className="h-10"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-1.5 bg-[#97A87C] hover:bg-[#8A9B70] disabled:opacity-50 disabled:pointer-events-none text-[#15140F] font-medium rounded-xl px-4 h-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97A87C]/60"
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Hinzufügen
        </button>
      </div>
      <p className="text-[11px] text-white/40 inline-flex items-center gap-1">
        {phone.length > 0 && !phoneValid ? (
          <>
            <AlertTriangle size={11} className="text-amber-300" />
            Phone braucht 8–15 Ziffern (mit oder ohne +).
          </>
        ) : (
          <>
            E.164 mit oder ohne „+". Beispiel: <span className="tabular text-white/55">+4917…</span>
          </>
        )}
      </p>
    </form>
  );
}
