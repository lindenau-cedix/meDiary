import { spawn } from 'node:child_process';
import { config } from '../config.js';

/**
 * ffmpeg-Helper für die Traum-Zustellung: transcodiert MP3 (ElevenLabs-Output)
 * in Opus-Ogg (WhatsApp-Sprachnotiz-Format). Bewusst **ohne** `fluent-ffmpeg`
 * — ein `spawn` reicht, vermeidet eine Extra-Dependency, und liefert uns den
 * Exit-Code + stderr für saubere Fehlermeldungen.
 *
 * WhatsApp akzeptiert als Voice-Note nur Opus-in-Ogg (codecs=opus, ptt=true).
 * ElevenLabs liefert standardmäßig MP3; deshalb dieser eine Transcode-Step.
 */

/** Wird geworfen, wenn ffmpeg nicht installiert ist (Dockerfile muss es aufnehmen). */
export class FfmpegNotFoundError extends Error {
  constructor() {
    super('ffmpeg nicht installiert (apt: ffmpeg)');
    this.name = 'FfmpegNotFoundError';
  }
}

/**
 * Transcodiert einen MP3-Buffer nach Opus-Ogg (32 kbps VBR). Wirft
 * `FfmpegNotFoundError`, wenn das Binary fehlt; einen generischen Error
 * mit stderr-Tail bei Non-Zero-Exit; einen Timeout-Error bei
 * Überschreitung des Timeouts. Auflösung des Limits:
 * `timeoutMs ?? config.delivery.ffmpegTimeoutMs`.
 */
export function transcodeMp3ToOpusOgg(mp3: Buffer, timeoutMs?: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on',
      '-f', 'ogg', 'pipe:1',
    ];
    const child = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const limit = timeoutMs ?? config.delivery.ffmpegTimeoutMs;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timeout nach ${limit}ms`));
    }, limit);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (e) => {
      clearTimeout(timer);
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') reject(new FfmpegNotFoundError());
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg exit ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-400)}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    child.stdin.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdin.end(mp3);
  });
}