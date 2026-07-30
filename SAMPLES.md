#Examples of a line
 (DD.MM(.YYYY)) XX:XX: BB ZZ (AAA), YY ZZ (AAA), YY ZZ (AAA), ...  und YY ZZ (AAA)    <- All listed entries at this time (and date, if given) are created.

 (DD.MM(.YYYY)) XX:XX: BB ZZ (AAA) und YY ZZ (AAA)    <- Both entries at the given time (and date, if given) are created.

 (DD.MM(.YYYY)) XX:XX: BB ZZ (AAA)    <- One entry at a specific time (and possibly date).

 (jetzt:) YY ZZ (AAA) <- if no time or "jetzt:" is given the current time is taken. If no year is given = current, if no date = current.

#Legend
 ()=optional; XX=time DD=day; MM=month; YYYY=year in 4 digits; BB=substance; ZZ=amount; AAA=note

> **Note:** the sample line syntax above uses German keywords (`jetzt:`, `und`)
> because the parser input mirrors the stored data. The example forms, slot
> words, and time-of-day markers are consumed verbatim by the server parsers
> (`lib/text_entries.ts`, `lib/import_md.ts`) and must not change.

#Order amount / substance
 Amount and substance may appear in EITHER order:
   Pregabalin 100 mg   (substance first — classic)
   100mg Pregabalin     (amount first — e.g. "200 mg Lorazepam")
 An already KNOWN substance name separates amount from note; the amount before
 or after, a free note after — also without brackets:
   150mg Pregabalin morgens   ->  substance "Pregabalin", amount "150 mg", note "morgens"
   Pregabalin nüchtern        ->  substance "Pregabalin", amount from DEFAULTS, note "nüchtern"
 If the name is still unknown, a leading amount WITH unit counts as amount
 ("100mg Pregabalin"); a number that belongs to the name stays put
 ("5 HTP 100mg" -> substance "5 HTP", amount "100 mg").

#Date & time (various forms allowed)
 Date:  12.06.  /  12.6.  /  12.06.2025   (no year = current)
         relative: heute / gestern / vorgestern / morgen / übermorgen
 Time:   08:30  /  8:30 Uhr  /  20 Uhr (= 20:00)  /  8.30 Uhr  /  um 20 Uhr
 Combined: "gestern 8:30 Uhr:"  ,  "12.06. 20 Uhr:"  ,  "jetzt:"
 Date only (no time) = that date at the current time of day.
 An emphatic time-of-day word after the time belongs to the prefix, not to the
 note:  "21 Uhr nachts: Quetiapin 100 mg"  ->  21:00, note empty.

#Amount & note (examples)
 Fractions/units:  ½ mg  /  ½mg  /  0,5 ml  /  1/2 Tablette  /  2 Tropfen  /  1-2 Tabletten
 Descriptors between name and dose become note, the dose stays amount:
   Lithium retard 450 mg   ->  amount "450 mg", note "retard"
 Bracket note and free note are both preserved:
   Lorazepam 1mg bei Panik (sublingual)  ->  note "bei Panik sublingual"

#IMPORTANT
 There can be multiple lines; each line is processed individually and one after another!
