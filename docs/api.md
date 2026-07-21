# meDiary — API-Referenz

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## API-Referenz (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | 11 Tages-Skalen |
| `GET/POST` | `/api/substances` | Substanzen lesen / anlegen |
| `PATCH/DELETE` | `/api/substances/:id` | ändern / archivieren (`?hard=true` löscht) |
| `POST` | `/api/substances/reorder` | Kachel-Reihenfolge setzen (`{ ids: number[] }` → `sort_order = Index`) |
| `GET/POST` | `/api/intakes` | Einnahmen (DEFAULTS-Logik, Autovivifikation) |
| `POST` | `/api/intakes/plan-batch` | alle Plan-Substanzen eines Slots auf einmal eintragen („Morgendmedis"/„Nachtmedis", `{ slot, takenAt? }`) |
| `POST` | `/api/intakes/batch` | mehrere frei gewählte Substanzen auf einmal — gemeinsamer `takenAt`, je eigene Menge/Notiz (`{ takenAt?, companions?, entries: [{ substanceId?\|substanceName?, amount?, notes? }] }`) |
| `POST` | `/api/intakes/text` | mehrzeiligen Freitext (Format: SAMPLES.md) in Einnahmen umwandeln — **Cloudflare-Access-geschützt**, mit DB-Verifikation in der Antwort |
| `PATCH/DELETE` | `/api/intakes/:id` | ändern / löschen |
| `GET` | `/api/plan` | heute wirksamer Plan + `upcoming` (geplante Zukunfts-Versionen) |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan zum Stichtag/Zeitpunkt (`date` auch `YYYY-MM-DDTHH:mm`) |
| `GET` | `/api/plan/diff?days=N` | Plan-Diff |
| `GET` | `/api/plan/versions` | Versions-Verlauf (sortiert nach Wirkungsdatum, mit `active`/`upcoming`-Flags) |
| `PUT` | `/api/plan` | neue Plan-Version; optional `effectiveFrom: "YYYY-MM-DD"` oder `"YYYY-MM-DDTHH:mm"` (rückwirkend/zukünftig, Default heute) |
| `GET` | `/api/assessments?from=&to=` | Tagesbilder (Trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Tagesbild lesen / speichern / löschen |
| `GET/PUT` | `/api/defaults` | DEFAULTS.md lesen / schreiben |
| `PUT` | `/api/defaults/sections` | Strukturierte Sections schreiben (siehe unten) — **CF-Access** |
| `GET` | `/api/defaults/check` | DEFAULTS-Compliance-Bericht |
| `GET` | `/api/diary/notes?from=&to=` | Kurzversion: Liste der Notizen je Konsum-Tag (Einnahme-Notizen + Tagesbild + Wachzeit-Habit + **Hermes-Agent-Tagesbericht**). Tage zählen als „noteworthy", sobald EINE dieser Quellen vorliegt — auch ein reiner Agent-Bericht ohne Medikations-Daten erscheint. |
| `GET` | `/api/diary` | Zustand des KI-Voll-Tagebuchs (`raw`, `entries[]`, `generatedDays`/`pendingDays`, `available`) |
| `POST` | `/api/diary/generate` | KI-Volltext generieren (`{ scope?: 'missing'\|'all', from?, to?, max? }`); 503 ohne `ANTHROPIC_API_KEY` |
| `PUT` | `/api/diary` | Tagebuch-Datei manuell überschreiben (`{ content }`) |
| `POST` | `/api/habit/uptime` | Tägliche **Wachzeit** melden (`{ last_user_interaction_unix, first_user_interaction_24h_unix }`); Ziel-Datum = **Konsum-Vortag**; berechnet `wake_first`/`wake_last` aus Einnahmen + Webhook, fließt in `gatherDiaryDays()` (Kurz + KI-Prompt) ein |
| `GET` | `/api/habit?from=&to=` | Liste der Habit-Tage (Range) |
| `GET` | `/api/habit/:date` | Einzelner Habit-Tag (immer 200, `exists: false`, wenn leer) |
| `DELETE` | `/api/habit/:date` | Habit-Datensatz löschen (204 / 404) |
| `GET` | `/api/dreams?from=&to=&limit=` | Träume (nächtliche Auswertungen), neueste zuerst; `{ dreams, available, busy }` |
| `GET` | `/api/dreams/latest` | Jüngster Traum (Startup-Dialog); `{ …, exists, available }` |
| `POST` | `/api/dreams/generate` | Manueller Trigger (`{ date?, force? }`); **token-primär** (`X-Dream-Token`), fail-closed (403 ohne Auth, 429 Rate-Limit, 503 ohne `MINIMAX_API_KEY`, 409 wenn schon eine läuft) |
| `GET` | `/api/dreams/:date` | Einzelner Traum (immer 200, `exists: false`, wenn leer) |
| `DELETE` | `/api/dreams/:date` | Traum löschen (204 / 404) |
| `POST` | `/api/report/new` | Tagesbericht des Hermes-Agents einliefern (`{ date?, report, source? }`); idempotenter Upsert pro Konsum-Tag (Default-`date` = `dreamTargetDate(now)`, also Konsum-Vortag — passt zum 03:30-Berlin-Cron und zum Traum-Ziel um 04:20). Fließt in den Traum-Kontext ein (siehe `gatherDreamContext`). 200 mit `{ date, report, source, createdAt, updatedAt, exists }`; 400 bei leerem/zu langem `report`. |
| `GET` | `/api/report?from=&to=&limit=` | Tagesberichte-Liste (neueste zuerst); `{ reports[] }` |
| `GET` | `/api/report/:date` | Einzelner Tagesbericht (immer 200, `exists:false` wenn leer) |
| `DELETE` | `/api/report/:date` | Tagesbericht löschen (204 / 404) |
| `GET` | `/api/chat/status` | Daten-Konsole: `{ available, model }` (`available:false` ohne Key) |
| `GET` | `/api/chat/change-sets?limit=` | Change-Set-Audit-Log (neueste zuerst); `{ changeSets[], latestAppliedId, available }` |
| `GET` | `/api/chat/change-sets/:id` | Einzelnes Change-Set (`{ changeSet, latestAppliedId }`, 404) |
| `POST` | `/api/chat/message` | **SSE** — Natürlichsprache-Anfrage (`{ message, history? }`); streamt `token`/`thinking`/`tool`/`changeset`/`done`/`error`. **CF-Access**, rate-limitiert, 503 ohne Key |
| `POST` | `/api/chat/change-sets/:id/apply` | Change-Set anwenden (transaktional + Undo-Snapshot); 409 wenn nicht `proposed`. **CF-Access** |
| `POST` | `/api/chat/change-sets/:id/undo` | Jüngstes angewandtes Change-Set rückgängig machen; 409 sonst. **CF-Access** |
| `POST` | `/api/chat/change-sets/:id/discard` | Vorgeschlagenes Change-Set verwerfen; 409 wenn nicht `proposed`. **CF-Access** |

### `PUT /api/defaults/sections`

Strukturierte DEFAULTS.md-Mutation. Der Web-Editor (`/standardnotizen`)
schickt pro Substanz einen Eintrag; der Server validiert (Doppelnamen
case-insensitive via `nameKey`, keine Selbst-Referenz als Begleitstoff,
Längen-Caps), serialisiert zurück in Markdown und schreibt atomar. Der
Dokumenttitel (`# DEFAULTS.md`) und alles vor der ersten `## …`-Section
bleibt erhalten; Zeilen unter einer Section, die nicht als `Menge:`/
`Notiz:`/`Mit:` interpretierbar sind (z.B. `NACH 2026-08-01 12:00 CEST: …`
oder `DAVOR: …`), werden als `preLines` / `postLines` der jeweiligen
Section verlustfrei übernommen.

**Auth:** Cloudflare Access, fail-closed (siehe Env-Tabelle).
`CF_ACCESS_DISABLED=true` ist der Dev-Bypass; lokal reicht das für Smoke-
Tests vollkommen.

> **Standard-Menge = Single Source of Truth in DEFAULTS.md.** Das
> `defaultDose`-Feld von `POST/PATCH /api/substances` wird NICHT in die
> DB-Spalte `substances.default_dose` geschrieben, sondern serverseitig
> über `upsertSectionAmount()` als `Menge:` der jeweiligen Section nach
> `DEFAULTS.md` überführt (Notiz/`Mit:`/Kommentare bleiben unangetastet).
> `GET /api/substances` liest `defaultDose` via `defaultAmountFor(name)`
> aus der Datei zurück. Die DB-Spalte ist entmachtet (bleibt nur fürs
> Undo-Snapshot-Restore im Schema). Beim Serverstart überführt eine
> idempotente Migration (`migrateDefaultDosesToDefaultsFile`) evtl. noch
> vorhandene DB-Werte nach `DEFAULTS.md` — bestehende `Menge:`-Einträge
> gewinnen bei Konflikt — und leert die Spalte.

**Request** (`PUT /api/defaults/sections`):

```json
{
  "sections": [
    {
      "name": "Modafinil",
      "amount": "100 mg",
      "note": "morgens",
      "companions": [],
      "preLines": [],
      "postLines": []
    },
    {
      "name": "L-Theanin",
      "amount": "400 mg",
      "note": null,
      "companions": [
        { "name": "Lemon Balm", "amount": "100 mg", "note": null }
      ],
      "preLines": [],
      "postLines": []
    }
  ]
}
```

- `amount` / `note` / `companion.amount` / `companion.note`: `string | null`, ≤ 80 bzw. 1000 Zeichen.
- `preLines` / `postLines`: `string[]` — Zeilen, die das Frontend nicht
  strukturiert pflegen will (z.B. `NACH …`-Vorbehalte). Werden 1:1 mit
  einer Leerzeile Abstand davor wieder in den Markdown-Text eingefügt.
- Leere Sections (alles `null`/`[]`) werden stillschweigend weggelassen.

**Response (200):** dieselbe Form wie `GET /api/defaults` —
`{ defaults, raw }` (frisch geparst + Rohtext nach dem Schreiben).

**Errors:**

| Status | Bedeutung |
|---|---|
| 400 | Doppelname (case-insensitive), Begleitstoff = Sektion selbst, Name leer / zu lang, `Menge`/`Notiz` zu lang, Zod-Validation fehlgeschlagen |
| 401/403 | Cloudflare Access nicht erfüllt (fail-closed) |
| 503 | Server ohne `DEFAULTS_PATH` konfiguriert oder Datei nicht beschreibbar |

`POST /api/intakes` liefert `{ intake, nightMed, assessmentDate, assessmentExists, createdSubstance, companions }` — `createdSubstance: true` heißt, der Name war neu und wurde als QuickPick angelegt; `companions` (`{ intake, createdSubstance }[]`) sind die automatisch miterfassten Begleit-Einnahmen aus `Mit:`-Defaults (leer, wenn keine).

`POST /api/intakes/plan-batch` (`{ slot: "morning"|"noon"|"evening"|"night", takenAt? }`) trägt **alle** Substanzen des zum `takenAt` wirksamen Plans ein, die im jeweiligen Slot eine Dosis haben — die Sammel-Einträge „Morgendmedis" (morning) und „Nachtmedis" (night) im Heute-Tab. Pro Substanz gilt dieselbe Auflösung wie bei `POST /` (Menge: DEFAULTS > Plan-`strength`; Notiz aus DEFAULTS), Autovivifikation inklusive (`source_event_id = planbatch:<slot>`). Begleitsubstanzen (`Mit:`) werden hier bewusst NICHT miterfasst (der Plan ist die maßgebliche Liste; sonst Doppelungen). Antwort: `{ slot, count, entries: { intake, createdSubstance }[], nightMed, assessmentDate, assessmentExists }`. Wie bei `POST /` löst auch hier das Komplettieren aller Nacht-Medis das Tagesbild aus.

`POST /api/intakes/text` (Body: JSON `{ text, dryRun?, companions? }` oder direkt `text/plain`) wandelt mehrzeiligen Freitext in Einnahmen um. Format pro Zeile siehe **SAMPLES.md** im Projekt-Root: optionales Präfix `DD.MM(.YYYY) HH:MM:` (ohne Jahr = aktuelles, ohne Datum = heute), nur `HH:MM:`, `jetzt:` oder gar kein Präfix (= aktuelle Zeit); danach Einträge `Substanz Menge (Notiz)`, getrennt durch Kommas und/oder „ und " (Dezimal-Kommas wie `0,5 ml` und Klammer-Inhalte trennen nicht). **Menge und Substanz dürfen in beider Reihenfolge stehen** — „Pregabalin 100 mg" ebenso wie „100mg Pregabalin" / „200 mg Lorazepam": ein bereits BEKANNTER Substanzname (alle Namen, aktiv + archiviert, werden der Route an `parseFreeText` übergeben) dient als Trennung zwischen Menge und Notiz (Menge davor/danach, freie Notiz dahinter ohne Klammern, z. B. „150mg Pregabalin morgens"); ist der Name unbekannt, gilt eine führende Menge MIT Einheit als Menge und der Rest als neuer Name, sonst Substanz-zuerst (Menge ab dem ersten Zahl-Token, bei Folgen wie „Omega 3 500 mg" beim letzten der Zahlen-Folge — eine führende einheitenlose Zahl wie „300 Baldrian" gilt als Menge). **Menge und/oder Notiz dürfen weggelassen werden — dann greifen die DEFAULTS.md-Werte** (Menge: Text > DEFAULTS; Notiz: Klammer > DEFAULTS-Notiz). Autovivifikation wie bei `POST /`. **`Mit:`-Begleitsubstanzen aus DEFAULTS.md werden — wie bei `POST /` — pro Eintrag automatisch als eigene Einnahme zum selben Zeitpunkt miterfasst** (z. B. Theanin → Lemon Balm), eine Ebene tief, Selbstbezug übersprungen, `source_event_id = companion:<haupt-id>`; `companions: false` im JSON-Body schaltet das ab. Jede Zeile wird einzeln verarbeitet und ist atomar — ein fehlerhafter Eintrag macht die ganze Zeile zum `lineErrors`-Element, die übrigen Zeilen werden trotzdem angelegt (alle Inserts einer Anfrage in einer Transaktion, `source_event_id = text:<Zeitstempel>` als Batch-Marker für die Haupteinträge). **Nach dem Schreiben liest der Endpunkt die Einträge (inkl. Begleitsubstanzen) frisch aus der DB** und meldet, welche wirklich angekommen sind. Antwort (201): `{ batchId, lineCount, requested, created, verified, entries: { line, createdSubstance, verified, intake, companions: { createdSubstance, verified, intake }[] }[], lineErrors: { line, text, error }[] }` — `requested` zählt die Haupteinträge, `created` alle verifizierten Einträge (Haupt + Begleit), `verified` ist genau dann true, wenn jeder geplante Insert in der DB gefunden wurde. 400, wenn gar kein Eintrag parsebar war; `dryRun: true` liefert nur das Parse-Ergebnis (mit Begleit-Vorschau `entries[].companions[]`) ohne zu schreiben. **Zugriffsschutz:** Cloudflare Access (siehe Env-Tabelle) — ohne Konfiguration antwortet der Endpunkt 503 (fail-closed), `CF_ACCESS_DISABLED=true` ist der Dev-Bypass.

**Kurzreferenz `/api/intakes/text` für externe Clients:** Lokal/Smoke-Test mit
`CF_ACCESS_DISABLED=true`; produktiv über die Cloudflare-Access-geschützte URL
aufrufen (Login-Cookie oder Service-Token am Cloudflare-Edge; am Origin wird
das daraus entstehende JWT aus `Cf-Access-Jwt-Assertion` bzw. `CF_Authorization`
validiert). Vor echten Writes erst `dryRun: true` senden. Beispiel:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true,"text":"12.06.2026 08:30: Elvanse 30mg (nüchtern), Lithium 300 mg\njetzt: Theanin"}'
```

Für den echten Import `dryRun` weglassen; wenn keine automatischen
`Mit:`-Begleitsubstanzen angelegt werden sollen, `{ "companions": false }`
mitsenden. `text/plain` funktioniert ebenfalls:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: text/plain' \
  --data-binary $'08:30: Elvanse 30mg (nuechtern)\njetzt: Theanin'
```

## WhatsApp & Delivery (`/api/whatsapp`, `/api/deliveries`)

Dream delivery is a separate concern from dream generation. Generation runs in
the scheduler at `DREAM_TIME`; delivery runs as a follow-up step that posts
the formatted text + TTS voice note to WhatsApp. All state is tracked in
`dream_deliveries` for the in-app log.

### `GET /api/whatsapp/status`
**Auth:** open read.
**Returns:** `{ state, hasCreds, lastConnectedAt, lastQrAt, lastError, configured, adminEnabled, jid }` where `state ∈ {disconnected, connecting, qr, connected}`.

### `GET /api/whatsapp/qr`
**Auth:** CF-Access protected (admin).
**Returns:** `{ qr: <base64 PNG> }` (the QR as base64, no data: prefix) when `state === 'qr'`. **404** otherwise.

### `POST /api/whatsapp/reconnect`
**Auth:** CF-Access protected (admin).
**Returns:** `202 { ok: true }` — kicks off logout + creds wipe + reconnect. Use the admin UI's "Neu verbinden" button to see the fresh QR.

### `POST /api/whatsapp/test`
**Auth:** CF-Access protected (admin).
**Returns:** `{ ok, recipient? }` on success, or `503 { error }` on failure. Sends a test text to the first enabled target.

### `GET /api/whatsapp/targets` / `POST /api/whatsapp/targets`
**Auth:** CF-Access protected (admin).
**GET** → `{ targets: DeliveryTarget[] }`. **POST** body `{ phone, displayName? }` → `{ target }` (201). Phone must be 8–15 digits.

### `GET /api/deliveries`
**Auth:** open read.
**Query:** `?dream_date=YYYY-MM-DD&limit=N` (limit 1–500, default 100).
**Returns:** `{ deliveries: DreamDelivery[] }` where each has `{ id, dreamDate, channel, recipient, status, voiceStatus, attempts, error, sentAt, createdAt, updatedAt }`. `status ∈ {pending, sent, failed, abandoned}`. `voiceStatus ∈ {none, sent, failed}`.

### `POST /api/dreams/:date/redeliver`
**Auth:** CF-Access protected (admin).
**Returns:** `{ date, attempted, sent, failed }`. Resets the matching `dream_deliveries` rows to `status='pending'`, increments attempts, and re-runs the delivery (text + voice). No body required.
