import makeWASocket, { useMultiFileAuthState, DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Baileys-Singleton-Wrapper für WhatsApp-Web. **Modul-Level-State** statt
 * Klasse — bewusst einfach gehalten: ein Socket, ein Status, keine Factory.
 *
 * Lifecycle:
 *   connect()      idempotent, dedupliziert parallele Aufrufe, never throws
 *   disconnect()   endet den Socket, löscht KEINE Creds (re-connect möglich)
 *   reconnect()    disconnect + wipe sessionPath + connect (kompletter Neustart)
 *
 * Persistenz: Baileys' `useMultiFileAuthState(sessionPath)` schreibt Creds in
 * `<sessionPath>/creds.json` + einzelne Signal-Identity-Files. Wir frischen
 * den Pfad nicht zur Laufzeit nach — `config.whatsapp.sessionPath` ist beim
 * Boot einmal aufgelöst.
 *
 * Auth: Der WhatsApp-Web-Socket authentifiziert sich gegen die
 * WhatsApp-Server per QR-Code (Telefon scannt mit der WA-App). Eine einmal
 * erfolgreiche Anmeldung persistiert die Creds, sodass Folge-Starts ohne
 * QR-Code direkt wiederverbinden.
 */

export type WhatsappConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WhatsappStatus {
  state: WhatsappConnectionState;
  hasCreds: boolean;
  lastConnectedAt: string | null;
  lastQrAt: string | null;
  lastError: string | null;
  configured: boolean;
  /** Unsere eigene JID (z. B. "4917012345678:42@s.whatsapp.net"), sobald gepaart. */
  jid: string | null;
}

/** Wird geworfen, wenn `sendText`/`sendVoiceNote` ohne aktive Verbindung aufgerufen wird. */
export class WhatsappNotConnectedError extends Error {
  constructor() {
    super('WhatsApp ist nicht verbunden');
    this.name = 'WhatsappNotConnectedError';
  }
}

/** Wrappt jeden Sendefehler (Netzwerk, ungültige JID, Media-Upload-Fehler). */
export class WhatsappSendError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'WhatsappSendError';
  }
}

// Modul-State ---------------------------------------------------------------

let sock: WASocket | null = null;
let state: WhatsappConnectionState = 'disconnected';
let lastQr: string | null = null;
let lastConnectedAt: string | null = null;
let lastQrAt: string | null = null;
let lastError: string | null = null;
let jid: string | null = null;
let connectPromise: Promise<void> | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

async function hasCredsFile(): Promise<boolean> {
  try {
    await fs.access(path.join(config.whatsapp.sessionPath, 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Startet den WhatsApp-Socket. **Idempotent**: während eines laufenden
 * Verbindungsaufbaus wird die bestehende Promise zurückgegeben; im Zustand
 * `connected` ein No-Op. Event-Handler-Fehler werden intern gesetzt und
 * niemals herausgeworfen — `connect()` selbst resolved immer.
 */
export function connect(): Promise<void> {
  if (state === 'connected') return Promise.resolve();
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    state = 'connecting';
    lastError = null;
    try {
      await fs.mkdir(config.whatsapp.sessionPath, { recursive: true });
      const { state: authState, saveCreds } = await useMultiFileAuthState(config.whatsapp.sessionPath);
      const socket = makeWASocket({
        auth: authState,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['meDiary', 'Chrome', '1.0'],
      });
      sock = socket;

      socket.ev.on('connection.update', async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;
          if (qr) {
            lastQr = qr;
            lastQrAt = nowISO();
            state = 'qr';
          }
          if (connection === 'open') {
            state = 'connected';
            lastConnectedAt = nowISO();
            jid = socket.user?.id ?? null;
            lastError = null;
          }
          if (connection === 'close') {
            const boom = lastDisconnect?.error as Boom | undefined;
            const statusCode = boom?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;
            if (loggedOut) {
              state = 'disconnected';
              jid = null;
              // Kein auto-reconnect bei loggedOut — der Nutzer muss erneut scannen.
            } else {
              // Vorübergehende Trennung → automatisch neu verbinden.
              state = 'connecting';
              try {
                sock = null;
                await connect();
              } catch (e) {
                lastError = (e as Error).message;
              }
            }
            if (boom) lastError = boom.message ?? lastError;
          }
        } catch (e) {
          lastError = (e as Error).message;
        }
      });

      socket.ev.on('creds.update', saveCreds);
    } catch (e) {
      lastError = (e as Error).message;
      state = 'disconnected';
      throw e;
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}

/**
 * Beendet den Socket sauber (`end(undefined)`) und resettet den State auf
 * `disconnected`. **Löscht die Creds NICHT** — Folge-`connect()` reused sie.
 */
export async function disconnect(): Promise<void> {
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {
      lastError = (e as Error).message;
    }
    sock = null;
  }
  state = 'disconnected';
  // jid bleibt für die UI sichtbar bis zum nächsten connect();
}

/**
 * Harter Neustart: disconnect + kompletter Wipe der Session-Daten + connect.
 * Nützlich, wenn der Nutzer „neu einloggen" möchte (z. B. anderer Account).
 */
export async function reconnect(): Promise<void> {
  await disconnect();
  await fs.rm(config.whatsapp.sessionPath, { recursive: true, force: true });
  lastQr = null;
  lastQrAt = null;
  jid = null;
  await connect();
}

/**
 * Sendet eine Textnachricht. Wirft `WhatsappNotConnectedError`, wenn der
 * Socket nicht im Zustand `connected` ist; jeder andere Fehler wird in
 * `WhatsappSendError` gewrappt.
 */
export async function sendText(jidTarget: string, text: string): Promise<void> {
  if (state !== 'connected' || !sock) throw new WhatsappNotConnectedError();
  try {
    await sock.sendMessage(jidTarget, { text });
  } catch (e) {
    throw new WhatsappSendError(`WhatsApp sendText fehlgeschlagen: ${(e as Error).message}`);
  }
}

/**
 * Sendet eine Voice-Note (Opus-in-Ogg, `ptt:true`). WhatsApp verlangt für
 * Voice-Notes genau dieses Format; der Aufrufer liefert bereits fertig
 * transcodierten Opus-Ogg (siehe `elevenlabs.mp3ToOpusOgg` + `ffmpeg.ts`).
 */
export async function sendVoiceNote(jidTarget: string, oggBuffer: Buffer): Promise<void> {
  if (state !== 'connected' || !sock) throw new WhatsappNotConnectedError();
  try {
    await sock.sendMessage(jidTarget, {
      audio: oggBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    });
  } catch (e) {
    throw new WhatsappSendError(`WhatsApp sendVoiceNote fehlgeschlagen: ${(e as Error).message}`);
  }
}

/** Aktueller Zustand für UI/API. `configured` = enabled-Flag + Creds-Datei vorhanden. */
export async function getStatus(): Promise<WhatsappStatus> {
  return {
    state,
    hasCreds: await hasCredsFile(),
    lastConnectedAt,
    lastQrAt,
    lastError,
    configured: !!config.whatsapp.enabled && (await hasCredsFile()),
    jid,
  };
}

/**
 * Liefert den aktuell anstehenden QR-Code als PNG-Data-URL (mit
 * `data:image/png;base64,`-Prefix) oder null, wenn keiner anliegt.
 * Der QR wechselt bei jeder Verbindung; der Aufrufer sollte ihn regelmäßig
 * pollen, solange `state === 'qr'` ist.
 */
export async function currentQrPng(): Promise<string | null> {
  if (state !== 'qr' || !lastQr) return null;
  return qrcode.toDataURL(lastQr, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

/**
 * Wandelt eine Telefonnummer in eine WhatsApp-JID. Strippt alles außer
 * Ziffern (Leerzeichen, +, Klammern, Bindestriche), validiert 8–15 Ziffern
 * (E.164-Länge ohne `+`) und hängt `@s.whatsapp.net` an. Wirft bei
 * ungültiger Eingabe.
 */
export function toJid(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Invalid phone for WhatsApp JID');
  }
  return `${digits}@s.whatsapp.net`;
}