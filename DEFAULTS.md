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

