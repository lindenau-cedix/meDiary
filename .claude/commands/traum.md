# Claude-Code-Auftrag: Nächtliches „Träumen", Traum-Tab & Startup-Dialog

Du arbeitest an einer bestehenden Webapp (Konsum- & Befindenstagebuch, dunkles, warmes, literarisches Design). Setze die unten beschriebenen Funktionen um. **Das Design der neuen Bereiche hat höchste Priorität** – nimm dir dafür ausdrücklich Zeit und liefere etwas Stimmiges, kein Standard-Bootstrap-Gefühl.

---

## 0. Erst erkunden, dann ändern (verbindlich)

Bevor du irgendetwas änderst, verschaffe dir einen Überblick und fasse ihn kurz zusammen:

- **Stack**: Frontend-Framework, Backend (die `.env` enthält bereits `ANTHROPIC_API_KEY` / `DIARY_MODEL`, im UI steht „Modell claude-opus-4-8" → es gibt eine serverseitige KI-Integration). Welche Sprache/Framework hat der Server?
- **Bestehende KI-Logik**: Wo und wie werden aktuell die Tagebuch-Texte (Tab „Voll", „27 offene Tage generieren") erzeugt? Diese Logik dient dir als **strukturelle Vorlage** und wird im Zuge des Umbaus ersetzt (siehe Abschnitt 2).
- **Datenbank**: Schema/Engine (SQLite/Postgres/…). Wo liegen Medikationsplan, geplante/tatsächliche/außerplanmäßige Einnahmen, Wachzeit, Notizen und die 11 Tagesskalen? Gibt es bereits eine Tabelle für generierte Auswertungen/Tagebucheinträge?
- **Design-Tokens**: Lies das Theme/CSS aus (Farbvariablen, Schriftarten, Radius, Spacing, Schatten). Die unten genannten Hex-Werte sind **Startpunkte** – wenn das Projekt eigene Tokens hat, übernimm diese und erweitere sie, statt parallele Werte zu erfinden.
- **Tab-Komponente**: Wie sind der „Tagebuch"-Tab und die Untertabs „Kurz"/„Voll" implementiert (Routing, State, Labels)?
- **`system_prompt.md`**: Liegt im Projektverzeichnis. Wird zur Laufzeit als System-Prompt gelesen (Inhalt **nicht** verändern).

Danach in kleinen, nachvollziehbaren Commits arbeiten.

---

## 1. Phase 1 — Nächtliches „Träumen" (Server + MiniMax M3)

Jede Nacht um **04:20 Uhr Europe/Berlin** soll die App „träumen": Sie schickt `system_prompt.md` (als System-Prompt) und die relevanten Datenbankinhalte (als User-Inhalt) an **MiniMax M3** und speichert das Ergebnis als „Traum" unter dem aktuellen Datum in derselben Datenbank.

> Begrifflich: Der „Traum" **ist** die tägliche Auswertung, die `system_prompt.md` erzeugt. Der Inhalt bleibt sachlich/medizinisch (so wie der Prompt es vorgibt) – das „Träumerische" steckt ausschließlich in Branding, Präsentation und Design, **nicht** darin, den Text surreal zu machen.

### 1.1 Scheduler
- Job um **04:20 Europe/Berlin**, **DST-sicher** (nicht UTC fest verdrahten). Je nach Stack z. B. `node-cron` mit `{ timezone: 'Europe/Berlin' }`, APScheduler `CronTrigger(hour=4, minute=20, timezone='Europe/Berlin')` oder System-Cron, der einen internen Endpoint triggert.
- Zeit/Cron über env konfigurierbar machen (`DREAM_TIME=04:20`, `DREAM_TZ=Europe/Berlin` o. ä.).
- **Idempotenz**: pro Kalendertag (Berliner Zeit) genau **ein** Traum. Existiert für heute schon einer, überspringen. DB-seitig per Unique-Constraint auf das Datum absichern.
- **Lock/Guard** gegen Doppelausführung (z. B. paralleler Restart).
- **Retries mit Backoff** (z. B. 3 Versuche) bei Netz-/API-Fehlern; Erfolg/Fehler mit Zeitstempel loggen. Keine vollständigen sensiblen Payloads ins Log schreiben.
- **Manueller Trigger** (CLI-Befehl oder geschützter Dev-Endpoint), optional mit Datum und `--force`, um ohne Warten auf 04:20 zu testen. **Wichtig fürs Testen.**

### 1.2 MiniMax-M3-Integration (serverseitig!)
- OpenAI-kompatibler Endpoint: `https://api.minimax.io/v1/chat/completions`
- Auth-Header: `Authorization: Bearer ${MINIMAX_API_KEY}`
- Model-ID: `MiniMax-M3`
- Konfigurierbar via env: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL` (Default s. o.), `MINIMAX_MODEL=MiniMax-M3`. **Schlüssel niemals im Code, niemals client-seitig** – der Call läuft ausschließlich im Backend.
- Request: `system`-Message = Inhalt von `system_prompt.md` (zur Laufzeit gelesen), `user`-Message = zusammengebauter Kontext (s. 1.3). MiniMax M3 ist ein Reasoning-Modell – **Thinking aktiviert lassen** (verbessert die Analyse).
- **Bitte am aktuellen MiniMax-Doc verifizieren**: Name des Token-Limit-Parameters (`max_tokens` vs. `max_completion_tokens`) und ob ein Thinking-/Reasoning-Flag gesetzt werden muss. Antwort robust parsen (`choices[0].message.content`) und Fehlerfälle abfangen.

Referenz-Call (an euren Stack anpassen, bestehende Anthropic-Integration als Vorbild nehmen):

```bash
curl https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MiniMax-M3",
    "messages": [
      {"role": "system", "content": "<Inhalt von system_prompt.md>"},
      {"role": "user", "content": "<zusammengebauter DB-Kontext>"}
    ],
    "temperature": 0.6
  }'
```

### 1.3 Kontext-Zusammenbau
Stelle dem Modell sauber strukturierte Eingaben bereit (klar beschriftete Abschnitte oder JSON), damit es eindeutige Daten bekommt:
- Daten des **aktuellen Tages**: geplante vs. tatsächliche Einnahmen, außerplanmäßiger Konsum, Wachzeit, Notizen, alle 11 Skalenwerte.
- **Aktueller Medikationsplan**.
- **Die Träume der letzten 7 Tage** (der System-Prompt verlangt sie ausdrücklich, um Wiederholungen zu vermeiden).
- M3 hat sehr großes Kontextfenster – Vollständigkeit geht hier vor Kürzung.

### 1.4 Speicherung
- Neue/bestehende Tabelle (z. B. `dreams`): `date` (UNIQUE), `content`, `model`, `created_at`, optional Rohdaten-/Status-Felder. An vorhandenes Schema anlehnen.
- Unter dem **aktuellen Datum** speichern.

---

## 2. Phase 2 — Tab-Umbau (Info & Traum)

Im Tab **„Tagebuch"** gibt es die Untertabs **„Kurz"** (Roh-Log: Energy-Drink, Extrakt, Wachzeit …) und **„Voll"** (generierte Tagebuchtexte).

- **„Kurz" → in „Info" umbenennen.** Inhalt und Logik des Roh-Logs **unverändert** lassen, nur das Label ändern. Prüfe, dass keine Stelle mehr auf „Kurz" verweist (Routing, State-Keys, i18n, Tests) und nichts bricht.
- **„Voll" → durch „Traum" ersetzen, inkl. der bisherigen Generierungs-Logik.** Die alte Tagebuch-Generierung (inkl. „27 offene Tage generieren", „Alles neu", „Bearbeiten", der Anthropic-Diary-Pfad) wird entfernt/abgelöst durch das neue nächtliche Traum-System.
- Der **Traum-Tab** zeigt eine **Historie der Träume** (Design s. Abschnitt 4.3).

---

## 3. Phase 3 — Startup-Dialog (letzter Traum)

Bei **jedem App-Start** erscheint der **letzte Traum** in einem träumerisch gestalteten Dialog, mit **Fade-In/Fade-Out**, während die App im Hintergrund **geblurred** wird (Design s. Abschnitt 4.2).

Verhalten:
- Erscheint **einmal pro App-/Session-Start** (nicht bei jedem Tab-Wechsel). Pro Session merken, dass er gezeigt wurde.
- Zeigt den jüngsten Traum. **Gibt es noch keinen, erscheint nichts** (kein leerer Dialog).
- Schließen per Klick auf den Scrim, per „✕"/„Schließen" **oder** per Primäraktion „Im Traum-Tab öffnen" (navigiert in den Traum-Tab). Beim Schließen sauberes Fade-Out + Entblurren.

---

## 4. Design-Leitlinien (Schwerpunkt!)

### 4.1 Bestehende Sprache übernehmen, dann erweitern
Die App ist **warm-dunkel, ruhig, literarisch**: editoriale Serifen-Headlines, sehr dezente, stark abgerundete Karten, salbeigrüner Akzent, goldgelber Sekundärakzent (Warnsymbol, Wachzeit-Sonne), großzügiger Weißraum. Alles Neue muss sich wie Teil **derselben** App anfühlen.

Startpalette (im Repo gegen die echten Tokens abgleichen und an diese angleichen):
- Hintergrund: warmes Fast-Schwarz, ca. `#15140F`
- Kartenfläche: ca. `#1F1D17`, Rahmen `rgba(255,255,255,0.06)`
- Text primär: warmes Off-White, ca. `#ECE7DB`; sekundär/muted ca. `#9A958A`
- Akzent Salbei: ca. `#97A87C` — **bleibt der primäre interaktive Akzent** (Buttons, aktive States), auch in den Traum-Bereichen, für Konsistenz
- Akzent Gold: ca. `#DDA85A`
- Radius Karten ~18px, Pills voll rund; Display-Serife des Projekts beibehalten (aus dem Theme auslesen)

**Nächtlich-onirische Erweiterung** (nur für die Traum-Bereiche, als kühler Gegenpol, der sich an den Rändern in das warme Dunkel zurückblendet, damit es nicht wie eine fremde App wirkt):
- Nacht-Verlauf: tiefes Indigo `#14132A` → violett-anthrazit `#1C1838`/`#221B3A`
- Mondschein-Halo: weiches radiales Leuchten in der Mitte, ca. `rgba(180,176,224,0.18)` (Lavendel), nach außen auslaufend
- Dekorativer Nacht-Akzent: zartes Periwinkle/Lavendel `#B3AEE8` – **nur** für Chrome (Haarlinien, Sternchen, Glow), nicht für primäre Buttons (die bleiben salbeigrün)
- Sterne: wenige 1px-Punkte, niedrige Deckkraft (`rgba(237,231,219,0.25)`), zufällig platziert; optional sehr langsames Funkeln (nur ohne `prefers-reduced-motion`)
- Optional feines Korn/Noise-Overlay bei ~3–5 % Deckkraft für Tiefe
- Text auf Nacht-Hintergrund: Headlines ~90 %, Fließtext ~80 % Off-White – **WCAG-AA-Kontrast einhalten**

### 4.2 Der Startup-Dialog (das Schaustück)
Hier darf es am ausdrucksstärksten sein – ätherisch, ruhig, „erwachen aus einem Traum":
- **Hintergrund**: App wird per `backdrop-filter: blur(...)` weichgezeichnet und mit einem dunklen Schleier abgedunkelt. Fallback (kein Backdrop-Filter-Support): solides dunkles Overlay.
- **Traum-Karte**: zentriert, weich leuchtend; Nacht-Verlauf als Fläche, dezenter Mondschein-Halo, ein paar Sternchen, optionales Korn. Ein **kleines, zurückhaltendes Mond-/Sternenmotiv** (z. B. schmale Mondsichel) als Signatur.
- **Kopf**: Datum in der bestehenden Serife (z. B. „Dienstag, 16. Juni 2026"), darüber eine zarte Kaption wie „Heute Nacht geträumt".
- **Inhalt**: der Traumtext in **gut lesbarem**, großzügigem Reading-Layout (komfortable Zeilenhöhe, leicht größere Schrift, weiche Textfarbe). Ist der Text lang: in der Karte **scrollbar mit max. Höhe**, obere/untere Kante sanft ausgeblendet (`mask-image`-Verlauf). Lesbarkeit geht vor Effekt – der Analyse-Inhalt darf nie vom Design verschluckt werden.
- **Aktionen**: Primär „Im Traum-Tab öffnen" (salbeigrün), sekundär „Schließen"/„✕".

**Bewegung**:
- Scrim + Blur fahren in ~500–700 ms hoch.
- Karte: `opacity 0→1`, `scale 0.96→1`, leichtes Hochdriften (~8px), ~700–900 ms `ease-out`, leicht nach dem Scrim einsetzend.
- Sanftes „Atmen" im Ruhezustand (z. B. `scale 1 ↔ 1.012` und/oder Halo-Puls, ~7 s `ease-in-out`, endlos) – nur ohne `prefers-reduced-motion`.
- Schließen: Reverse in ~400–500 ms.
- Optional: Inhaltsabschnitte gestaffelt einblenden (40–60 ms versetzt).

### 4.3 Der Traum-Tab (Historie)
Ruhiger als der Dialog – hier wird **gelesen/durchgeblättert**, Komfort vor Spektakel, aber in derselben nächtlichen Sprache:
- **Liste/Timeline** der Träume, **neueste zuerst**; optional nach Monat gruppiert mit Serifen-Monatsüberschrift.
- Jeder Traum = Karte: Serifen-Datum als Kopf, darunter der Inhalt. Lange Inhalte eingeklappt mit „Weiterlesen"/Aufklappen; weiche Trenner.
- Dezenter nächtlicher Akzent (z. B. zarte Indigo-Kante, kleiner Halo/Sternchen nur im Listenkopf), zurückhaltender als im Dialog.
- **Leerzustand**: freundliche Notiz mit kleinem Mondmotiv, z. B. „Noch keine Träume. Die App träumt heute Nacht um 4:20 Uhr."
- **Ladezustand**: weiches Shimmer in der Nachtpalette.
- *Optional / nice-to-have* (nicht überbauen): pro Traum eine winzige Momentaufnahme der 11 Skalen als kleine Punkte/Balken.

### 4.4 Bewegung & Barrierefreiheit (überall)
- `prefers-reduced-motion` respektieren: Drift/Scale/Atmen/Funkeln deaktivieren, nur kurzes Fade (oder gar keins) lassen.
- Animationen GPU-freundlich (`transform`/`opacity`), 60fps, kein Layout-Thrash.
- Dialog: `aria-modal`, Fokus-Falle, **Escape schließt**, Fokus beim Schließen zurückgeben.
- Kontraste AA prüfen (Fließtext **und** Serifen-Headlines auf dunklem Grund).

---

## 5. Nicht-funktionale Anforderungen
- Secrets nur aus env, nichts ins Repo, MiniMax-Call ausschließlich serverseitig.
- Idempotenz + Lock + Retries/Backoff + sinnvolles (datensparsames) Logging.
- UI-Strings auf **Deutsch**; Datums-/Zeitformat **de-DE**, Zeitzone Europe/Berlin.
- Wo sinnvoll Tests: Idempotenz, Zeitzonen-/DST-Berechnung, Cron-Registrierung, „Dialog einmal pro Session", `prefers-reduced-motion`.
- Bestehende Patterns wiederverwenden, keine unnötigen neuen Abhängigkeiten.

---

## 6. Vorgehen & Lieferung
1. **Erkundung** (Abschnitt 0) durchführen und Ergebnis kurz zusammenfassen, bevor du Code änderst.
2. In kleinen, getrennten Commits umsetzen: (a) MiniMax-Client + Scheduler + Speicherung + manueller Trigger, (b) Tab-Umbau Info/Traum, (c) Traum-Tab-UI, (d) Startup-Dialog.
3. Am Ende liefern: kurze **Zusammenfassung der Änderungen**, die nötigen **env-Variablen**, **wie man den manuellen Trigger** ausführt, und **was noch zu verifizieren ist** (MiniMax-Token-Parameter/Thinking-Flag).

## 7. Zu bestätigen / Annahmen (kurz rückfragen, wenn unklar)
- Exakter MiniMax-Token-Limit-Parameter und Thinking-Flag → am aktuellen Doc prüfen.
- DB-Schema/Engine → bei der Erkundung klären.
- Startup-Dialog zeigt den **vollständigen** Traum (scrollbar, mit „Im Traum-Tab öffnen") – falls du stattdessen Kurzüberblick + Link bevorzugst, kurz melden.
