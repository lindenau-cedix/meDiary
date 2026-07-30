/**
 * German screen-level strings, one file per screen.
 *
 * Split this finely on purpose: each screen owns its own file, so the catalog
 * stays navigable and two people (or two agents) editing different screens
 * never touch the same file.
 *
 * Key prefixes are namespaced per file (`quickEntry.*`, `history.*`, …) because
 * everything is merged flat below — a duplicate key across two files would be
 * silently shadowed by whichever spread comes last.
 */
import { quickEntry } from './quickEntry';
import { history } from './history';
import { diary } from './diary';
import { plan } from './plan';
import { trends } from './trends';
import { stats } from './stats';
import { settings } from './settings';
import { console_ } from './console';
import { defaults } from './defaults';
import { components } from './components';

export const screens = {
  ...quickEntry,
  ...history,
  ...diary,
  ...plan,
  ...trends,
  ...stats,
  ...settings,
  ...console_,
  ...defaults,
  ...components,
} as const;
