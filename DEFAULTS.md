# DEFAULTS.md

Standard-Notizen und -Mengen pro Substanz. Werden beim Anlegen einer Einnahme
automatisch übernommen, wenn **Menge** bzw. **Notiz** nicht selbst angegeben
wurden. Eine konkrete Eingabe hat immer Vorrang. Die API liest diese Datei bei
jedem Schreibvorgang frisch ein.

Format je Substanz (Felder optional):

    ## Substanzname
    Menge: <Standard-Menge>
    Notiz: <Standard-Notiz>

Reiner Fließtext unter einer Überschrift zählt ebenfalls als Notiz.

<!-- Bewusst OHNE Mengen-Default (Menge nur bei expliziter Angabe dokumentieren):
     Ketamin-Nasen / "eine Nase". -->
<!-- Die Tagesgrenze des Konsum-/Medikations-Tags (03:30 Europe/Berlin) ist in
     den Code übernommen (server/src/lib/time.ts → DAY_BOUNDARY). -->

## Energy-Drinks
Notiz: 32 mg Koffein pro 100 ml, solange keine produktspezifischen Werte genannt werden.

## Extrakt
Notiz: Sinceritas 25/1 — 25 mg/ml THC, <1 mg/ml CBD (Stand seit 2026-06-05 19:00 CEST). Davor: Beacon Balanced Extrakt „Pink Kush", 10 mg/ml THC + 10 mg/ml CBD.

## CBD-Öl
Notiz: ohne Konzentrationsangabe 5 % CBD (Arbeitsrechnung ca. 50 mg/ml).

## CBN-Öl
Notiz: ohne Konzentrationsangabe 5 % CBN (Arbeitsrechnung ca. 50 mg/ml).

## CBD-Blüten
Notiz: ohne andere Sorte/Analyse 16 % CBD und 1 % THC; bezogen auf das Pflanzenmaterial, nicht auf die tatsächlich inhalierte/resorbierte Menge.

## CBD-Joints
Menge: 0,4–0,5 g
Notiz: „dünner, aber voller Joint", wenn keine Menge genannt wird.

## Theanin-Kapsel
Menge: 400 mg Theanin + 20 mg Lemon-Balm-5:1-Extrakt (= 100 mg Lemon Balm)
