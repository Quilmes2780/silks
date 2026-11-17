# Entscheidungen und Annahmen

Dieses Dokument hält alle Annahmen fest, die beim Bau getroffen wurden. Bei Widersprüchen gilt `docs/konzept.md`.

## Freigegebene Punkte aus dem Plan (17.11.2026)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Startstall des Spielers | Im Startdialog einstellbar (2–10 Pferde), Standard 6 (Ziel von Phase 2). |
| 2 | Startpopulation der KI-Ställe | Generierte, fiktive Ställe und Pferde, bis echte Daten in `data/world` eingetragen sind. Einträge aus der Weltdatei haben Vorrang. |
| 3 | Posen der Pferdeporträts | Laut Asset-Tabelle: 2 Posen (Profil, Galopp) × 5 Fellfarben × 2 Altersstufen = 20 Bilder. Das Manifest kann eine dritte Pose (Dreiviertel) aufnehmen. |
| 4 | Speed Figures / Sectionals | In dieser Runde immer sichtbar. Die Freischaltung über den Datenanalysten folgt mit Phase 3. |
| 5 | Training | Wochenplan (Mo–Sa, je ein Baustein) als Tab im Pferdeprofil, dazu Schnellvorlagen in der Stall-Liste. Ein eigener Trainings-Screen (Raster Pferd × Tag) folgt später. |
| 6 | Jockeys und Geld | Freier Jockey-Pool mit fester Reitgebühr. Kontostand nur mit Preisgeld, Nenngebühren, Reitgebühren und einer pauschalen Trainingsgebühr pro Pferd und Woche. |
| 7 | Kalender | Echte Group-/Listed- und Heritage-Rennen in ihren üblichen Wochen, dazu generische Handicaps, Maidens und Novice-Rennen auf realen Bahnen. |

## Rennsimulation

- **Leistungsmodell „Critical Speed“**: Jedes Pferd hat eine kritische Geschwindigkeit CS (aus Ausdauer), einen anaeroben Vorrat W in Metern (aus Grundschnelligkeit), eine Speedreserve K (aus Speedreserve) und eine Spitzengeschwindigkeit vTop (aus Grundschnelligkeit). Oberhalb von CS sinkt der Vorrat um (v − CS)·dt. Das optimale gleichmäßige Tempo bei Restdistanz R ist CS / (1 − W/R). Dieses Modell beschreibt reale Laufzeiten über 5f–2m gut: Kurze Rennen werden über vTop entschieden (5f und 6f haben in der Realität fast gleiche Durchschnittstempi), lange über CS.
- **Taktik**: Bis zum Angriffspunkt (früh 600 m, normal 400 m, spät 250 m vor dem Ziel; über 2.000 m × 1,25) verteilt der Jockey nur so viel Energie, dass das Finale im Spitzentempo möglich bleibt. Danach wird K freigegeben. Reicht der Vorrat schon vorher für Spitzentempo bis ins Ziel, greift er früher an; das erkennen gute Jockeys besser. Die Laufposition (führen / vorne / Mitte / hinten) verändert das Tempo um −1,5 % bis +3 %, bis die Wunschposition erreicht ist. Zwei Führungspferde im Duell verbrauchen sich so gegenseitig.
- **Verkehr**: Ein Pferd, das direkt hinter einem langsameren Pferd in derselben Spur läuft, wird ausgebremst. Mit einer Wahrscheinlichkeit, die von Wendigkeit und Jockey-Taktik abhängt, sucht es eine freie Spur außen oder innen. Außenspuren kosten in den Bögen Meter (Fortschritt = Weg / (1 + Spur·Krümmung)). Im Windschatten sinkt der Verbrauch um 4 %.
- **Zufall** (alles skaliert mit `randomness`): Tagesform (σ = randomness · 2,9 % · (1,3 − Konstanz)), Fehleinschätzung des Tempos durch den Jockey, schlechter Start und Zerren (abhängig vom Temperament), Behinderung, Aufgeben.
- **Bahngeometrie**: Jede Rundbahn ist ein Oval aus zwei gleich langen Geraden und zwei 180°-Bögen. Sprints bis zur Länge der geraden Bahn laufen geradeaus. Reale Sonderformen (Epsom, Chester, Newmarket) werden über Bogencharakter, Gefälle, Zielgerade und ansteigenden Einlauf angenähert. Die Bahnmaße in `tracks.json` sind gerundete Näherungswerte.
- **Länge**: 1 Länge = 2,4 m. Abstände werden aus Zeitdifferenz × Endgeschwindigkeit berechnet.
- **Sectionals**: Messpunkte alle 200 m, rückwärts vom Ziel gezählt. Der erste Abschnitt ist dadurch bei krummen Distanzen kürzer (z. B. 1.207 m → 7 m, dann 6 × 200 m). Die Position ist die Reihenfolge, in der die Pferde den Messpunkt passieren.
- **Geschwindigkeitskurve**: ein Wert je 50 m.
- **Replays** werden nicht gespeichert, sondern bei Bedarf aus Seed und Eingaben neu simuliert.

## Speed Figure und Kalibrierung

- **Skala**: Pfund, vergleichbar mit dem Official Rating. 1 lb = 0,06 % der Standardzeit; dieselbe Konstante bestimmt die Wirkung von Gewicht in der Simulation.
- **Standardzeit** je Bahn und Distanz: mittlere Zeit eines Referenzfelds aus zehn Par-Spezialisten der Qualität 65 für genau diese Distanz (9st 0lb, guter Boden bzw. Standard auf Allwetter, gemischte Laufstile, ohne Zufall). Diese Zeit entspricht der Figure 80. Weil die Standardzeit aus einem Feld stammt, sind die Bogen- und Verkehrsverluste der jeweiligen Bahn enthalten, wie bei empirisch ermittelten Standardzeiten. Die Figures sind über alle Distanzen vergleichbar (Spanne ≤ 12 lb für Felder gleicher Qualität, getestet).
- **Bodenbereinigung (Going Allowance)**: Bodenfaktor des Modells, gemittelt über die Bodenvorlieben der Population (Vorliebe ~ N(0; 0,45)). Ein Pferd mit ausgeprägter Vorliebe erhält auf „seinem“ Boden also eine bessere Figure. Das ist gewollt, denn die Figure misst die tatsächliche Leistung.
- **Faustregel**: 1 Attributpunkt ≈ 2 lb. Qualität 50 ≈ Figure 50, 65 ≈ 80, 75 ≈ 100, 85 ≈ 120.
- **Pflichttest-Kalibrierung** (Newbury, guter Boden, randomness 0,4, je 1.000 Rennen mit 8–14 Startern der Qualität 54–72, Streuung im Feld σ = 4,5). Der Favorit ist das Pferd mit dem besten Speed-Figure-Schnitt aus drei Vorstarts.

  | Distanz | Ø Feld | Sieger P5 | Median | P95 | im Band | Favorit Sieg | Favorit Platz |
  |---|---|---|---|---|---|---|---|
  | 1.200 m | 11,1 | 1:10,64 | 1:11,87 | 1:13,12 | 88,4 % (1:11–1:14) | 34,4 % | 68,4 % |
  | 2.400 m | 11,1 | 2:29,78 | 2:32,18 | 2:34,48 | 99,5 % (2:28–2:36) | 26,9 % | 59,8 % |

- **Finishing Speed %** liegt im Mittel bei etwa 104 % (Sprints) bis 109 % (Steher). Ursache: Der Durchschnitt enthält den stehenden Start, und die Jockeys halten die Speedreserve fürs Finale zurück. Das ist ein bekanntes Muster britischer Rennen und bleibt vorerst so.

## Official Rating

- Wird erst nach drei Starts vergeben: 60 % beste + 40 % mittlere Speed Figure. Danach Anpassung nach jedem Start: Verbesserungen schnell (Sieger 65 %, sonst 45 % der Differenz, höchstens +14), Verschlechterungen langsam (höchstens −5). Aufgegebene Rennen zählen nicht.
- Ältere Pferde haben bei Spielbeginn eine generierte Vorgeschichte (Starts, Siege) und ein Start-Rating aus ihrem Leistungsniveau. Rohdaten dieser Starts gibt es nicht.

## Rennkalender und Regeln

- **Wochen**: Woche n endet mit dem n-ten Samstag des Jahres. Rennen laufen nur samstags oder sonntags. Wochen der Feature-Rennen sind Näherungswerte (z. B. Derby und Oaks am selben Samstag).
- **Meetings**: In der Rasensaison (Woche 13–45) samstags 2 Rasen-Meetings und 1 Allwetter-Meeting, sonntags 1 Rasen-Meeting; im Winter 2 Allwetter-Meetings samstags und 1 sonntags. Je Meeting 6 Rennen; Feature-Tage haben entsprechend mehr. Bahnen rotieren nach Listen in `races.json`.
- **Generische Rennen** (Novice, Maiden, Nursery, Handicap Class 2–6, Conditions, Listed) mit Gewichtung und Zeitraum aus `races.json`. Namen ohne Sponsoren, z. B. „Newbury Handicap (Class 4)“.
- **Nennschluss**: Group 1 drei Wochen vor der Rennwoche, Group 2/3, Listed und Heritage zwei Wochen, sonst eine Woche. Die Startlisten (Boden, Boxen, Gewichte, Jockeys) werden zu Beginn der Rennwoche erstellt; danach legt der Spieler Taktik und Jockey fest.
- **Nenngeld**: 0,7 % des Preisgelds (mindestens £20). **Preisgeldverteilung**: 57/22/11/5,5/2,8/1,7 % auf Platz 1–6.
- **Überzeichnete Felder**: Es starten die Pferde mit dem höchsten Rating bzw. den besten Leistungen; ausgeschiedene Spielerpferde erhalten eine Nachricht.
- **Gewichte**: Handicaps mit 9st 10lb Höchstgewicht und 1 lb je OR-Punkt, Minimum 8st 0lb. Sonst Grundgewicht (2yo/3yo-Rennen 9st 2lb, Maiden/Novice 9st 5lb, offene Rennen 9st 7lb) minus Weight-for-Age (vereinfachte Formel nach Distanz und Woche) und 3 lb Stutenerlaubnis in gemischten Rennen.
- **Boden** je Meeting zufällig, abhängig von der Jahreszeit (Frühjahr/Herbst weicher, Hochsommer fester); Allwetter meist „Standard“.
- **Quoten** sind eine spielinterne Marktmeinung aus öffentlich sichtbaren Daten (Rating, letzte Figures), keine Wetten.

## KI-Ställe

- 20 Ställe (einstellbar 10–40), je 45 Pferde (2–6 Jahre). Stallqualität ~ N(64; 4), Pferdequalität im Stall ~ N(Stall; 9). Strategien: ausgewogen, Sprinter, Steher.
- Die KI kennt ihre Pferde wie ein Trainer (geschätztes Leistungsniveau). Sie nennt zum Nennschluss: Pause von 2–6 Wochen, Distanz passend zum Optimum, Rennniveau passend (Group-Rennen nur mit realistischer Chance), Preisgeld, und sie verteilt sich auf schwach besetzte Felder.
- Trainingspläne der KI je nach Frische, Fitness und Distanztyp.
- Bei Spielbeginn werden die bereits verstrichenen Nennschlüsse der ersten Rennwochen einmalig nachgeholt.
- **Saisonsimulation** (Seed 20261117, 52 Wochen): rund 1.090 Rennen, Ø-Feldgröße 9,2 (Group 1: 12,4), ca. 11 Starts je Pferd, 2–3 s Gesamtlaufzeit, Ø 57 ms je Woche (max. 0,3 s).

## Jahreswechsel und Population

- Alle Pferde altern zum 1. Januar (Alter = Saison − Geburtsjahr).
- Ruhestand der KI-Pferde: mit 8 Jahren immer, ab 6 zu 50 %, schwache Fünfjährige und Stuten ab 4 teilweise, Pferde mit Sehnenschaden ab 5. Spielerpferde gehen erst mit 8 in den Ruhestand.
- Bis zur Zucht (Phase 4) werden neue Zweijährige generiert: KI-Ställe werden auf 45 Pferde aufgefüllt, der Spieler erhält jedes Jahr zwei Zweijährige.

## Verletzungen und Training

- Verletzungsrisiko je Bein pro Woche: Grundrisiko 0,06–0,09 % + Belastung × 0,015 + Müdigkeit (Frische < 45) + Alter (> 5). Dazu 0,2 % Husten pro Woche. Ergibt etwa 4 % gleichzeitig verletzte Pferde.
- Ausfallzeiten: Husten 2–3, Muskelzerrung 2–4, Hufprobleme 2–5, Schienbeine 3–6, Sehnenschaden 20–40 Wochen.
- Training: Lernrate 3,5 % der Lücke zur Obergrenze je Trainingseinheit, skaliert mit Trainerqualität. Ohne Reiz bauen physische Attribute leicht ab. Rennen geben Fitness und Rennerfahrung (Kampfgeist, Wendigkeit, Temperament), kosten aber Frische.

## Technik

- **Determinismus**: Alle Teilsysteme nutzen abgeleitete RNG-Streams (Seed + Label). Wo die Reihenfolge den Zufall beeinflusst, sortiert die Engine nach ID, denn nach dem Laden aus IndexedDB unterscheidet sich die Einfügereihenfolge. Ein Test prüft, dass ein geladener Spielstand identisch weiterläuft.
- **Persistenz**: Kern-Zustand als ein Datensatz, Pferde, Starts, Rennen und Ausschreibungen in eigenen Tabellen (inkrementell gespeichert). Export als JSON (`format: silks-and-stamina-save`, Version 1).
- **Git-Autor** im Repo: `Quilmes2780 <Quilmes2780@users.noreply.github.com>`, damit keine private E-Mail-Adresse öffentlich im Repo landet.
- **Schriften**: Systemschriften (keine externen Fonts), damit das Spiel offline und ohne Drittanbieter läuft.

## Pferde

- **Attribute** 1–100 (intern Dezimalwerte). Potenzial = Qualität + Distanzspezialisierung (je Verdopplung der Wunschdistanz über 1.600 m: Grundschnelligkeit −10, Beschleunigung −7, Ausdauer +13) + Rauschen. Mentale Attribute (Kampfgeist, Wendigkeit, Temperament, Konstanz) sind unabhängig von der Qualität.
- **Reifekurve**: frühreif (Höhepunkt mit ca. 2,9 Jahren), normal (3,9), spät (4,8). Mit 2 Jahren liegen die physischen Attribute bei 84–93 % des Potenzials; ein Jahr nach dem Höhepunkt beginnt der Abbau mit ca. 3 % pro Jahr. Mentale Attribute folgen der Kurve nur zu 35 %.
- **Präferenzen**: Distanzoptimum log-normal um 1.600 m (1.000–3.400 m), Abschlag 1,8 % bei doppelter bzw. halber Wunschdistanz (skaliert mit der Toleranz); Bodenvorliebe −1 … +1 (bis 1,6 % Abschlag); Bahnrichtung wirkt nur in Bögen (bis 0,6 %); Laufstil ergibt sich aus Beschleunigung, Grundschnelligkeit, Ausdauer und Speedreserve.
- **Spielerpferde** zu Beginn: Qualität ~ N(57; 3), also „mittelmäßig“ (Official Rating etwa 60–75).
- **Schätzwerte**: Der Spieler sieht nie die echten Attribute. Die Schätzung ist echter Wert + fester Fehler (z-Wert je Pferd und Attribut) × Unsicherheit. Die Unsicherheit sinkt mit der Zahl der Starts und mit der Einsicht des Trainers.
