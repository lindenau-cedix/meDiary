import { config } from '../config.js';
import { transcodeMp3ToOpusOgg } from './ffmpeg.js';

/**
 * ElevenLabs-Client für die Traum-Zustellung: synthetisiert die Auswertung
 * zu MP3 (ElevenLabs liefert kein Opus), dann transkodiert ffmpeg zu
 * Opus-Ogg (WhatsApp-Voice-Note-Format). Pattern analog zu `minimax.ts` und
 * `anthropic.ts`: `available()` + eine einzige `synthesize()`-Funktion mit
 * AbortController + Timeout, typed Errors am Rand.
 *
 * Endpunkt:  POST {baseUrl}/v1/text-to-speech/{voiceId}?output_format=…
 * Header:    xi-api-key, content-type, Accept: audio/mpeg
 * Modell:    config.elevenlabs.model (Default eleven_multilingual_v2)
 *
 * Fehlerfälle:
 *   - 404 Voice nicht gefunden → ElevenLabsVoiceNotFoundError
 *   - sonstige HTTP-Fehler   → ElevenLabsError mit Status + Body-Tail
 *   - Timeout                → wirft als AbortError, der Aufrufer retryt
 *   - leerer Body            → wirft ElevenLabsError
 */

/** Wird geworfen, wenn kein API-Key + Voice-ID konfiguriert ist. */
export class ElevenLabsNotConfiguredError extends Error {
  constructor() {
    super('ElevenLabs API-Key fehlt (ELEVENLABS_API_KEY)');
    this.name = 'ElevenLabsNotConfiguredError';
  }
}

/** Wird geworfen, wenn die konfigurierte Voice-ID 404 zurückliefert. */
export class ElevenLabsVoiceNotFoundError extends Error {
  constructor(msg = 'ElevenLabs: Voice nicht gefunden') {
    super(msg);
    this.name = 'ElevenLabsVoiceNotFoundError';
  }
}

/** Generischer ElevenLabs-Fehler (HTTP != 200, leerer Body, Netzwerk). */
export class ElevenLabsError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ElevenLabsError';
  }
}

/** True, wenn ein API-Key UND eine Voice-ID hinterlegt sind. */
export function elevenlabsAvailable(): boolean {
  return !!config.elevenlabs.apiKey && !!config.elevenlabs.voiceId;
}

export interface SynthesizeOpts {
  text: string;
  signal?: AbortSignal;
}

/**
 * Synthetisiert `text` per ElevenLabs zu MP3 und liefert den MP3-Buffer zurück.
 * Wandelt NICHT in Opus-Ogg — die Konversion übernimmt der Aufrufer via
 * `mp3ToOpusOgg()` (so kann die Text-Pipeline den MP3-Stand cachen/testen).
 */
export async function synthesize({ text, signal }: SynthesizeOpts): Promise<Buffer> {
  if (!elevenlabsAvailable()) throw new ElevenLabsNotConfiguredError();

  const url = `${config.elevenlabs.baseUrl}/v1/text-to-speech/${config.elevenlabs.voiceId}?output_format=${config.elevenlabs.outputFormat}`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), config.elevenlabs.timeoutMs);
  const onCallerAbort = () => ac.abort();
  if (signal) signal.addEventListener('abort', onCallerAbort);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenlabs.apiKey!,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: config.elevenlabs.model }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 404) {
        throw new ElevenLabsVoiceNotFoundError(
          `ElevenLabs 404 für Voice ${config.elevenlabs.voiceId}: ${body.slice(0, 200)}`,
        );
      }
      throw new ElevenLabsError(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Convenience-Wrapper: transkodiert MP3 → Opus-Ogg via ffmpeg.
 * Wird vom WhatsApp-Sender direkt aufgerufen; hier nur exportiert, damit die
 * Traum-Delivery-Schicht `synthesize` + `mp3ToOpusOgg` aus einer Hand kriegt.
 */
export async function mp3ToOpusOgg(mp3: Buffer): Promise<Buffer> {
  return transcodeMp3ToOpusOgg(mp3);
}