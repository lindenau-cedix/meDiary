import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** server/ root directory (one level up from src/) */
export const SERVER_ROOT = path.resolve(__dirname, '..');

/** Default data directory: ~/.local/share/mediary */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.local', 'share', 'mediary');

function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(SERVER_ROOT, p);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * Database path. Default: ~/.local/share/mediary/data/mediary.db
   * When WEB_DIST is set, the DB dir is auto-created if it doesn't exist.
   */
  dbPath: (() => {
    if (process.env.DB_PATH) return resolveFromRoot(process.env.DB_PATH);
    return path.join(DEFAULT_DATA_DIR, 'data', 'mediary.db');
  })(),
  /**
   * DEFAULTS.md path. Default: ~/.local/share/mediary/DEFAULTS.md
   * Falls一辈子 der Server als root läuft, gilt immernoch das Home des
   * startenden Users – systemd setzt via User= den richtigen.
   */
  defaultsPath: (() => {
    if (process.env.DEFAULTS_PATH) return resolveFromRoot(process.env.DEFAULTS_PATH);
    return path.join(DEFAULT_DATA_DIR, 'DEFAULTS.md');
  })(),
  /** Optional path to a built web frontend (web/dist) to serve statically. */
  webDist: process.env.WEB_DIST ? resolveFromRoot(process.env.WEB_DIST) : null,
};
