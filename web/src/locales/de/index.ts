/**
 * German catalog — the source of truth for message keys.
 *
 * Namespaces are split into files purely for readability and are merged flat
 * here, so call sites just use the fully-qualified key (`t('nav.today')`) and
 * never need to know which file it lives in. Adding a namespace = import it and
 * spread it in.
 *
 * Keys must be unique across namespaces. A duplicate would be silently
 * shadowed by the later spread, so keep the `namespace.thing` prefix
 * convention: `nav.*`/`action.*` in common, `metric.*` in metrics, one prefix
 * per screen elsewhere.
 */
import { common } from './common';
import { metrics } from './metrics';
import { screens } from './screens';

export const de = {
  ...common,
  ...metrics,
  ...screens,
} as const;

/**
 * Catalog shape: every key German defines, mapped to a plain `string`.
 *
 * Deliberately widened from `typeof de`. The namespace files use `as const`, so
 * `typeof de` would carry the German *literal* types ("Heute" and friends) —
 * annotating the English catalog with that would demand it repeat the German
 * text verbatim. Mapping the values to `string` keeps the key check (the part
 * that matters) while letting translations differ.
 */
export type Messages = { [K in keyof typeof de]: string };
