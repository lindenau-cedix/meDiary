/**
 * English screen-level strings — mirrors `../../de/screens/index.ts` file for
 * file. Key coverage is enforced by the `Messages` annotation in `../index.ts`.
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
