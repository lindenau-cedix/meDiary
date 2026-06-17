# meDiary — Offene Punkte / Next Steps

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## Offene Punkte / Next Steps

- [ ] iOS-Build (erfordert macOS + Xcode): `npx cap add ios`
- [ ] Release-APK statt Debug: `assembleRelease` + Signatur
- [ ] Unit-Tests für `lib/defaults.ts` (Parser) und `lib/substances.ts`
      (`nameKey`, `findOrCreateSubstance`, `backfill…`).
- [ ] `Hash`-basierte Erkennung echter Konflikte: aktuell unterscheidet
      der Compliance-Check nicht „absichtlich ohne Default" von
      „noch nicht gepflegt". Eine bewusste Ausnahme-Liste (z. B. eine
      spezielle `Notiz: -` in DEFAULTS) wäre eine Option.
- [ ] `IntakeEditSheet` zeigt beim Editieren keinen DEFAULTS-Preview an
      (nur im `QuickEntryScreen` Composer). Konsistenz ggf. angleichen.
- [ ] Die `nameKey`-Migration für bestehende Dubletten (z. B. „CBD-Öl" +
      „cbd-öl" aus alten Importen) ist nicht automatisch — die DB bleibt
      ggf. mit zwei Substanzen. Bei Bedarf manuell mergen via
      SubstanceManager oder direkt in der DB.
- [ ] Geplante (zukünftige) Plan-Versionen lassen sich nicht löschen oder
      nachträglich bearbeiten (kein `DELETE /api/plan/version/:id`) — wer
      sich vertan hat, muss eine weitere Version mit gleichem Wirkungsdatum
      speichern (höhere `id` gewinnt). UI-Aktion „geplante Version
      verwerfen" wäre ein sinnvoller nächster Schritt.
- [ ] Der Plan-Editor bearbeitet immer den **heute aktiven** Stand als
      Ausgangsbasis — beim Anlegen einer Zukunfts-Version wäre die jüngste
      geplante Version als Vorlage ggf. praktischer.
- [ ] `DatePickerSheet` im Werte-Tab: aktuell nur nativer `type="date"`
      (Browser-UI). Ein Inline-Monatskalender (klickbare Tage mit
      Tagesbild-Markern) wäre freundlicher, ist aber nicht trivial — und
      der nativen Browser-Picker reicht für den Use-Case „Tag X
      nachtragen" erstmal aus.
- [ ] Trends-Tab: nach dem Anlegen eines neuen Tagesbilds springt die
      Liste **nicht** automatisch zum neuen Eintrag oben. Aktuell genügt
      `useAssessments`-Invalidation, aber visuelles Feedback (z. B. kurzes
      Scrollen) wäre nice-to-have.
