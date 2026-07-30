/**
 * English catalog.
 *
 * The `Messages` annotation is the safety net for the whole i18n layer: it
 * forces this object to cover exactly the keys the German catalog defines.
 * Forget a key and the type check fails; invent one that German lacks and it
 * fails too. That is why `de` stays the catalog of record — translations can
 * never silently drift out of sync with it.
 */
import type { Messages } from '../de';
import { common } from './common';
import { metrics } from './metrics';
import { screens } from './screens';

export const en: Messages = {
  ...common,
  ...metrics,
  ...screens,
};
