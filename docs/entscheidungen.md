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
- **Standardzeit** je Bahn und Distanz ist die Zeit eines Referenz-Spezialisten der Qualität 65 für genau diese Distanz (9st 0lb, guter Boden bzw. Standard auf Allwetter, allein, ohne Zufall); diese Zeit entspricht der Figure 80. Dadurch sind die Figures über alle Distanzen vergleichbar (Abweichung ≤ ±5 lb für Qualität 50–85).
- **Bodenbereinigung** über den festen Bodenfaktor des Modells (statt einer empirischen Going Allowance je Renntag).
- **Faustregel**: 1 Attributpunkt ≈ 2 lb. Qualität 50 ≈ Figure 50, 65 ≈ 80, 75 ≈ 100, 85 ≈ 120.
- **Pflichttest-Kalibrierung** (Newbury, guter Boden, randomness 0,4, je 1.000 Rennen mit 8–14 Startern der Qualität 54–72, Streuung im Feld σ = 4,5): Siegerzeit-Median 1:11,9 (1.200 m) bzw. 2:32,3 (2.400 m). Der Favorit ist das Pferd mit dem besten Speed-Figure-Schnitt aus drei Vorstarts; er gewinnt etwa 29–37 %.

## Pferde

- **Attribute** 1–100 (intern Dezimalwerte). Potenzial = Qualität + Distanzspezialisierung (je Verdopplung der Wunschdistanz über 1.600 m: Grundschnelligkeit −10, Beschleunigung −7, Ausdauer +13) + Rauschen. Mentale Attribute (Kampfgeist, Wendigkeit, Temperament, Konstanz) sind unabhängig von der Qualität.
- **Reifekurve**: frühreif (Höhepunkt mit ca. 2,9 Jahren), normal (3,9), spät (4,8). Mit 2 Jahren liegen die physischen Attribute bei 84–93 % des Potenzials; ein Jahr nach dem Höhepunkt beginnt der Abbau mit ca. 3 % pro Jahr. Mentale Attribute folgen der Kurve nur zu 35 %.
- **Schätzwerte**: Der Spieler sieht nie die echten Attribute. Die Schätzung ist echter Wert + fester Fehler (z-Wert je Pferd und Attribut) × Unsicherheit. Die Unsicherheit sinkt mit der Zahl der Starts und mit der Einsicht des Trainers.
