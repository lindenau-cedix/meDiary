export const meta = {
  name: 'review-mediary-changes',
  description: 'Adversarial multi-lens review of the deploy/diary/batch changes',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const REPO = '/var/lib/coding-dashboard/worktrees/b5cf8e03fbbb4309b6a08372b30a3c46'

const CONTEXT = `
You are reviewing uncommitted changes in the meDiary repo at ${REPO}.
Three features were added (read CLAUDE.md/AGENTS.md "Letzte Änderungen" top entry for intent):
  (1) Frontend always reachable: server/src/config.ts auto-detects SERVER_ROOT/web/dist when WEB_DIST unset; deploy.sh defaults WEB_DIST=./web/dist and passes ANTHROPIC_*/DIARY_* through.
  (2) KI diary tab: server/src/lib/anthropic.ts (raw fetch to Anthropic Messages API), server/src/lib/diary.ts (gather notes per consumption-day, .md parse/assemble via <!-- meDiary:day DATE --> markers, generateDiary), server/src/routes/diary.ts (GET /notes, GET /, POST /generate, PUT /), mounted in index.ts. Frontend: web/src/screens/DiaryScreen.tsx, BottomNav tab, App route, queries/api/types diary hooks.
  (3) Multi-substance entry: POST /api/intakes/batch in server/src/routes/intakes.ts (shared takenAt, per-entry amount/notes, shared insertCompanions helper also used by POST /); web/src/screens/QuickEntryScreen.tsx rewritten for multi-select with per-substance fields.

Changed/new files:
  server/src/config.ts, server/src/index.ts, server/src/routes/intakes.ts, deploy.sh, .env.example
  server/src/lib/anthropic.ts (new), server/src/lib/diary.ts (new), server/src/routes/diary.ts (new)
  web/src/App.tsx, web/src/components/BottomNav.tsx, web/src/lib/api.ts, web/src/lib/queries.ts, web/src/lib/types.ts
  web/src/screens/QuickEntryScreen.tsx, web/src/screens/DiaryScreen.tsx (new)

Already verified: server+web tsc exit 0; server tsc build + vite build exit 0; E2E smoke (batch 3 substances + companions + 400s; diary notes/generate(mock)/regenerate/PUT/503) all passed against a /tmp DB.
Focus on REAL bugs, regressions, and correctness/edge-case issues the smoke test would NOT have caught. Do not report style nits or pre-existing issues unrelated to these changes.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          location: { type: 'string', description: 'function/line/region' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          detail: { type: 'string', description: 'what is wrong, why, and concrete repro/impact' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'file', 'location', 'severity', 'detail', 'confidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isReal: { type: 'boolean' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
    suggestedFix: { type: 'string' },
  },
  required: ['isReal', 'severity', 'reason', 'suggestedFix'],
}

const DIMENSIONS = [
  { key: 'diary-backend', prompt: `${CONTEXT}\nLENS: Diary backend correctness. Read server/src/lib/anthropic.ts, server/src/lib/diary.ts, server/src/routes/diary.ts, server/src/config.ts. Hunt edge cases: .md parse/assemble round-trip and manual-edit preservation; scope 'all' vs 'missing' (does 'all' wrongly drop existing entries for days excluded by max? does it preserve manual edits?); date range filtering; consumptionDay grouping; fetch/HTTP/refusal/empty-response error handling; regex marker robustness; what happens when noteworthyDays shrink (deleted notes) — stale entries. Report concrete bugs.` },
  { key: 'batch-backend', prompt: `${CONTEXT}\nLENS: Batch endpoint + insertCompanions refactor. Read server/src/routes/intakes.ts carefully. Verify POST / behaves EXACTLY as before the refactor (companion resolution, createdSubstance detection, source_event_id, transaction boundaries). Verify POST /batch: substance resolution by id vs name, createdSubstance flag, companion dedup/self-reference, transaction atomicity, nightMed computation, that findOrCreateSubstance side-effects outside the transaction are acceptable. Report concrete bugs/regressions.` },
  { key: 'frontend', prompt: `${CONTEXT}\nLENS: Frontend correctness/UX. Read web/src/screens/QuickEntryScreen.tsx, web/src/screens/DiaryScreen.tsx, web/src/lib/queries.ts, web/src/lib/api.ts, web/src/lib/types.ts. Hunt: multi-select state edge cases (a selected substance gets archived/removed from list; fields map cleanup; takenAt persistence after submit; assessment-trigger after batch; undo removing companions); DiaryScreen generate/edit state (useEffect deps, draft staleness, window.confirm in Capacitor); query invalidation keys; type mismatches with the API responses. Report concrete bugs.` },
  { key: 'config-deploy', prompt: `${CONTEXT}\nLENS: Config + deploy. Read server/src/config.ts, deploy.sh, .env.example, mediary.service. Verify webDist auto-detect across dev (tsx), build (dist), and npm start; verify deploy.sh WEB_DIST default + new env passthrough won't break the marker injection or the existing sanity-check; any security concern with ANTHROPIC_API_KEY in the systemd unit (expected for a private deploy). Report concrete bugs/regressions.` },
]

const reviews = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, d) =>
    parallel(
      (review?.findings ?? []).map((f) => () =>
        agent(
          `${CONTEXT}\nAdversarially verify this finding. Read the actual code at ${REPO} and try to REFUTE it. A finding is only real if it is a genuine bug/regression introduced by these changes (not pre-existing, not style, not a non-issue). Default isReal=false if uncertain.\n\nFINDING (lens ${d.key}):\n${JSON.stringify(f, null, 2)}`,
          { label: `verify:${d.key}:${(f.title || '').slice(0, 30)}`, phase: 'Verify', schema: VERDICT_SCHEMA },
        ).then((v) => ({ finding: f, verdict: v, lens: d.key })),
      ),
    ),
)

const confirmed = reviews
  .flat()
  .filter(Boolean)
  .filter((r) => r.verdict?.isReal)
  .map((r) => ({ lens: r.lens, ...r.finding, verifiedSeverity: r.verdict.severity, reason: r.verdict.reason, suggestedFix: r.verdict.suggestedFix }))

const allFindings = reviews.flat().filter(Boolean).length
return { totalRaw: allFindings, confirmedCount: confirmed.length, confirmed }
