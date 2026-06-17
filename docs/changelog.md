# meDiary — Letzte Änderungen (Detailhistorie)

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## Letzte Änderungen (jüngste zuerst)

- **2026-06-17 — Nächtliches „Träumen" (MiniMax M3) + Traum-Tab + Startup-Dialog + Review-Härtung**:
  - **Feature (Auftrag `/traum`, Phasen 1–4):** Jede Nacht um `DREAM_TIME`
    (Default 04:20 lokal, DST-sicher via lokaler `Date`-Konstruktion in
    `dream_scheduler.ts`) schickt der Server `system_prompt.md` (System, frisch
    von Platte) + den zusammengebauten Tageskontext (User) an **MiniMax M3**
    (OpenAI-kompatibel, `POST {MINIMAX_BASE_URL}/chat/completions`,
    `Authorization: Bearer`, Antwort `choices[0].message.content`,
    `<think>…</think>` wird gestrippt) und speichert das Ergebnis als „Traum"
    pro Konsum-Tag (`dreams`-Tabelle, PK `date`, idempotent). Ziel-Tag =
    **Konsum-Vortag** (`dreamTargetDate` = `consumptionDay(now) − 1`, analog
    Habit). Kontext (`gatherDreamContext` in `lib/dreams.ts`): Plan (Soll),
    Ist-Einnahmen, außerplanmäßiger Konsum (per `nameKey`), Wachzeit,
    Tagesnotizen, 11 Skalen, **die 7 jüngsten Auswertungen** (nicht zwingend 7
    Kalendertage). Der „Traum" IST die sachlich-medizinische Auswertung —
    träumerisch sind nur Branding/Design.
  - **Server-Bausteine:** `lib/minimax.ts` (Client, dependency-frei via
    `fetch`), `lib/dreams.ts` (`generateDream` mit Idempotenz/Empty-Skip/
    Retries+Backoff, `catchUpDreams`, `gatherDreamContext`), `lib/dream_scheduler.ts`
    (In-Process-Timer + `withDreamLock`), `routes/dreams.ts`
    (`GET /api/dreams`, `/latest`, `/:date`, `DELETE /:date`,
    `POST /generate`), CLI `src/dream.ts` (`npm --prefix server run dream --
    [--date=YYYY-MM-DD] [--force]`).
  - **Frontend:** Untertab „Kurz" → **„Info"** (nur Label, Roh-Log unverändert),
    „Voll" → **„Traum"** (Historie der Träume, Monatsgruppierung, einklappbare
    lange Karten); alter Anthropic-Diary-Generierungspfad im UI abgelöst.
    Startup-Dialog (`DreamStartupDialog`) zeigt **einmal pro Session** den
    jüngsten Traum (Blur-Scrim, Mondschein-Halo, Sterne, Fokus-Falle/Escape,
    `prefers-reduced-motion`-aware). Nacht-onirische Tokens in `index.css`
    (`--night-*`, `--moon-halo`, `--periwinkle`, `--star`), Salbei bleibt der
    primäre interaktive Akzent.
  - **MiniMax-Thinking gegen die Doku verifiziert (Nutzer-Anforderung):** M3
    akzeptiert für `thinking.type` laut platform.minimax.io **nur** `adaptive`
    oder `disabled` (KEIN `budget_tokens`); Weglassen = AN. Eigene
    `parseMinimaxThinking`-Funktion (statt der Anthropic-`parseThinking`):
    Default `{ type: 'adaptive' }`, `DREAM_THINKING=off` → `{ type: 'disabled' }`
    (wird IMMER explizit gesendet, sonst bliebe Thinking trotz „off" an —
    vorheriger Bug).
  - **Review-Härtung (adversarialer Multi-Lens-Audit `traum-review`, 15
    bestätigte Findings, je gegen-verifiziert):**
    - **Auth fail-closed:** `POST /api/dreams/generate` ist **token-primär**.
      Hinter cloudflared/Reverse-Proxy kommt jede externe Anfrage über
      127.0.0.1 — Loopback war damit weltoffen. Jetzt: gültiger
      `X-Dream-Token` (konstantzeit, `timingSafeEqual`) ist Pflicht; Loopback
      zählt nur mit explizitem `DREAM_TRUST_LOOPBACK=true` (Default false,
      liest `req.socket.remoteAddress`, NICHT `req.ip` → immun gegen ein
      späteres `trust proxy`). Ohne beides → 403, auch von localhost. Plus
      einfacher Rate-Limit (`DREAM_MIN_INTERVAL_MS`, Default 10s → 429).
    - **MiniMax-Call mit hartem Timeout** (`DREAM_HTTP_TIMEOUT_MS`, Default
      120s, `AbortController` + Aufrufer-Signal): ein hängender Call kann den
      `withDreamLock`-Guard nicht mehr dauerhaft blockieren.
    - **Truncation:** leere Antwort mit `finish_reason='length'` →
      `MinimaxTruncatedError` (klarer „DREAM_MAX_TOKENS erhöhen"-Hinweis,
      **nicht** retry-bar — spart sinnlose Backoffs).
    - **Startup-Catch-up** (`catchUpDreams`, `DREAM_CATCHUP_DAYS`, Default 7):
      holt verpasste Tage (Neustart über 04:20 hinweg) UND nachträglich mit
      Inhalt befüllte „leere" Tage nach — idempotent, Empty-Skip vor dem
      MiniMax-Call.
    - **Frontend/Design-a11y:** Startup-Dialog-Buttons als native `<button>`
      (keine `cx`-ohne-twMerge-Klassenkollision mehr, Fokusring-Offset auf der
      Nacht-Fläche statt `--bg`); `DreamProse`-Fett-Parser non-greedy
      (`**…**` mit innerem `*` ok, keine rohen Marker, `---` ignoriert);
      `DreamCard`-Einklapp-Zustand aus `long` abgeleitet (klemmt nicht mehr
      nach Refetch); Periwinkle-Icon im Leerzustand auf Nacht-Chip statt
      hellem `surface2` (AA-Kontrast); `dream-ink-soft` 0.62 → 0.74 (AA im
      Halo-Bereich); `ring-1 dream-hairline` → `ring-1 ring-[…periwinkle]/20`
      (kein Default-Blau mehr); AppShell-Routen-Transition `prefers-reduced-motion`-aware.
  - **Verifiziert:** Server-TS + Web-TS je exit 0; Server-Build (`tsc`) +
    Vite-Build je exit 0. Smoke-Test gegen `/tmp`-Scratch-DB + Mock-MiniMax:
    Request-Form (`thinking={type:adaptive}`, `max_tokens=40000`, Bearer,
    System/User-Messages), `<think>`-Strip, Truncation (non-retryable, 4 ms =
    kein Backoff), Timeout (Abbruch bei 1509 ms), Catch-up + Idempotenz; HTTP-
    Auth: ohne Token 403, falsches Token 403, korrektes Token 200,
    `DREAM_TRUST_LOOPBACK=true` ohne Token 200, Default ohne Token von
    localhost 403 (fail-closed), Rate-Limit 429. Live-`./data` unberührt.
  - **Folge-Aktion für User:** in `.env` `MINIMAX_API_KEY` setzen; für den
    externen/Cron-Trigger zusätzlich ein langes `DREAM_TRIGGER_TOKEN` (Loopback
    allein autorisiert hinter dem cloudflared-Tunnel NICHT mehr). `DREAM_THINKING`
    bleibt auf `adaptive` (Default). `npm run deploy` reicht alle neuen DREAM_*-
    Vars in die systemd-Unit durch.

- **2026-06-16 — Werte-Tab: Tagesbilder bearbeiten + sichtbarer Tages-Zuordnung**:
  - **Bug/UX-Mangel:** Der "Werte"-Tab zeigte nur die 11 Skalen-Trend-Charts;
    ein bestehendes Tagesbild konnte **nicht** nachträglich bearbeitet werden,
    und es war nirgends erkennbar, **welcher Konsum-Tag** beim Trigger
    (Nachtmedikation komplett → `nightMed=true`) gerade abgefragt wurde.
  - **Werte-Tab (`web/src/screens/TrendsScreen.tsx`) komplett umgebaut:**
    - **Schnellzugriff "Heute"** (`TodayHero`): fasst den aktuellen
      Konsum-Tag als Karte zusammen (Datum, `n/11 Werte`, Ø, Notiz-Vorschau)
      und öffnet per Tap das `AssessmentSheet` für genau diesen Tag.
    - **Liste "Tagesbilder im Zeitraum"** (`AssessmentRow`): jedes
      erfasste Tagesbild ist ein Tap-Element (Datum, `n/11 · Ø X.X`,
      Notiz-Vorschau) — Tippen öffnet das `AssessmentSheet` für genau
      diesen Konsum-Tag, sodass auch **vergangene** Tage jederzeit
      nachgetragen / korrigiert werden können.
    - **"+ Neu"-Button:** ein kompakter `DatePickerSheet` (`type="date"`
      + Schnellauswahl Heute/Gestern/Vorgestern/vor 7 Tagen) legt ein
      Tagesbild für einen beliebigen Konsum-Tag in der Vergangenheit
      an (Default = heute; `max={today}` verhindert Zukunfts-Select).
    - **"11 Skalen — Trends"-Bereich zusammenklappbar** (Default
      eingeklappt), damit die Liste der Tagesbilder sofort sichtbar ist.
  - **`AssessmentSheet` (`web/src/components/AssessmentSheet.tsx`)**
    zeigt jetzt den **Konsum-Tag** im Subtitle (`Donnerstag, 11. Juni 2026
    · Heute` / `… · gestern` / `… · vor 3 Tagen`) und passt den
    Body-Text an (`isToday` / `date < today` / `date > today`),
    damit klar ist, **welcher Tag** gerade bearbeitet wird — unabhängig
    davon, ob er per Nachtmedikations-Trigger (Heute), rückwirkend
    aus dem Verlauf oder aus dem DatePicker im Werte-Tab geöffnet
    wurde. Save-Toast nennt jetzt zusätzlich `formatFull(date)` im
    Detail.
  - **Nachtmedikations-Trigger: Tag-Anzeige war schon korrekt.** Der
    Server liefert `assessmentDate` (Konsum-Tag via `consumptionDay`)
    seit dem 2026-06-14-Fix; das `AssessmentSheet` öffnet sich
    bereits auf genau diesem Tag. Was fehlte, war die **sichtbare
    Beschriftung** im Sheet (siehe oben) — das ist jetzt da.
  - **Verifiziert:**
    - Server-TS (`tsc --noEmit`) + Web-TS je exit 0,
      Server-Build (`tsc`) + Web-Build (`vite build`) je exit 0.
    - E2E gegen `/tmp`-Scratch-DB: `GET /api/assessments/2026-06-15`
      liefert vorhandene Daten (`exists:true`), `PUT` mit neuen
      Werten + Notiz überschreibt sauber (neue `updatedAt`),
      `DELETE` → 204, nachfolgender `GET` → `exists:false` mit leeren
      Defaults. Nachtmedikations-Trigger (Lithium+Quetiapin nachts):
      Einnahme um 22:30 → `assessmentDate: "2026-06-16"` (heute);
      Einnahme um 02:00 → `assessmentDate: "2026-06-15"` (Vortag
      via 03:30-Grenze). Live-`./data` unberührt.
  - **Folge-Aktion für User:** keine Konfig-Änderung. Die neue
    DatePicker-Aktion ist nur ein UI-Add-On; die Server-Endpoints
    `/api/assessments[/:date]` PUT/DELETE waren bereits vorhanden.

- **2026-06-16 — Habit-Endpoint: PC-Nutzung → Wachzeit + Vortag hart**:
  - **Ziel:** Die vom Webhook `POST /api/habit/uptime` gemeldeten
    `first_user_interaction_24h_unix`/`last_user_interaction_unix` waren
    fälschlich als „PC-Nutzung" gespeichert, das Ziel-Datum hing am
    `last`-Konsum-Tag (konnte falsch sein, wenn der Cron zu anderer
    Zeit lief), und Einnahmen flossen gar nicht in die Berechnung ein.
    Neu: die Werte werden als Indikatoren für „wach" gewertet und mit
    den Einnahmen-Zeitpunkten des Vortages kombiniert; das Ziel-Datum
    ist **immer der Konsum-Vortag** aus Sicht des Webhooks (Tagesgrenze
    03:30 Europe/Berlin, hart `today - 1`).
  - **Algorithmus (in `server/src/routes/habit.ts → POST /uptime`):**
    1. `targetDate` = Konsum-Vortag (`yesterdayConsumptionDay()`,
       `todayConsumption - 1d`).
    2. Einnahmen im Wand­uhr-Bereich
       `targetT03:30:00 … (target+1)T03:29:59` laden
       (= genau `consumptionDay(takenAt) === targetDate`).
    3. `intakeFirstUnix` = späteste Einnahme in
       `[Tagesbeginn 03:30, first)` — „Einnahme vor erster PC-Interaktion".
    4. `intakeLastUnix`  = späteste Einnahme des Tages.
    5. `wake_first_unix` = `intakeFirstUnix` falls vorhanden, sonst
       `first_user_interaction_24h_unix`.
    6. `wake_last_unix`  = `max(intakeLastUnix, last_user_interaction_unix)`.
  - **Schema-Migration in `db.ts`** (idempotent, läuft beim Start):
    `ALTER TABLE daily_habits RENAME COLUMN pc_first_interaction_unix TO
    wake_first_unix` (und analog `pc_last_interaction_unix → wake_last_unix`).
    SQLite ≥ 3.25 unterstützt das nativ; Fallback-Pfad für ältere
    Versionen (neue Tabelle anlegen, Daten kopieren, alte droppen)
    liegt vor. `HabitRow` und `serializeHabit` entsprechend umbenannt.
  - **Tagebuch-Lib (`server/src/lib/diary.ts`):**
    - `DiaryDayHabit` umbenannt: `pcFirstInteractionUnix`/
      `pcLastInteractionUnix` → `wakeFirstUnix`/`wakeLastUnix`.
    - `gatherDiaryDays()` setzt das neue Feld, Kommentar von „PC-Wert"
      auf „Wachzeit-Wert".
    - `buildDayPrompt()` schreibt jetzt
      `Gewohnheiten: Wachzeit HH:MM–HH:MM (≈ X.X h wach).` statt
      „PC-Nutzung … h aktiv". **Wichtig:** die schreibende KI wird per
      Kommentar explizit darauf hingewiesen, dass es sich um die
      **Wachzeit** (Aufwachen bis Einschlafen) handelt, **nicht** um
      Bildschirmzeit — die Dauer ist also kein „am PC verbracht".
  - **Frontend (`web/src/lib/types.ts` + `web/src/screens/DiaryScreen.tsx`):**
    Typen `DiaryDayHabit` und `Habit` umbenannt, Block in der
    Kurzfassung heißt jetzt „Wachzeit" (mit `Sun`-Icon statt
    `Monitor`), Anzeige `HH:MM – HH:MM · X.X h wach` (statt „aktiv"),
    Fallback-Strings „zuerst wach …" / „zuletzt wach …" (statt
    „erste/letzte Aktivität").
  - **Verifiziert:**
    - Server-TS (`tsc --noEmit`) + Web-TS je exit 0,
      Server-Build (`tsc`) + Web-Build (`vite build`) je exit 0.
    - E2E gegen `/tmp`-Scratch-DB (`seed.ts` + Einnahmen-Patch auf
      15.06. 07:00..22:15):
      - **Fall A** (Einnahmen am Vortag, `first=17:30 < intakeFirst`):
        `wake_first = 08:00 (Vitamin D, späteste Einnahme vor first)`,
        `wake_last = 22:15 (Quetiapin, intakeLast > last=22:00)`,
        `date = 2026-06-15 (Konsum-Vortag)`. ✓
      - **Fall B** (leerer Vortag):
        `wake_first = first`, `wake_last = last`,
        `intakeFirstUnix/intakeLastUnix = null`. ✓
      - **Fall C** (eine Einnahme NACH `last`):
        `wake_last = max(intakeLast, last) = intakeLast`. ✓
    - Alle vier 400-Pfade getestet: `first > last`, `last` in der
      Zukunft, `first` > 25h vor `now`, fehlende Felder (Zod). ✓
  - **Folge-Aktion für User:** keine Konfig-Änderung; das bestehende
    Cron-Skript schickt weiter dieselben Felder, nur die Bedeutung
    im Server hat sich geändert. Eine historische Live-DB wird beim
    nächsten Serverstart automatisch migriert.

- **2026-06-15 — Habit-/PC-Uptime-Endpoint & Tagebuch-Integration** (überholt
  durch 2026-06-16 — siehe oben): die ursprüngliche Implementierung zählte
  die ankommenden Werte als „PC-Nutzung", nicht als Wachzeit, das
  Ziel-Datum hing am `last`-Konsum-Tag statt am harten Vortag, und der
  KI-Prompt suggerierte der schreibenden KI Bildschirmzeit statt Wachzeit.
  - **Ziel:** Tägliche PC-Nutzungszeiten vom lokalen Client (Cron um 03:30
    Europe/Berlin) per HTTP annehmen und in das Tagebuch (sowohl Kurz- als
    auch Voll-/KI-Version) integrieren.
  - **Neue Tabelle `daily_habits`** in `server/src/db.ts` (idempotent via
    `CREATE TABLE IF NOT EXISTS`):
    - `date TEXT PRIMARY KEY` (Konsum-Tag, gleiche 03:30-Grenze wie
      Einnahmen/Tagesbild)
    - `pc_first_interaction_unix REAL` (nullable)
    - `pc_last_interaction_unix REAL` (nullable)
    - `created_at`, `updated_at` (lokale ISO)
  - **Neuer Router `routes/habit.ts`** (in `index.ts` unter `/api/habit`
    gemountet):
    - `POST /api/habit/uptime` — Body
      `{"last_user_interaction_unix": <float>, "first_user_interaction_24h_unix": <float>}`.
      Tageszuordnung = Konsum-Tag des `last`-Timestamps (semantisch
      "Tag, der gerade endet"). Bei einem echten 24h-Fenster um 03:30
      kann `first` rechnerisch in einem anderen Konsum-Tag liegen (Fenster
      überspannt die Tagesgrenze) — das ist **kein Fehler**, die Response
      enthält `crossedBoundary: true` zur Diagnose. Plausi-Checks:
      `last` ≤ `now+10min` (Scheduler-Skew), `first` ≥ `now-25h-10min`
      (echtes 24h-Fenster + Slack), `first ≤ last`. Antwort enthält
      zusätzlich `firstLocal`/`lastLocal` (lokal aufgelöste ISO-Zeiten)
      und `firstDay`/`lastDay` (Konsum-Tage) fürs Debugging.
    - `GET /api/habit?from=&to=` — Liste (YYYY-MM-DD-Range).
    - `GET /api/habit/:date` — Einzel-Tag; `exists: false`, wenn leer.
    - `DELETE /api/habit/:date` — 204 / 404.
  - **Server-Helfer `time.ts`** ergänzt: `unixToLocalISO`, `nowUnix`,
    `consumptionDayFromUnix` (Unix-Sek. → lokale ISO / Konsum-Tag).
  - **Tagebuch-Lib (`server/src/lib/diary.ts`)**:
    - `gatherDiaryDays()` liest `daily_habits` mit auf; ein Tag zählt
      nun als "noteworthy", wenn er mind. eine Einnahme-Notiz, ein
      Tagesbild **oder** einen Habit-Datensatz hat.
    - `DiaryDay` um `habit: { pcFirstInteractionUnix, pcLastInteractionUnix }`
      erweitert (Server-Side in `DiaryNoteDay` re-exposed).
    - `buildDayPrompt()` reichert den KI-Prompt um
      `Gewohnheiten: PC-Nutzung HH:MM–HH:MM (≈ X.X h aktiv).` an, sodass
      die generierten Volltext-Einträge die PC-Aktivität einbeziehen.
  - **API-Routen & Frontend:**
    - `GET /api/diary/notes` liefert jetzt zusätzlich `habit` pro Tag.
    - `web/src/lib/types.ts`: `DiaryDayHabit` und `Habit` ergänzt.
    - `web/src/lib/api.ts`: `api.habit.{uptime,list,get,remove}` exponiert
      (für künftige UI / Smoke-Tests; primärer Konsument ist der externe
      Client-Cron, nicht das Frontend).
    - `web/src/screens/DiaryScreen.tsx` (Kurz-Tab): PC-Nutzung als
      eigener Block mit Monitor-Icon, analog zum Tagesbild-Block.
      Darstellung `HH:MM – HH:MM · X.X h aktiv` (oder „letzte/erste
      Aktivität HH:MM", falls nur ein Wert vorhanden).
  - **Verifiziert:** `npx tsc --noEmit` für `server/` und `web/`
    (in `/tmp`-Sandbox mit `npm install`) → exit 0. Smoke-Test gegen
    einen lokalen Server (`DB_PATH=/tmp/...`, `PORT=4321`): POST speichert
    unter korrektem Konsum-Tag, GET liefert Liste mit korrekt
    serialisierten Werten, GET `/api/diary/notes` enthält das
    `habit`-Feld, alle Validation-Tests (`first>last`, `first>25h`,
    negative, NaN, fehlend) liefern 400 mit klarer Fehlermeldung.
    `buildDayPrompt()` enthält die neue `Gewohnheiten:`-Zeile mit
    lokal aufgelösten HH:MM + Stunden-Differenz.
  - **Offene Punkte / Next Steps:**
    - Client-Skript (Cron-Job, der `last` und `first` misst und POST
      schickt) liegt außerhalb dieses Repos.
    - Kein Auth-Schutz: `POST /api/habit/uptime` ist offen. Falls die
      API nicht hinter Cloudflare Access / einem VPN läuft, sollte ein
      Token-Header o. ä. ergänzt werden (siehe `intakes/text` als
      Vorbild).
    - Aktuell nur PC-Uptime; Schema ist generisch genug, um später
      weitere Habit-Felder (z. B. Schlafzeiten, Bildschirmzeit) zu
      ergänzen — die Spaltennamen sind explizit `pc_…` und eine
      Erweiterung würde eine Schema-Migration erfordern.

- **Freitext-Parser robuster: Datum/Zeit-Formen, „Uhr"-Suffix, Menge/Notiz-Trennung**:
  - **Ziel:** `POST /api/intakes/text` soll Datum, Zeit, Substanzname, Menge
    (vor ODER nach dem Namen) und Notiz zuverlässig erkennen. „200 mg Pregabalin"
    lieferte vorher teils nur einen Fehler; viele Zeit-/Notiz-Formen fehlten.
  - **Zeit-Präfix (`parsePrefix` in `server/src/lib/text_entries.ts`)** erkennt
    jetzt zusätzlich: **`Uhr`-Suffix** (`20 Uhr`, `8 Uhr`, `8:30 Uhr`,
    `8.30 Uhr` — gepunktete Zahl vor `Uhr` = Zeit, nicht Datum), **nur-Stunde**
    (`20 Uhr` → 20:00), optionales **`um`** (`um 20 Uhr`), **relative Tage**
    (`heute`/`gestern`/`vorgestern`/`morgen`/`übermorgen`, allein oder mit Zeit).
    Ein bekräftigendes **Tageszeit-Wort hinter der Zeit** (`21 Uhr nachts:`,
    `8:30 morgens:`) wird als Präfix-Residuum verworfen statt zur Notiz zu werden.
  - **Menge-Erkennung**: Mess-Einheiten und **Darreichungs-/Zähl-Wörter**
    (`Tablette(n)`, `Tropfen`, `Hub`, `Sprühstöße`, `TL`, `Kapsel`, …) zählen
    nach einer Zahl als Menge; **Unicode-Brüche an Einheit geklebt** (`½mg`,
    `¼g`), **Bereiche** (`1-2 Tabletten`) und bloße führende Zahlen
    (`300 Baldrian`) werden erkannt. Eine Dosis hinter einem **Beschreiber**
    (`Lithium retard 450 mg`, `Pregabalin morgens 150 mg`,
    `Magnesium Citrat 300mg`) wird korrekt als Menge herausgezogen, der
    Beschreiber wird Notiz (statt die Menge zu verschlucken).
  - **Notiz**: Klammer-Notiz UND Frei-Notiz (vor/hinter dem Namen) werden beide
    bewahrt (`Lorazepam 1mg bei Panik (sublingual)` → Notiz
    „bei Panik sublingual"). Abschließende adverbiale Notiz-Wörter (`morgens`,
    `abends`, `nüchtern`, …) werden auch bei noch **unbekannten** Substanzen ohne
    Anker vom Namen abgetrennt (`peelTrailingNoteWords`).
  - **Mehrere Einträge**: `splitEntries` bekommt `knownKeys` — „ und " trennt nur
    echte Einträge (führende Menge ODER bekannter Name ODER Menge-irgendwo, fängt
    auch unbekannte „Menge-danach"-Einträge wie „Hustensaft 10 ml" ein); steht
    „und" in einer Frei-Notiz (`Lithium 600 mg morgens und abends`), bleibt es
    EIN Eintrag. Separator-Artefakte (führendes/abschließendes/doppeltes „und")
    und reine Satzzeichen-Segmente (`.`/`...`/`300mg und`) werden bereinigt bzw.
    als Fehler gemeldet, statt Geistersubstanzen anzulegen.
  - **Verifikation**: Server-/Web-TS + Server-Build je exit 0; ein
    adversarialer Multi-Agent-Audit (8 Linsen) bestätigte 25 Fehlparsings —
    **alle behoben** und gegen-verifiziert. E2E gegen `/tmp`-Scratch-DB
    (CF-Bypass): dryRun + echter Write mit DB-Verifikation (`verified:true`),
    u. a. „200 mg Pregabalin" → Pregabalin/200 mg, „Uhr"-Formen,
    „Lithium retard 450 mg", „½ Tablette", „Pregabalin morgens 150 mg" (unbekannt)
    → Name/Menge/Notiz korrekt; „300mg"-only → isolierter Zeilenfehler;
    Live-`./data` unberührt. Antwort-Schema/`dryRun`/Begleitsubstanzen
    unverändert; der Parser bleibt DB-frei (`knownKeys` von der Route übergeben).

- **Freitext-Import: Menge VOR dem Substanznamen + bekannter Name als Trennung**:
  - **Problem:** `POST /api/intakes/text` las nur das Format `Substanz Menge`.
    Bei „Menge zuerst" landete die Menge fälschlich im Namen
    („100mg Pregabalin" → Substanz „100mg Pregabalin") und „200 mg Lorazepam"
    scheiterte ganz (führende reine Zahl → Fehler „Substanzname fehlt").
  - **Fix im Parser `server/src/lib/text_entries.ts`** (`parseSingleEntry`,
    jetzt mit `knownKeys`-Parameter):
    1. **Bekannter Substanzname als Anker** (Wunsch des Nutzers): kommt im
       Eintrag ein bereits bekannter Substanzname vor (`knownKeys`, via
       `nameKey` normalisiert, längste passende Token-Folge), trennt er Menge
       von Notiz — Menge davor („100mg Pregabalin") ODER danach
       („Pregabalin 100mg"), freie Notiz dahinter ohne Klammern
       („Pregabalin nüchtern", „150mg Pregabalin morgens"). Mengen-geführte
       Spannen („100mg Pregabalin") werden beim Matching übersprungen, sodass
       eine evtl. vorhandene Altlast-Substanz „100mg Pregabalin" NICHT gewinnt.
    2. **Menge-zuerst (Fallback ohne bekannten Namen):** beginnt der Eintrag mit
       einer Mengenangabe MIT Einheit („100mg …", „200 mg …", „0,5 ml …"), gilt
       sie als Menge, der Rest als (neuer) Substanzname. Die Einheit ist
       Voraussetzung — so bleibt „5 HTP 100mg" → Substanz „5 HTP" + Menge
       „100 mg" (Zahl gehört zum Namen).
    3. **Substanz-zuerst (Standard, unverändert):** „Elvanse 30mg",
       „Omega 3 500 mg"; eine führende einheitenlose Zahl („300 Baldrian") gilt
       als Menge.
    - Reine Mengen ohne Name („300mg", „200 mg", „0,5") bleiben ein Zeilenfehler
      (zentraler `finalize`-Guard via `isQuantityRun`).
  - **`nameKey` nach `server/src/lib/names.ts` extrahiert** (dependency-frei):
    `substances.ts` re-exportiert es (Bestandscode unverändert), `db.ts` nutzt
    es statt seiner lokalen Kopie, und der Parser bleibt DB-frei. Die Route
    `POST /api/intakes/text` baut die Menge der bekannten Namen (aktiv +
    archiviert) und übergibt sie an `parseFreeText(text, undefined, knownKeys)`.
    Antwort-Schema/`dryRun`/Begleitsubstanzen unverändert.
  - **Nebenbei (außerhalb des Auftrags):** `server/src/config.ts` nutzte
    `__dirname` in `dotenv.config(...)` VOR dessen Deklaration (kaputter
    uncommitteter Stand → TS-Fehler + Laufzeit-`ReferenceError`, blockierte den
    gesamten Server-Build). Aufrufreihenfolge minimal korrigiert (Deklaration
    zuerst), Intention (`.env` aus dem Repo-Root laden) unverändert.
  - Verifiziert: Server-TS + Server-Build je exit 0; E2E gegen `/tmp`-Scratch-DB
    (CF-Bypass): Nutzer-Beispiele „100mg/200mg Pregabalin", „200 mg Lorazepam"
    → korrekt getrennt, 3/3 verifiziert, Mengen normalisiert; bekannter Name in
    beiden Reihenfolgen + Notiz-dahinter; Altlast „100mg Pregabalin"-Substanz
    wird ignoriert; „5 HTP 100mg"/„300 Baldrian"/„Omega 3 500 mg"/„0,5 ml CBD-Öl";
    Begleitsubstanz Theanin → Lemon Balm weiter ok; „300mg"/„200 mg"/„0,5" → Fehler.

- **Tagesgrenze 03:30 Europe/Berlin im Frontend + Datum bleibt nach Submit**:
  - **Server `consumptionDay()` als Wahrheit für `intake.date`** —
    `serializeIntake` (`server/src/lib/serialize.ts`) berechnet `date`
    jetzt über `consumptionDay(taken_at)` (DAY_BOUNDARY) statt
    `slice(0, 10)`. Einnahmen 00:00–03:29 haben damit ein um einen
    Tag zurückverschobenes `date`.
  - **Server `allNightMedsTaken(day)` repariert** (`server/src/db.ts`):
    die DB-Suche verwendet jetzt den Wand­uhr-Bereich
    `dayT03:30:00` … `(day+1)T03:29:59` — d. h. genau die
    Einnahmen, deren `consumptionDay(takenAt) === day`. Vorher
    suchte `dayT00:00:00` … `dayT23:59:59`, was das
    03:30-Grenzverhalten nicht abdeckte (Einnahme um 02:30
    konsumtechnisch zum Vortag, aber vom Suchbereich nicht
    erfasst). Konsequenz: das Tagesbild wird jetzt zuverlässig
    ausgelöst, wenn die letzte Nacht-Med-Einnahme vor 03:30
    erfolgte.
  - **Frontend `web/src/lib/time.ts`** (neu) spiegelt den
    Server-Helfer: `DAY_BOUNDARY`, `consumptionDay`,
    `consumptionToday`, `consumptionTodayOffset(n)`,
    `nowLocalInput`, `parseLocal`, `toDateString`. `format.ts`
    re-exportiert diese Helfer, sodass alte Aufrufer von
    `todayStr`/`nowLocalInput`/`parseLocal`/`dateNDaysAgo` aus
    `format.ts` weiter funktionieren.
  - **`formatDayLabel`/`relativeDays` benutzen `consumptionToday()`**
    statt `todayStr()` — eine Einnahme um 02:30 erscheint in
    der Verlauf-Liste als „Gestern" (Konsum-Tag), nicht als
    „Heute" (Wand­uhr-Tag).
  - **QuickEntryScreen (`today = consumptionToday()`)** plus
    lokaler Filter `it.date === today` aus den letzten 2
    Konsum-Tagen. Robust gegen die SQL-`from/to`-Heuristik
    (die weiter auf Wand­uhr-Zeit arbeitet).
  - **Composer `takenAt` bleibt nach Submit stehen** —
    `resetComposer()` setzt nur `selectedId`/`amount`/`note`
    zurück, nicht mehr `takenAt`. Initial `useState(nowLocalInput())`
    beim Mount, „Jetzt"-Button setzt ihn explizit zurück. Damit
    können mehrere Substanzen eines Blocks („Morgendmedis" oder
    nachts) ohne erneutes Stellen der Uhr erfasst werden.
  - Verifiziert: Server-TS, Web-TS, Server-Build (`tsc`), Vite-Build
    je exit 0; E2E gegen `/tmp`-Scratch-DB: `02:30` → date=Vortag,
    `03:29` → Vortag, `03:30` → aktueller Tag, `03:31` → aktueller
    Tag; Plan-Batch `night @ 22:00` (Konsum-Tag = gleicher Tag) und
    `night @ 02:30` (Konsum-Tag = Vortag) lösen das Tagesbild für
    den jeweils korrekten Konsum-Tag aus; PATCH mit
    `takenAt=01:00` setzt `date` ebenfalls auf Vortag. Live-`./data`
    unberührt.

- **Dokumentation: Mehrzeiltextinput-API erklärt**:
  - Keine Code-/Schemaänderung. Die bestehende Route `POST /api/intakes/text`
    wurde gegen Implementierung und `SAMPLES.md` geprüft und in dieser Datei
    um eine kurze Nutzungsreferenz mit `curl`-Beispielen für JSON, `dryRun`,
    `companions: false`, `text/plain` und Cloudflare-Access-Hinweise ergänzt.
- **Freitext-Import (`/text`): `Mit:`-Begleitsubstanzen + Menge/Notiz-Weglassen**:
  - `POST /api/intakes/text` erfasst jetzt — wie `POST /` — pro Eintrag die
    `Mit:`-Begleitsubstanzen aus DEFAULTS.md automatisch mit (z. B. Theanin →
    Lemon Balm „100 mg" + Mit:-Notiz). Gleicher Zeitpunkt wie der Haupteintrag,
    eine Ebene tief, Selbstbezug übersprungen, `source_event_id =
    companion:<haupt-id>`. Vorher waren sie hier bewusst ausgeschlossen — diese
    Entscheidung ist auf Wunsch umgekehrt. `companions: false` im JSON-Body
    schaltet es pro Aufruf ab.
  - **Menge und/oder Notiz dürfen im Text weggelassen werden** → es greifen die
    DEFAULTS.md-Werte (war bereits so: Text-Menge > Standarddosis > DEFAULTS;
    Text-Notiz > DEFAULTS-Notiz). Jetzt verifiziert.
  - **Verifikation deckt Begleiteinträge mit ab**: der Endpunkt liest nach dem
    Commit ALLE IDs (Haupt + Begleit) frisch aus der DB. Antwort-`entries[]`
    bekommen ein verschachteltes `companions: { createdSubstance, verified,
    intake }[]`; `created` zählt alle verifizierten Einträge (Haupt + Begleit),
    `requested` weiter nur die Haupteinträge, `verified` (gesamt) true gdw.
    jeder geplante Insert gefunden wurde. `dryRun` zeigt eine read-only
    Begleit-Vorschau (`previewCompanions` in `routes/intakes.ts`, keine
    Substanz-Anlage).
  - Verifiziert: Server-TS + Server-Build je exit 0; E2E gegen `/tmp`-Scratch-DB:
    dryRun-Vorschau Theanin→Lemon Balm (100 mg + Mit:-Notiz); Real-Run
    „jetzt: Theanin" → Theanin 400 mg (DEFAULTS, Menge weggelassen) + Lemon Balm
    `companion:<id>`, beide `verified`, `created:2 requested:1`; Mehrfach-Zeile
    (Companion hängt nur an Theanin, nicht an Elvanse/Lithium) mit atomarer
    Fehlerzeile; `companions:false` → kein Lemon Balm; Live-`./data` unberührt.
- **Freitext-Import `POST /api/intakes/text` + Cloudflare-Access-Schutz**:
  - **Parser `server/src/lib/text_entries.ts`** (`parseFreeText`): mehrzeiliger
    Freitext nach SAMPLES.md → Einträge. Pro Zeile optionales Präfix
    `DD.MM(.YYYY) HH:MM:` / `HH:MM:` / `jetzt:` / keins (= jetzt; ohne Jahr =
    aktuelles Jahr, ohne Datum = heute; nur Datum = aktuelle Uhrzeit an jenem
    Tag); Einträge `Substanz Menge (Notiz)` getrennt durch Kommas/„ und " auf
    Klammertiefe 0 (Dezimal-Kommas `0,5` trennen nicht). Menge = erster
    Zahl-Token nach dem Namen, bei Zahl-Folgen („Omega 3 500 mg") der letzte
    der Folge; reine Mengen ohne Name („300mg") sind Fehler. Kalender-echte
    Datums-/Zeitvalidierung (31.02. / 25:99 → Zeilen-Fehler). Eine Zeile ist
    atomar: ein unparsbarer Eintrag → ganze Zeile in `lineErrors`, übrige
    Zeilen laufen weiter (gefahrloses erneutes Senden korrigierter Zeilen).
  - **Route `POST /api/intakes/text`** (`server/src/routes/intakes.ts`): Body
    JSON `{ text, dryRun?, companions? }` oder `text/plain`. Auflösung je
    Eintrag wie `POST /` (Text-Menge > Standarddosis > DEFAULTS; Text-Notiz >
    DEFAULTS-Notiz — **Menge/Notiz dürfen weggelassen werden, dann greifen die
    DEFAULTS**), Autovivifikation inklusive. **`Mit:`-Begleitsubstanzen werden
    pro Eintrag automatisch miterfasst** (wie bei `POST /`; z. B. Theanin →
    Lemon Balm), eine Ebene tief, Selbstbezug übersprungen, `source_event_id =
    companion:<haupt-id>`; `companions: false` schaltet das ab. Haupteinträge
    in einer Transaktion, `source_event_id = text:<Zeitstempel>` als
    Batch-Marker. **Verifikation: nach dem Commit liest der Endpunkt alle IDs
    (Haupt + Begleit) frisch aus der DB** und antwortet mit `verified` pro
    Eintrag, pro Begleiteintrag und gesamt (`{ batchId, lineCount, requested,
    created, verified, entries: { …, companions[] }[], lineErrors[] }`;
    `requested` = Haupteinträge, `created` = alle verifizierten). `dryRun`
    parst nur (inkl. read-only Begleit-Vorschau `previewCompanions`). 400, wenn
    nichts parsebar.
  - **Cloudflare Access (`server/src/lib/cloudflare_access.ts`)**: Middleware
    `requireCloudflareAccess` validiert das von Cloudflare an den Origin
    gereichte JWT (`Cf-Access-Jwt-Assertion`-Header, alternativ
    `CF_Authorization`-Cookie) komplett in `node:crypto` (keine neue
    Dependency): RS256-Signatur gegen die Team-JWKS
    (`<team>/cdn-cgi/access/certs`, 10-min-Cache, Frisch-Abruf bei
    unbekannter kid für Key-Rotation), `aud` = AUD-Tag, `iss` = Team-Domain,
    `exp`/`nbf` mit 30 s Toleranz. Service-Tokens (CF-Access-Client-Id/
    -Secret) prüft Cloudflare am Edge — am Origin kommt auch dafür ein JWT
    an. Fail-closed: ohne `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503;
    `CF_ACCESS_DISABLED=true` = expliziter Dev-Bypass. Neue Env-Variablen
    siehe Tabelle (Server-Konfiguration). Kein UI-Anteil — der Endpunkt ist
    für externe Automationen (Telegram-Bot, Shortcuts, …) gedacht.
  - Verifiziert: Server-/Web-TS, Server-Build, Vite-Build je exit 0; E2E gegen
    `/tmp`-Scratch-DB (dryRun ohne Schreiben; 7/7 Einträge erstellt+verifiziert
    inkl. DEFAULTS-Menge Theanin, DEFAULTS-Notiz CBD, `30mg`→`30 mg`,
    Dezimal-Komma, „Omega 3 500 mg"-Heuristik, 3 Fehlerzeilen; kein
    Lemon-Balm-Companion; text/plain-Body; 400 bei nur-Fehler-Text; 503 ohne
    CF-Konfig; 401 ohne Token / Müll-Token / manipulierte Signatur / falsche
    Audience / abgelaufen; 201 mit gültigem JWT via Header und via Cookie
    gegen lokalen Test-JWKS).
- **Sammel-Einträge „Morgendmedis" / „Nachtmedis"**:
  - Neuer Endpunkt `POST /api/intakes/plan-batch` (`server/src/routes/intakes.ts`):
    trägt mit einem Aufruf alle Substanzen des zum `takenAt` wirksamen Plans
    ein, die im gewünschten Slot (`morning`/`noon`/`evening`/`night`) eine Dosis
    haben — in einer Transaktion, gleicher Zeitpunkt. Menge/Notiz pro Substanz
    wie bei `POST /` (Standarddosis > DEFAULTS > Plan-`strength`; Notiz aus
    DEFAULTS). Autovivifikation pro Plan-Substanz (`createdSubstance`-Flag je
    Eintrag), `source_event_id = planbatch:<slot>`. **Keine** `Mit:`-Begleit­
    substanzen (Plan ist die maßgebliche Liste, sonst Doppelungen). Dedup
    gleicher Namen innerhalb eines Slots via `nameKey`. Nach dem Eintragen
    greift `allNightMedsTaken(consumptionDay(takenAt))` → `nightMed`/
    `assessmentDate` lösen das Tagesbild aus (so öffnet sich nach „Nachtmedis"
    der Abfragedialog). Antwort: `{ slot, count, entries: { intake,
    createdSubstance }[], nightMed, assessmentDate, assessmentExists }`.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** zwei Sammel-Kacheln
    `PlanBatchTile` („Morgendmedis"/„Nachtmedis") am Anfang des Substanz-Rasters
    — nur sichtbar, wenn der aktuelle Plan (`usePlan()`) für den Slot überhaupt
    Substanzen hat (`morningCount`/`nightCount`). Ein Tipp ist eine Sofort-
    Aktion (keine Auswahl-/Bestätigungsleiste): trägt alles zum Composer-
    `takenAt` ein, Toast mit Substanz-Liste + „Rückgängig" (löscht alle
    erzeugten Einnahmen). Nach „Nachtmedis" öffnet sich bei
    `nightMed && !assessmentExists` das Tagesbild. Neue Mutation
    `useIntakeMutations().planBatch` (invalidiert `substances`/Compliance, wenn
    eine Plan-Substanz neu angelegt wurde); API-Client `api.intakes.planBatch`;
    Typen `PlanSlot`/`PlanBatchEntry`/`PlanBatchResult` (`lib/types.ts`).
- **Menge-Normalisierung: Zahl + Buchstabe bekommt Leerzeichen**:
  - `normalizeAmount()` fügt automatisch ein Leerzeichen zwischen Ziffer
    und Buchstabe ein (`100ml` → `100 ml`, `50mg` → `50 mg`).
  - Wirkt an allen Stellen, wo `amount` entsteht: `POST /api/intakes`,
    `PATCH /api/intakes/:id`, `POST /api/substances`, `PATCH /api/substances/:id`,
    DEFAULTS.md-Parser (`Menge:` + `Mit:`), Begleitsubstanzen.
  - Regex: `(\d)([a-zA-ZäöüÄÖÜßµ])` → `$1 $2` — deckt mg, ml, µg etc. ab.
- **Kachel-Reihenfolge im „Heute"-Tab sortierbar**:
  - Backend war bereits vollständig vorhanden (`sort_order`-Spalte,
    `POST /api/substances/reorder`, `ORDER BY sort_order, name`, API-Client
    `api.substances.reorder`, `useSubstanceMutations().reorder`) — es fehlte
    nur die Bedien-UI.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** neuer
    „Sortieren"-Modus (Toggle neben „Verwalten", ab 2 Substanzen). Im Modus
    wird das Kachel-Raster durch eine vertikale Drag-Liste ersetzt
    (framer-motion `Reorder` + `useDragControls`, Zieh-Griff `GripVertical`) —
    bewusst 1D-Liste statt 2D-Grid-Drag, um Konflikte mit der
    Tap-/Long-Press-Geste der Kacheln zu vermeiden. Neue Reihenfolge wird
    debounced (500 ms) via `reorder.mutate(ids)` automatisch gespeichert;
    „Fertig" und ein `useEffect`-Cleanup beim Verlassen flushen eine noch
    ausstehende Speicherung. Wiederabruf passiert serverseitig über
    `ORDER BY sort_order` (kein Client-State nötig).
- **Begleitsubstanzen via DEFAULTS `Mit:`**:
  - Neue DEFAULTS-Zeile `Mit: <Name> | <Menge> | <Notiz>` (Aliase
    `Zusammen mit:`/`With:`; Menge/Notiz optional, mehrere Zeilen möglich).
    Parser: `CompanionDefault[]` als neues Feld `companions` in
    `SubstanceDefault` (`lib/defaults.ts`).
  - `POST /api/intakes` legt Begleit-Einnahmen im selben Schritt an
    (Transaktion): gleicher `taken_at`, Autovivifikation, Fallback auf
    Standarddosis/eigene DEFAULTS der Begleitsubstanz, `source_event_id =
    companion:<haupt-id>`. Keine Ketten/Zyklen (eine Ebene, Selbstbezug
    übersprungen). `companions: false` im Request schaltet es ab (Backfill).
    Antwort: neues Feld `companions: { intake, createdSubstance }[]`;
    `nightMed` ist auch dann true, wenn erst die Begleitsubstanz
    Nachtmedikation ist (Tagesbild-Trigger).
  - Importer, XLSX-Import und `PATCH /api/intakes/:id` bleiben unberührt.
  - **Frontend:** Composer-Vorschau „Automatisch dazu: …" bei Substanzen mit
    `Mit:`-Defaults; Toast nennt Begleit-Einträge (`+ Name`) und „Rückgängig"
    löscht Haupt- + Begleit-Einnahmen; `useIntakeMutations().create`
    invalidiert `substances`/Compliance, wenn eine Begleitsubstanz neu
    angelegt wurde. Hilfetext + Placeholder im DEFAULTS-Editor erweitert.
- **`effective_from` mit optionaler Uhrzeit**:
  - `effective_from` akzeptiert jetzt auch `YYYY-MM-DDTHH:mm`; reines Datum
    gilt weiter ab Tagesbeginn (keine Migration nötig, String-Vergleich ordnet
    beide Formate korrekt).
  - `planVersionAt(at)` vergleicht zeitpunktgenau: `null` = „jetzt", reines
    Datum = Tagesende des Stichtags. `upcomingPlanVersions()` und das
    `upcoming`-Flag in `/api/plan/versions` vergleichen gegen die aktuelle
    Zeit statt nur den Tag.
  - `PUT /api/plan` validiert `effectiveFrom` als Datum oder Datetime;
    `GET /api/plan/at?date=` akzeptiert auch `YYYY-MM-DDTHH:mm`.
  - **Frontend (`PlanScreen.tsx`):** optionales Uhrzeit-Feld neben „Gültig ab"
    (leer = Tagesbeginn); Hinweistext rechnet minutengenau (rückwirkend /
    heute um HH:MM / geplant). Neue Helfer `formatEffective()` und
    `effectiveTimeOf()` in `lib/format.ts`; `relativeDays()` toleriert
    Datetime-Strings. Anzeige der Uhrzeit in Header, „Geplante Änderung",
    Versions-Verlauf und Snapshot-Sheet.
- **Rückwirkende / zukünftige Plan-Änderungen**:
  - Neue Spalte `plan_versions.effective_from` (Wirkungsdatum, YYYY-MM-DD) mit
    idempotenter Migration + Backfill aus `created_at` in `db.ts`.
  - `planVersionAt()` löst jetzt über das Wirkungsdatum auf; „aktueller Plan"
    = heute wirksame Version (Zukunfts-Versionen zählen noch nicht).
  - `PUT /api/plan` akzeptiert optional `effectiveFrom` (Vergangenheit oder
    Zukunft); `GET /api/plan` liefert zusätzlich `upcoming[]`;
    `GET /api/plan/versions` sortiert nach Wirkungsdatum und liefert
    `effectiveFrom`/`active`/`upcoming` (Feld `date` = Wirkungsdatum).
  - Seed und Importer setzen `effective_from = Tag von created_at`.
  - **Frontend (`PlanScreen.tsx`):** „Gültig ab"-Datumsfeld im Plan-Editor mit
    Hinweistext (rückwirkend / heute / geplant); Karte „Geplante Änderung" über
    dem Plan; Versions-Verlauf zeigt „gültig ab" + Badges „aktuell"/„geplant";
    `SnapshotSheet` lädt jetzt direkt per `GET /api/plan/version/:id` (statt
    Stichtags-Umweg). `relativeDays()` kennt zusätzlich „morgen".
- **Automatische Substanz-QuickPicks + DEFAULTS-Compliance**:
  - `POST /api/intakes` legt unbekannte Namen als QuickPick an
    (`findOrCreateSubstance`, `createdSubstance`-Flag in der Antwort).
  - `backfillSubstancesFromIntakes()` läuft beim Serverstart und nach
    `import.ts --commit` — koppelt Einnahmen ohne `substance_id` an
    vorhandene/neu angelegte Substanzen.
  - Unicode-aware Matching über `nameKey()` (`toLocaleLowerCase('de')`) —
    wichtig für deutsche Umlaute (`CBD-Öl` ↔ `cbd-öl`).
  - `GET /api/defaults/check` liefert vollständigen Compliance-Bericht
    (`compliant` + `missing`).
  - **Frontend:** Warnkarte auf dem Heute-Bildschirm + Warn-Icon auf
    betroffenen Kacheln; neue Sektion „Prüfung: DEFAULTS.md" in den
    Einstellungen mit „Eintrag"-QuickAdd in den DEFAULTS-Editor.

- **2026-06-14 — KI-Tagebuch über MiniMax-Abo statt Anthropic-Key + adaptives Denken + Max-Tokens**:
  - **Ziel (Nutzerwunsch):** Die KI-Tagebuch-Generierung soll wahlweise das
    **MiniMax-Abo** nutzen können statt eines Anthropic-API-Keys. MiniMax bietet
    einen **Anthropic-kompatiblen** Endpunkt
    (`ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`, normaler API-Key,
    **kein OAuth**), das Wire-Format ist identisch — also kein neuer Client nötig.
    Zusätzlich: **`thinking: { type: 'adaptive' }`** für die Generierung und **so
    viele Output-Tokens wie möglich**.
  - **`server/src/lib/anthropic.ts` (`generateText`)**: sendet jetzt das
    `thinking`-Feld (aus `config.anthropic.thinking`, Default `{ type:
    'adaptive' }`) und nutzt `config.anthropic.maxTokens` als `max_tokens`-Default
    (statt des bisherigen Hardcaps). Etwaige `thinking`-Blöcke der Antwort werden
    weiterhin ignoriert (nur `text`-Blöcke fließen in den Tagebuchtext). Neue,
    klarere Fehlermeldung, wenn `stop_reason: "max_tokens"` greift, **bevor** Text
    kam („DIARY_MAX_TOKENS erhöhen"). Weiterhin `x-api-key` (kein
    `Authorization`-Bearer) + `anthropic-version` — passt für Anthropic UND
    MiniMax. Stale-Kommentar („thinking entfernt") korrigiert: adaptives Denken
    ist auf Opus 4.6+/Sonnet 4.6 gültig (nur `budget_tokens` + Sampling-Parameter
    liefern 400) UND auf MiniMax.
  - **`server/src/config.ts`**: zwei neue Felder unter `config.anthropic` —
    `maxTokens` (`DIARY_MAX_TOKENS`, Default **32000**) und `thinking`
    (`DIARY_THINKING` via neuem `parseThinking()`: leer/`adaptive`/`on`/`true` →
    `{ type:'adaptive' }`; `off`/`none`/`disabled`/`false`/`0`/`no` → weggelassen;
    positive Zahl → `{ type:'enabled', budget_tokens:N }` für ältere Modelle).
    `ANTHROPIC_BASE_URL`/`DIARY_MODEL` waren bereits vorhanden.
  - **`server/src/lib/diary.ts`**: der harte `maxTokens: 700`-Cap beim
    `generateText`-Aufruf ist raus → es greift der konfigurierte (hohe) Default,
    sodass adaptives Denken genug Spielraum hat, ohne den kurzen Text
    abzuschneiden.
  - **`.env.example` / `deploy.sh` / `AGENTS.md`**: MiniMax-Block + `DIARY_THINKING`
    + `DIARY_MAX_TOKENS` dokumentiert; `deploy.sh` reicht beide neuen Vars in die
    systemd-Unit durch (Reihenfolge nach `DIARY_MODEL`); Env-Tabelle ergänzt.
  - **Keine UI-/Schema-Änderung**: Route `/api/diary/generate`, Antwort und das
    503-Verhalten ohne Key bleiben unverändert. Für MiniMax setzt der Nutzer in
    `.env`: `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`,
    `ANTHROPIC_API_KEY=<MiniMax-Key>`, `DIARY_MODEL=MiniMax-M2` (Modellname nach
    Wahl). `DIARY_THINKING`/`DIARY_MAX_TOKENS` sind optional (Defaults wie oben).
  - **Verifiziert:** Server-TS (`tsc --noEmit`) exit 0; E2E gegen einen
    In-Process-Mock im Anthropic-Wire-Format (5 Szenarien, je gegen das echte
    `generateText`): (A) MiniMax-Default → `POST /v1/messages`,
    `thinking:{type:adaptive}`, `max_tokens:32000`, Modell `MiniMax-M2`,
    `x-api-key` gesetzt / **kein** `Authorization`, `anthropic-version` gesetzt,
    `thinking`-Block der Antwort verworfen → nur Text übernommen; (B)
    `DIARY_MAX_TOKENS=64000` greift; (C) `DIARY_THINKING=off` → `thinking`-Feld
    fehlt; (D) `DIARY_THINKING=8000` → `{type:enabled,budget_tokens:8000}`; (E)
    ohne Key → `AnthropicNotConfiguredError` (503-Pfad), **keine** HTTP-Anfrage.

- **2026-06-14 — Frontend-Auto-Detect, KI-Tagebuch-Tab, Mehrfach-Eintrag**:
  - **(1) `deploy.sh`/Frontend immer erreichbar (Gürtel + Hosenträger):**
    - `server/src/config.ts → webDist`: ohne `WEB_DIST`-Env wird ein neben dem
      Build liegendes `web/dist` (`SERVER_ROOT/web/dist`) **automatisch erkannt**
      und ausgeliefert. Das Build-Layout (`build.sh`) legt das Frontend genau
      dorthin (`~/mediary/web/dist`), `GET /` funktioniert also nach
      `npm run deploy` auch ohne Env. Im Dev-Modus (`SERVER_ROOT = server/`)
      existiert der Pfad nicht → API läuft solo, Vite bedient :5173.
    - `deploy.sh`: fehlt `WEB_DIST` in `.env`, wird **Default `./web/dist`**
      injiziert (zuvor: keine Env → kein Frontend → „Cannot GET /"). Zusätzlich
      werden `DIARY_PATH`/`ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`DIARY_MODEL`
      aus `.env` in die Service-Unit durchgereicht.
    - Verifiziert: Build-Layout in `/tmp/inst` (dist + web/dist, **kein**
      WEB_DIST-Env) → `GET /` 200 (index.html), `/api/health` 200, Asset 200,
      Log „Serving frontend from …/web/dist"; `deploy.sh`-Injection isoliert →
      `Environment="WEB_DIST=./web/dist"` landet in der Unit, Marker ersetzt.
  - **(2) KI-Tagebuch als neuer Tab** (`/tagebuch`):
    - Kurzversion (`GET /api/diary/notes`): reine Liste der Notizen je
      Konsum-Tag (Einnahme-Notizen + Tagesbild-Werte/-Notiz), liest nur, ändert
      die DB nie. Vollversion: pro Tag ein KI-Fließtext, geführt in einer
      separaten `.md` (`config.diaryPath`, Default `~/.local/share/mediary/
      diary.md`) — die DB-Notizen bleiben unberührt.
    - **Anthropic-Anbindung dependency-frei via `fetch`** (`server/src/lib/
      anthropic.ts`, wie CF-Access node:crypto nutzt): `POST {baseUrl}/v1/
      messages`, Header `x-api-key`/`anthropic-version: 2023-06-01`, Modell
      `config.anthropic.model` (Default `claude-opus-4-8`, via `DIARY_MODEL`
      überschreibbar), keine `temperature`/`thinking` (auf Opus 4.8 entfernt).
      `refusal`-Stop-Reason wird abgefangen. Ohne Key → 503 (fail-soft, Kurz­
      version & Anzeige funktionieren weiter).
    - `server/src/lib/diary.ts`: `gatherDiaryDays` (pro Konsum-Tag mit
      `consumptionDay`), `.md`-Parser/-Assembler über `<!-- meDiary:day DATE -->`
      -Marker (manuelle Edits bleiben erhalten; `scope:'missing'` ergänzt nur
      fehlende Tage, `scope:'all'` regeneriert, `max` deckelt pro Aufruf →
      `pendingDays`). Route `server/src/routes/diary.ts`, gemountet in `index.ts`.
    - Frontend: neuer Tab „Tagebuch" (`BottomNav`/`App.tsx`),
      `web/src/screens/DiaryScreen.tsx` mit Umschalter Kurz/Voll, Generieren-/
      „Alles neu"-/Bearbeiten-Aktionen, Status-Badges; Hooks
      `useDiaryNotes`/`useDiary`/`useGenerateDiary`/`useSaveDiary`, API-Client
      `api.diary.*`, Typen `Diary*`.
    - Verifiziert (Mock-Anthropic, `/tmp`-DB): Kurzversion listet Notizen +
      Scores; `generate` (missing) erzeugte 6 Einträge + schrieb 6 `meDiary:day`
      -Marker; erneut → 0 neu; `PUT` Round-Trip; **503 ohne Key**, Notes ohne
      Key weiter 200.
  - **(3) Mehrere Substanzen auf einmal eintragen** (`POST /api/intakes/batch`):
    - Body `{ takenAt?, companions?, entries: [{ substanceId?|substanceName?,
      amount?, notes? }] }` — ein gemeinsamer Zeitpunkt, je Eintrag eigene
      Menge/Notiz, eine Transaktion. Gleiche Auflösung wie `POST /`
      (Menge: Text > Standarddosis > DEFAULTS; Notiz: Text > DEFAULTS;
      Autovivifikation; `Mit:`-Begleitsubstanzen je Eintrag — abschaltbar mit
      `companions: false`). Danach `allNightMedsTaken` → `nightMed`/
      `assessmentDate`. Der Companion-Insert wurde als Helfer `insertCompanions`
      faktorisiert und von `POST /` mitbenutzt (identisches Verhalten).
    - Frontend `QuickEntryScreen`: Einfach-Auswahl → **Mehrfach-Auswahl**
      (`selectedIds[]`). Mehrere angetippte Substanzen erscheinen im Composer
      als je eine Zeile mit Menge + Notiz (inkl. DEFAULTS-/Begleit-Vorschau),
      Datum/Uhrzeit nur einmal. Schwebende Leiste „X Substanzen · Eintragen"
      → `useIntakeMutations().batch`; Long-Press auf einer Kachel bleibt der
      Sofort-Eintrag mit Standardwerten. Typen `IntakeBatch*`, `api.intakes.batch`.
    - Verifiziert (`/tmp`-DB): 3 Substanzen in einem Call (gemeinsamer
      `takenAt`, je eigene Menge/Notiz, neue Substanz autoviviziert +
      Begleitstoff Lemon Balm), `companions:false` unterdrückt Begleiteintrag,
      ungültige `substanceId`/leere `entries` → 400.
  - **Nachgelagerte Review-Härtung** (adversarialer Multi-Agent-Audit, je
    gegen-verifiziert): (a) `generateDiary` geht IMMER von den bestehenden
    Einträgen aus — `scope:'all'` mit `from/to` löschte zuvor Einträge außerhalb
    des Bereichs (Datenverlust manueller Edits); `'all'` regeneriert nun bis zum
    Hard-Cap. (b) `POST /api/intakes/batch` prüft alle `substanceId` in einer
    Vorab-Pass, BEVOR per Name neue Substanzen angelegt werden (sonst Leiche bei
    400 wegen späterer ungültiger ID). (c) `deploy.sh` maskiert Geheimnisse
    (`*API_KEY*/*SECRET*/*TOKEN*`) beim Loggen und trimmt `.env`-Werte per
    Bash-Parameter-Expansion statt `xargs` (quote-/backslash-sicher, kein Abbruch
    unter `set -e`). (d) `writeDiaryRaw` legt das Eltern­verzeichnis an
    (`mkdir -p`). (e) Frontend: Sammel-Eintrag baut aus `selectedSubs` (keine
    toten IDs), Tagebuch-Editor lädt den Entwurf nur beim Öffnen (kein
    Überschreiben durch Refetch), „Voll"-Tab zeigt bei Lade-/Offline-Fehler eine
    Karte statt leer.
  - **Verifikation gesamt:** Server-TS + Web-TS je exit 0, Server-Build
    (`tsc`) + Vite-Build je exit 0; E2E gegen `/tmp`-Scratch-DB (Batch inkl.
    Begleitstoffe/400s/`companions:false`; Tagebuch Kurz/generate(Mock)/regen/
    PUT/503; `scope:'all'`-Datenerhalt; Batch-Leak-Schutz; Tagebuch-mkdir;
    Frontend-Auto-Detect-Serving); Live-`./data` unberührt.

- **2026-06-14 — `deploy.sh` Env-Injection repariert (robuster Marker)**:
  - **Bug:** `deploy.sh` hat den WEB_DIST (und andere Env-Vars aus `.env`)
    nur dann in die systemd-Service-Unit injiziert, wenn die alte
    `awk`-Regex `^# Environment="WEB_DIST=/custom/path/web/dist"$` **exakt**
    auf die (auskommentierte) Beispiel-Zeile in `mediary.service` passte.
    Sobald jemand das Service-Template editiert, den Kommentar umformuliert
    oder einfach keine `/custom/path/web/dist`-Beispielzeile mehr da war
    (typisch nach `git pull` oder nach dem Hot-Fix-Stand `2c318cb9`, der
    den Service-Block anders strukturiert hatte), fiel `deploy.sh`
    **fail-silent** in den `else`-Branch und kopierte die Service-Datei
    unverändert — der User merkte erst im Browser mit
    `Cannot GET /`, dass das Frontend fehlt. Genau das war auf dem
    laufenden VPS der Fall: installierte Unit unter
    `~/.config/systemd/user/mediary.service` hatte **kein**
    `Environment="WEB_DIST=..."`, `GET /` → 404, obwohl der Build
    `~/mediary/web/dist/` korrekt vorhanden war.
  - **Fix `mediary.service`:** Auskommentierten Beispiel-Block durch
    **eindeutige Marker-Zeile** `__MEDIARY_INJECT_ENV_HERE__` ersetzt.
    deploy.sh matcht diese eine Zeile, nicht mehr einen exemplarischen
    Pfad. Marker-Drift (0 oder >1 Vorkommen) führt zu `exit 1` mit
    klarer Fehlermeldung — kein stummes „Cannot GET /" mehr.
  - **Fix `deploy.sh`:** Marker-Logik von `awk`-Regex auf
    `awk` mit `$0 == "# __MEDIARY_INJECT_ENV_HERE__"`-Match umgestellt
    (newline-treu, immun gegen Template-Drift). Reihenfolge der injizierten
    Vars: WEB_DIST zuerst, dann PORT/DB_PATH/DEFAULTS_PATH/CF_ACCESS_*.
    Kein `else`-Fail-silent mehr: bei fehlender `.env` wird die
    Service-Datei sauber ohne Marker kopiert (mit erklärendem Kommentar),
    bei vorhandener `.env` muss die Marker-Zeile **genau einmal**
    vorkommen — sonst Exit 1. Zusätzlich Sanity-Check: nach dem
    Schreiben prüft das Skript, dass `Environment="WEB_DIST=…"` (falls
    in `.env` gesetzt) tatsächlich in der resultierenden Service-Unit
    steht, und failt sonst mit klarer Meldung.
  - **Hot-Fix auf laufendem System:** `~/.config/systemd/user/mediary.service`
    einmalig manuell um `Environment="WEB_DIST=./web/dist"` ergänzt,
    `systemctl --user daemon-reload && systemctl --user restart mediary`.
    **Verifiziert:** `GET /` → 200 (`<!doctype html>` aus
    `~/mediary/web/dist/index.html`), `GET /api/health` → 200,
    `GET /favicon.svg` → 200, `GET /api/intakes` → 200, SPA-Fallback
    funktioniert. Server-Log: `[mediary] Serving frontend from
    /home/ubuntu/mediary/web/dist`.
  - **Folge-Aktion für User:** Beim nächsten `npm run deploy` greift
    der neue Marker-Pfad automatisch — `.env` weiterhin mit
    `WEB_DIST=./web/dist` (oder absolut) pflegen, der Rest läuft.

- **2026-06-14 — Merge-Konflikt aufgelöst** (Task `0a55cd9d`):
  - **Bug:** `b409d7a` (Merge `cd/task/2c318cb9` + `cd/task/448cd00a`) wurde
    mit ungelösten Konflikt-Markern committet:
    - `server/src/config.ts`: `<<<<<<< HEAD`/`=======`/`>>>>>>> 06ee54f…`
      zwischen altem `dotenv.config({ path: '../../.env' })` + `SERVER_ROOT =
      __dirname/..` und der neuen `findServerRoot()`-Variante. Folge:
      `tsc` brach mit **TS1185 „Merge conflict marker encountered"** ab,
      Server-Build komplett blockiert.
    - `AGENTS.md`: gleiches Muster in der Sektion „Letzte Änderungen
      (jüngste zuerst)" — HEAD-Block (Freitext-Parser-Verbesserungen aus
      PR #1-Nachfolger) gegen `06ee54f`-Block (Tagesgrenze 03:30 /
      Composer-Reset aus PR #2).
  - **Resolution `config.ts`:** `06ee54f`-Seite übernommen (mit
    `dotenv.config()` ohne expliziten Pfad, `findServerRoot()`,
    `resolveFromRoot` löst gegen `process.cwd()`). Diese Variante ist
    konsistent mit dem Code unterhalb des Konfliktbereichs und entspricht
    der auf dem laufenden Service deployeten Version (siehe Eintrag
    „Cannot GET /"-Fix).
  - **Resolution `AGENTS.md`:** beide Blöcke zusammengeführt — HEAD-Block
    zuerst (jüngste Commits aus PR #1-Nachfolger), dann `06ee54f`-Block
    (PR #2), dann nahtlos weiter mit „Dokumentation: Mehrzeiltextinput-API
    erklärt" usw.
  - **Verifiziert:** `npx tsc --noEmit` gegen `server/src/config.ts`
    (mit `@types/node` + `dotenv` in `/tmp`-Sandbox) → exit 0, keine
    TS1185-Marker mehr. Repo-intern keine `node_modules` (Worktree-Stand),
    voller Build nur nach `npm run install:all` möglich.

- **2026-06-14 — „Cannot GET /"-Fix** (Task `2c318cb9`):
  - **Bug:** Nach Commit `18833b2` (`.env`-basierte `WEB_DIST`-Konfiguration)
    wurde `npm run deploy` nicht erneut ausgeführt → die installierte
    `~/.config/systemd/user/mediary.service` enthielt keinen `WEB_DIST`.
    Dazu kam ein **zweiter Bug in `deploy.sh`**: `${VAR}\n` in doppelten
    Bash-Anführungszeichen ist literaler Text, kein Newline — die injizierten
    Env-Lines landeten alle in **einer** Zeile und wurden vom
    systemd-Parser ignoriert. **Dritter Bug:** `resolveFromRoot()` im
    gebauten `dist/config.js` löste `WEB_DIST=../web/dist` zu
    `/home/ubuntu/web/dist` auf (statt `/home/ubuntu/mediary/web/dist`),
    weil `SERVER_ROOT` im Build = `~/mediary` ist und `..` darüber hinaus
    ging.
  - **Fix 1:** `deploy.sh` baut `SERVICE_ENV_LINES` jetzt als Bash-Array
    und schreibt die Env-Lines über `awk` (statt `sed`) in die Service-Unit
    ein. Damit landet jede Env-Variable in einer eigenen Zeile.
  - **Fix 2:** `server/src/config.ts → resolveFromRoot()` löst **alle**
    relativen Pfade aus der `.env` gegen `process.cwd()` auf (nicht mehr
    gegen `SERVER_ROOT`). Empfohlener `WEB_DIST`-Wert: `./web/dist`
    (relativ zu `WorkingDirectory=%h/mediary`).
  - **Hot-Fix auf dem laufenden Service:** `~/mediary/dist/config.js`
    wurde direkt gepatcht, `~/.config/systemd/user/mediary.service` um
    `Environment="WEB_DIST=./web/dist"` ergänzt, Service neu gestartet.
    Verifiziert: `GET /` → 200 (`index.html`), `GET /assets/...js` → 200,
    SPA-Fallback → 200, `/api/health` → 200, `/api/substances` → 200.
  - **Folge-Aktion für User:** `npm run deploy` ausführen, sobald der
    Source-Stand konsistent sein soll — der neue `deploy.sh` läuft jetzt
    sauber durch und schreibt die Service-Unit korrekt.

- **Bestehende Features** (siehe README): versionierter Plan, 11 Tages-Skalen,
  Android-APK, Markdown-Importer, Light/Dark-Mode „Apotheken"-Design.
