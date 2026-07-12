# DEFAULTS.md

Standard-Notizen und -Mengen pro Substanz. Werden beim Anlegen einer Einnahme
automatisch übernommen, wenn **Menge** bzw. **Notiz** nicht selbst angegeben
wurden. Eine konkrete Eingabe hat immer Vorrang. Die API liest diese Datei bei
jedem Schreibvorgang frisch ein. Bei manchen Einträgen ist das Datum relevant,
welche Defaults geschrieben werden müssen.

Format je Substanz (Felder optional):

    ## Substanzname
    Menge: <Standard-Menge>
    Notiz: <Standard-Notiz>
    Mit: <Begleitsubstanz> | <Menge> | <Notiz>

`Mit:` trägt die genannte Begleitsubstanz bei jeder Einnahme automatisch als
eigenen Eintrag mit ein (gleicher Zeitpunkt). Menge und Notiz sind optional —
ohne Angabe gelten die Defaults der Begleitsubstanz selbst. Mehrere
`Mit:`-Zeilen sind möglich; `Mit:`-Angaben der Begleitsubstanz werden nicht
weiterverfolgt (keine Ketten).


## Energy-Drink
Notiz: 32mg/100ml Koffein

## Energy
Notiz: 32mg/100ml Koffein

## Extrakt
Notiz: Sinceritas 100/1 — 100 mg/ml THC, <1 mg/ml CBD.

## CBD
Notiz: 5 % CBD (Arbeitsrechnung ca. 50 mg/ml).

## CBN
Notiz: 5 % CBN (Arbeitsrechnung ca. 50 mg/ml).

## CBD - Blüten
NACH 2026-06-07 15:00 CEST: Notiz: Sorte: "Cali Weed" von cbddiscounter.at: <6% CBD und <0,2% THC; bezogen auf das Pflanzenmaterial, nicht auf die tatsächlich inhalierte/resorbierte Menge.
DAVOR: Notiz: Sorte: WEECO NG 1/16 "Nightingale": 16 % CBD und 1 % THC; bezogen auf das Pflanzenmaterial, nicht auf die tatsächlich inhalierte/resorbierte Menge.

## Pilze
Notiz: Sorte "Shakti"

## Theanin
Menge: 400 mg
Mit: Lemon Balm | 100 mg | 20 mg Lemon Balm 5:1-Extrakt (= 100 mg Lemon Balm)
