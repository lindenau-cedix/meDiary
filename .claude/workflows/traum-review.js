export const meta = {
  name: 'traum-review',
  description: 'Adversarial multi-lens review of the nightly-dream feature (server + frontend + design/a11y)',
  phases: [
    { title: 'Review' },
    { title: 'Verify' },
  ],
}

const REPO = '/home/ubuntu/meDiary'

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
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          location: { type: 'string', description: 'function/line/snippet anchor' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'what is wrong and why it matters / how it triggers' },
          suggestedFix: { type: 'string' },
        },
        required: ['severity', 'file', 'location', 'title', 'detail', 'suggestedFix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    real: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'not-a-bug'] },
  },
  required: ['real', 'confidence', 'reason', 'adjustedSeverity'],
}

const context = `
Repo: ${REPO}. Feature just implemented: nightly "dreaming" — at 04:20 Europe/Berlin the server sends system_prompt.md (system) + a built DB context (user) to MiniMax M3 (OpenAI-compatible /v1/chat/completions) and stores the result as a "dream" per consumption-day. Plus a Traum tab (history) replacing the old "Voll" diary tab, "Kurz"->"Info" rename, and a startup dialog showing the latest dream once per session.

Key new/changed files:
SERVER: server/src/config.ts (minimax+dream config, findSystemPromptPath), server/src/db.ts (dreams table + helpers near bottom + CREATE TABLE), server/src/lib/minimax.ts (NEW), server/src/lib/dreams.ts (NEW), server/src/lib/dream_scheduler.ts (NEW), server/src/routes/dreams.ts (NEW), server/src/index.ts (mount + startDreamScheduler), server/src/dream.ts (CLI), server/src/lib/serialize.ts (serializeDream).
WEB: web/src/index.css (night palette + keyframes + reduced-motion), web/src/screens/DiaryScreen.tsx (rewrite: Info/Traum), web/src/components/DreamProse.tsx (NEW md renderer), web/src/components/Starfield.tsx (NEW), web/src/components/DreamStartupDialog.tsx (NEW), web/src/components/AppShell.tsx (mounts dialog), web/src/lib/{types,api,queries}.ts.
INFRA: build.sh, deploy.sh, .env.example.

Design system facts to check against: tokens in web/src/index.css + web/tailwind.config.ts. Primary interactive accent = sage --primary (must stay sage even in dream areas). Gold = --accent. Serif = font-display (Fraunces). The app supports BOTH light and dark themes. The night palette (--night-*, --periwinkle, --moon-halo, --star) is fixed-night for dream zones only.

Both \`tsc --noEmit\` (server+web) and full builds already pass; a server smoke test already confirmed: dream generation, idempotency (skip without force), empty-day skip, <think> stripping, request shape (model/max_tokens/temperature/thinking/roles/Bearer), and route 503/localhost behavior. Focus on bugs those tests would NOT catch.
`

const LENSES = [
  {
    key: 'server-correctness',
    prompt: `${context}\n\nLENS: SERVER CORRECTNESS. Read the server files. Hunt for real bugs: scheduler reschedule/lock correctness (dream_scheduler.ts withDreamLock, msUntilNext edge cases, timer.unref, double-fire), idempotency & race conditions, generateDream retry/backoff logic, dreamTargetDate vs habit's yesterdayConsumptionDay (off-by-one across 03:30 boundary), gatherDreamContext SQL ranges and off-plan detection, minimax.ts response parsing (content missing, reasoning_content, base_resp, <think> stripping), config defaults, dream.ts CLI exit codes. Report concrete bugs with how they trigger.`,
  },
  {
    key: 'security',
    prompt: `${context}\n\nLENS: SECURITY & SECRETS. Verify the MiniMax key is never logged, never sent to the client, only used server-side. Check routes/dreams.ts POST /generate auth (isLoopback correctness — can it be spoofed via headers? does Express trust proxy here?), the X-Dream-Token comparison (timing/typing), that read endpoints leaking nothing sensitive, deploy.sh secret masking covers MINIMAX_API_KEY and DREAM_TRIGGER_TOKEN, .env not committed. Also check that an attacker cannot trigger expensive generation. Report concrete issues.`,
  },
  {
    key: 'frontend-react',
    prompt: `${context}\n\nLENS: FRONTEND/REACT CORRECTNESS. Read the web files. Hunt for real bugs: DreamStartupDialog session-once logic under React 18 StrictMode double-effect, focus-trap correctness (initial focus, Tab/Shift-Tab cycle, focus restore, Escape), AnimatePresence exit vs sessionStorage, navigate('/tagebuch?view=traum') with HashRouter + useSearchParams reading 'view' in DiaryScreen (does the param actually parse under hash routing? does the cleanup setParams loop infinitely?), useEffect deps, DreamProse parser edge cases (unbalanced **, headings, nested), collapse mask logic, query staleness. Report concrete bugs with repro.`,
  },
  {
    key: 'design-a11y',
    prompt: `${context}\n\nLENS: DESIGN CONSISTENCY & ACCESSIBILITY. This is the HIGHEST priority of the task. Read web/src/index.css, tailwind.config.ts, and all dream components. Check: (1) night palette uses the project's token approach (rgb(var(--x)) channels) and coexists with light+dark theme without leaking; (2) primary buttons stay sage --primary in dream areas (periwinkle only for chrome); (3) WCAG-AA contrast for dream-ink/dream-ink-soft text (off-white on indigo #14132A..#221B3A) AND for surface-tone DreamProse in BOTH light and dark themes; (4) prefers-reduced-motion disables breathe/halo/twinkle AND the framer-motion drift/scale (check useReducedMotion usage in the dialog); (5) serif font-display used for headings; (6) does it read as the same app, not bootstrap. Flag concrete contrast failures (estimate ratios), motion not gated, or tokens that break theming.`,
  },
  {
    key: 'dst-time',
    prompt: `${context}\n\nLENS: TIMEZONE/DST & SCHEDULING. The app stores naive local wall-clock times and assumes host=Europe/Berlin. Scrutinize: msUntilNext local Date construction across DST spring-forward (04:20 on the transition day) and fall-back (duplicate 02:xx) — could the dream fire twice or skip? dreamTargetDate at exactly 03:30/04:20 boundaries. consumptionRange wall-clock string comparison correctness. The scheduler reschedules in a finally — what if generateDream throws synchronously or the timer drifts? Idempotency via DB PK as the backstop. Report concrete time bugs.`,
  },
]

phase('Review')
const results = await pipeline(
  LENSES,
  (lens) => agent(lens.prompt, { label: `review:${lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA, effort: 'high' }),
  (review, lens) =>
    parallel(
      (review?.findings ?? []).map((f) => () =>
        agent(
          `Adversarially verify this code-review finding against the ACTUAL code at ${REPO}. Read the cited file(s) yourself. Default to real=false unless you can confirm the bug genuinely triggers in this codebase as written. Be precise about whether it is a real defect vs a stylistic preference or a non-issue.\n\nLENS: ${lens.key}\nFINDING: ${JSON.stringify(f)}`,
          { label: `verify:${lens.key}:${f.file.split('/').pop()}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' },
        ).then((v) => ({ lens: lens.key, finding: f, verdict: v })),
      ),
    ),
)

const all = results.flat().filter(Boolean)
const confirmed = all.filter((r) => r.verdict && r.verdict.real && r.verdict.adjustedSeverity !== 'not-a-bug')
const rejected = all.filter((r) => !(r.verdict && r.verdict.real))

const order = { critical: 0, high: 1, medium: 2, low: 3 }
confirmed.sort((a, b) => (order[a.verdict.adjustedSeverity] ?? 9) - (order[b.verdict.adjustedSeverity] ?? 9))

log(`Confirmed ${confirmed.length} of ${all.length} findings (${rejected.length} rejected).`)

return {
  confirmedCount: confirmed.length,
  totalFindings: all.length,
  rejectedCount: rejected.length,
  confirmed: confirmed.map((r) => ({
    severity: r.verdict.adjustedSeverity,
    confidence: r.verdict.confidence,
    lens: r.lens,
    file: r.finding.file,
    location: r.finding.location,
    title: r.finding.title,
    detail: r.finding.detail,
    suggestedFix: r.finding.suggestedFix,
    verifyReason: r.verdict.reason,
  })),
}
