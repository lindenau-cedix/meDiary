# meDiary — Bekannte Stolperfallen

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## Bekannte Stolperfallen

- **Zwei `data/`-Verzeichnisse:** `./data` im Projekt-Root ist das
  Docker-Volume mit der **Live-DB** — nie löschen oder für Tests verwenden.
  `server/data` ist der lokale Dev-Default (`DB_PATH` relativ zu `server/`).
  Smoke-Tests immer mit explizitem `DB_PATH` nach `/tmp` fahren.
- **SQLite `lower()` ist ASCII-only** — `lower('Ö')` bleibt `Ö`. Für
  korrektes Umlaut-Matching ist `nameKey()` in JS Pflicht; keine
  `lower(name) = lower(?)` Queries mehr schreiben.
- **DEFAULTS.md wird live eingelesen** — keine Notwendigkeit, den Server
  nach einer Änderung neu zu starten, aber auch keine Reload-Logik im
  Client nötig (Server liest pro Anfrage frisch).
- **`Mit:`-Begleitsubstanzen gelten für `POST /api/intakes` UND
  `POST /api/intakes/text`** — Importer, XLSX-Replace und PATCH legen bewusst
  keine Begleit-Einnahmen an (Historie bleibt Historie); `plan-batch` ebenso
  nicht (Plan ist die maßgebliche Liste). Es wird genau eine Ebene aufgelöst:
  `Mit:`-Zeilen der Begleitsubstanz werden ignoriert, `Mit: <Substanz selbst>`
  ebenso. Eine per `Mit:` referenzierte Substanz ohne eigenen `## …`-Abschnitt
  taucht nach dem ersten Auto-Eintrag im Compliance-Check als `missing` auf —
  gewollt (Aufforderung, sie zu pflegen). Bei `/text` gibt es KEINE
  Querschnitt-Deduplizierung: nennt eine Zeile die Begleitsubstanz zusätzlich
  selbst (z. B. „Theanin, Lemon Balm"), entstehen zwei Lemon-Balm-Einträge
  (Haupt + Begleit) — wie zwei getrennte `POST /`-Aufrufe; `companions: false`
  unterdrückt die automatischen.
- **`plan-batch` erfasst genau die Plan-Substanzen des Slots** — keine
  `Mit:`-Begleitsubstanzen (sonst Doppelungen, wenn eine Begleitsubstanz
  ohnehin im Plan steht). Maßgeblich ist der zum `takenAt` wirksame Plan; eine
  Substanz, die morgens UND nachts dosiert ist (z. B. Lithium), wird von beiden
  Sammel-Einträgen je einmal erfasst (zwei Einnahmen, gewollt). Im Frontend
  erscheinen die Kacheln nur, wenn der Plan für den Slot etwas vorsieht.
- **`/api/intakes/text` ist der einzige authentifizierte Endpunkt** — der
  Rest der API ist bewusst offen (privates Deployment). Die CF-Access-Prüfung
  ist fail-closed: ohne `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503. Für
  lokale Smoke-Tests `CF_ACCESS_DISABLED=true` setzen. `Mit:`-Begleit­
  substanzen werden hier — anders als früher — miterfasst (wie bei `POST /`,
  abschaltbar mit `companions: false`); kein `nightMed`/Tagesbild-Feld in der
  Antwort (externe Automation, keine UI). Wiederholtes Senden desselben Texts
  erzeugt Duplikate — es gibt bewusst keine Idempotenz (`source_event_id =
  text:<Zeitstempel>` ist nur ein Batch-Marker zum Wiederfinden/Aufräumen;
  Begleiteinträge tragen `companion:<haupt-id>`).
- **`POST /api/dreams/generate` ist token-primär & fail-closed** — Loopback ist
  KEINE Auth, sobald ein Reverse-Proxy/cloudflared-Tunnel davor sitzt (dort
  kommt JEDE externe Anfrage über 127.0.0.1). Darum: gültiger `X-Dream-Token`
  (Header, konstantzeit verglichen) ist Pflicht; ohne Token & ohne explizites
  `DREAM_TRUST_LOOPBACK=true` → 403, auch von localhost. `DREAM_TRUST_LOOPBACK`
  nur für reine Nur-lokal-Deployments ohne Proxy davor setzen. `trust proxy`
  muss aus bleiben (die Route liest bewusst `req.socket.remoteAddress`, nicht
  `req.ip`). Rate-Limit via `DREAM_MIN_INTERVAL_MS` (Default 10s → 429). Der
  In-Process-Scheduler braucht KEIN Token — er ruft `generateDream` direkt auf.
- **`is_night_med` triggert das Tagesbild** — `consumptionDay(takenAt)`
  rechnet 00:00–03:29 in den Vortag. Das passiert hier, nicht im Frontend.
- **Tagesbild-Trigger: alle Nacht-Medis des aktuellen Plans** — Das
  Tagesbild wird NICHT mehr ausgelöst, wenn eine Substanz mit
  `is_night_med=1` erfasst wird. Stattdessen prüft `POST /api/intakes`
  nach jeder Erfassung, ob ALLE Nacht-Medis (`night`-Slot) des aktuell
  gültigen Plans für den Konsumtag bereits eingenommen sind
  (`allNightMedsTaken(day)` in `db.ts`). Erst wenn alle vorhanden sind,
  wird `nightMed=true` und `assessmentDate` in der Response gesetzt.
  Gilt für JEDE Substanz-Erfassung, sobald der Plan-Complete-State
  erreicht ist — auch Nicht-Nacht-Med-Substanzen lösen dann das
  Tagesbild aus.
- **Import `entries.jsonl` deckt nur Lücken** — Markdown hat Vorrang; ein
  jsonl-Eintrag wird übersprungen, wenn (Tag, Zeit) bzw. (Tag, Substanz)
  bereits aus Markdown vorliegt.
- **Soft-Archive:** `DELETE /api/substances/:id` ohne `?hard=true` setzt
  nur `archived_at`. `findOrCreateSubstance` reaktiviert keine archivierten
  Substanzen — bewusst, damit entfernte Kacheln entfernt bleiben.
- **`effective_from` vs. `created_at`:** Für „welcher Plan galt wann" zählt
  ausschließlich `effective_from`. Eine rückwirkende Version überdeckt
  ältere Versionen nur bis zum nächsthöheren Wirkungsdatum — Beispiel:
  v2 gilt ab 06-06, eine neue v3 „ab 06-01" gilt dann nur 06-01 bis 06-05.
  Für „gilt seit X Tagen bis heute" muss das Wirkungsdatum nach dem der
  bisherigen aktuellen Version liegen (der Normalfall). Bei gleichem
  Wirkungsdatum gewinnt die höhere `id`.
- **Docker-Compose überschreibt Datenpfade:** Für den Container gelten
  `DB_PATH=/data/mediary.db`, `DEFAULTS_PATH=/data/DEFAULTS.md`,
  `DIARY_PATH=/data/diary.md` und `WEB_DIST=/app/web/dist`, auch wenn in
  `.env` ältere lokale Werte stehen. Das stellt sicher, dass Userdaten im
  Repo-Root unter `./data` landen.
- **`WEB_DIST`: relative Pfade aus `.env` werden gegen `process.cwd()`
  aufgelöst** (nicht gegen `SERVER_ROOT`). Im Docker-Image ist der feste Wert
  `/app/web/dist` gesetzt. Für lokale Node-Starts hängt der relative Pfad vom
  Arbeitsverzeichnis ab: bei `node server/dist/index.js` aus dem Repo-Root
  `WEB_DIST=./web/dist`, bei `npm run start` über das Root-Skript wegen
  `npm --prefix server` dagegen `WEB_DIST=../web/dist`.
