# meDiary — Open items / Next steps

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

## Open items / Next steps

- [ ] iOS build (requires macOS + Xcode): `npx cap add ios`
- [ ] Release APK instead of debug: `assembleRelease` + signing
- [ ] Unit tests for `lib/defaults.ts` (parser) and `lib/substances.ts`
      (`nameKey`, `findOrCreateSubstance`, `backfill…`).
- [ ] `Hash`-based detection of real conflicts: currently the compliance
      check does not distinguish "intentionally without default" from "not yet
      maintained". A deliberate exception list (e.g. a special `Notiz: -` in
      DEFAULTS) would be one option.
- [ ] `IntakeEditSheet` shows no DEFAULTS preview when editing (only the
      `QuickEntryScreen` composer does). Consistency may be aligned.
- [ ] The `nameKey` migration for existing duplicates (e.g. "CBD-Öl" +
      "cbd-öl" from old imports) is not automatic — the DB may keep two
      substances. Merge manually via SubstanceManager or directly in the DB
      if needed.
- [ ] Planned (future) plan versions cannot be deleted or edited afterwards
      (no `DELETE /api/plan/version/:id`) — if you got it wrong, you must save
      another version with the same effective date (higher `id` wins). A
      "discard planned version" UI action would be a sensible next step.
- [ ] The plan editor always edits the **currently active** state as the
      starting point — when creating a future version, the most recent planned
      version as a template might be more practical.
- [ ] `DatePickerSheet` in the trends tab: currently only the native
      `type="date"` (browser UI). An inline month calendar (clickable days with
      assessment markers) would be friendlier, but isn't trivial — and the
      native browser picker is enough for the "backfill day X" use case for now.
- [ ] Trends tab: after creating a new daily assessment the list does **not**
      automatically jump to the new entry at the top. Currently `useAssessments`
      invalidation is enough, but visual feedback (e.g. a brief scroll) would
      be nice-to-have.
