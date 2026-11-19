# Entscheidungen und Annahmen

Dieses Dokument hält alle Annahmen fest, die beim Bau getroffen wurden. Bei Widersprüchen gilt `docs/konzept.md`.

## Freigegebene Punkte aus dem Plan (17.11.2026)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Startstall des Spielers | Im Startdialog einstellbar (2–10 Pferde), Standard 6 (Ziel von Phase 2). |
| 2 | Startpopulation der KI-Ställe | Generierte, fiktive Ställe und Pferde, bis echte Daten in `data/world` eingetragen sind. Einträge aus der Weltdatei haben Vorrang. |
| 3 | Posen der Pferdeporträts | Laut Asset-Tabelle: 2 Posen (Profil, Galopp) × 5 Fellfarben × 2 Altersstufen = 20 Bilder. Das Manifest kann eine dritte Pose (Dreiviertel) aufnehmen. |
| 4 | Speed Figures / Sectionals | In dieser Runde immer sichtbar. Die Freischaltung über den Datenanalysten folgt mit Phase 3. |
| 5 | Training | Wochenplan (Mo–Sa, je ein Baustein) als Tab im Pferdeprofil, dazu Schnellvorlagen in der Stall-Liste. Seit 19.11.2026 zusätzlich der Bildschirm „Training“ (Raster Pferd × Tag, siehe Phase 5). |
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
- **Persistenz**: Kern-Zustand als ein Datensatz, Pferde, Starts, Rennen und Ausschreibungen in eigenen Tabellen (inkrementell gespeichert). Export als JSON (`format: silks-and-stamina-save`, seit Phase 3 Version 2; Version-1-Stände und -Exporte werden beim Laden automatisch migriert). Geänderte Pferde und Rennen außerhalb der Wochenschleife (Kauf, Verkauf, Claims) markiert die Engine, damit der Worker sie speichert.
- **Git-Autor** im Repo: `Quilmes2780 <Quilmes2780@users.noreply.github.com>`, damit keine private E-Mail-Adresse öffentlich im Repo landet.
- **Schriften**: Systemschriften (keine externen Fonts), damit das Spiel offline und ohne Drittanbieter läuft.

## Pferde

- **Attribute** 1–100 (intern Dezimalwerte). Potenzial = Qualität + Distanzspezialisierung (je Verdopplung der Wunschdistanz über 1.600 m: Grundschnelligkeit −10, Beschleunigung −7, Ausdauer +13) + Rauschen. Mentale Attribute (Kampfgeist, Wendigkeit, Temperament, Konstanz) sind unabhängig von der Qualität.
- **Reifekurve**: frühreif (Höhepunkt mit ca. 2,9 Jahren), normal (3,9), spät (4,8). Mit 2 Jahren liegen die physischen Attribute bei 84–93 % des Potenzials; ein Jahr nach dem Höhepunkt beginnt der Abbau mit ca. 3 % pro Jahr. Mentale Attribute folgen der Kurve nur zu 35 %.
- **Präferenzen**: Distanzoptimum log-normal um 1.600 m (1.000–3.400 m), Abschlag 1,8 % bei doppelter bzw. halber Wunschdistanz (skaliert mit der Toleranz); Bodenvorliebe −1 … +1 (bis 1,6 % Abschlag); Bahnrichtung wirkt nur in Bögen (bis 0,6 %); Laufstil ergibt sich aus Beschleunigung, Grundschnelligkeit, Ausdauer und Speedreserve.
- **Spielerpferde** zu Beginn: Qualität ~ N(57; 3), also „mittelmäßig“ (Official Rating etwa 60–75).
- **Schätzwerte**: Der Spieler sieht nie die echten Attribute. Die Schätzung ist echter Wert + fester Fehler (z-Wert je Pferd und Attribut) × Unsicherheit. Die Unsicherheit sinkt mit der Zahl der Starts und mit der Einsicht des Trainers.

## Phase 3: Wirtschaft und Personal (freigegeben am 17.11.2026)

Die sechs offenen Fragen wurden mit den Vorschlägen freigegeben:

1. **Datenanalyst**: Ergebnis, Zeit, Abstände und Official Rating sind immer sichtbar. Speed Figures, Finishing Speed und Sectional Times liefert der Analyst. Ohne Analyst sind sie verborgen, bei schwachem Analysten auf 5 lb, bei mittlerem auf 2 lb gerundet; ab gutem Können (≥ 0,72) sind sie exakt. Zum Start ist ein junger Analyst angestellt (5-lb-Rundung).
2. **Auktionen** sind rundenbasiert-interaktiv statt mit echter Uhr: Gebot (Mindestschritt oder freier Betrag), die KI antwortet sofort mit einem Schritt; Aussteigen; Auto-Gebot bis Limit. Offene Lose werden zum Wochenende mit den Auto-Geboten entschieden (englische Auktion: höchstes Limit gewinnt zum zweithöchsten plus Schritt).
3. **Abstammung** bis Phase 4: generiertes Deckhengst-Register (40 Hengste) mit Name, Alter, Decktaxe, verborgener Vererbungsqualität, Distanz- und Bodentendenz. Neue Pferde: Qualität = ½ Hengst + ½ Stute + Streuung (sd 5). Die Hengst-Statistik (Starter, Sieger, bestes OR) entsteht aus den Nachkommen. Hengstnamen ohne weibliche Titel; alle Namen (Pferde, Mutterstuten, Hengste) bleiben eindeutig.
4. **Pleite**: Dispokredit bis −£100.000, 9 % Jahreszins auf negative Salden. Unter dem Limit Mahnungen in Woche 1, 4 und 7, in Woche 8 verkauft die Bank das wertvollste Pferd zu 75 % des Marktwerts an den reichsten KI-Stall; danach weitere Zwangsverkäufe alle 4 Wochen, solange das Limit überschritten bleibt. Kein Game Over.
5. **Anlage**: jetzt nur Boxen (Start 12, je Ausbau +4 für £40.000, max. 80) und drei Ausbauten: Schwimmbecken (£120.000; Schwimmen statt Weide, −5 % Verletzungsrisiko), Bergstrecke (£150.000; ohne sie wirkt Bergtraining zu 60 %), Tierklinik (£200.000; −20 % Ausfallzeit, −5 % Risiko). Ausbauten sind sofort nutzbar und kosten Unterhalt.
6. **Teilhaberschaften und Einstellgebühren** fremder Besitzer folgen in Phase 4.

### Personal

- **Personal** ersetzt Trainer und Jockeys als gemeinsamer Typ (Rolle, Alter, Können, Entwicklungsgrenze, Erfahrung, Moral, Vertrag). IDs bleiben erhalten, damit Starts und Statistiken gültig bleiben.
- **Einstufung**: Der Spieler sieht das Können als halbe Sterne (0,5–5), nicht die Rohwerte.
- **Gehaltsforderung** je Woche = Grundgehalt der Rolle × (0,45 + 1,6 × Können²) × (1 + Erfahrung/250). Grundgehälter: Cheftrainer 600, Assistenztrainer 340, Stalljockey 380, Arbeitsreiter 220, Pfleger 200, Tierarzt 460, Hufschmied 260, Agent 340, Analyst 280 £.
- **Zusage** deterministisch: Neue Leute sagen ab Forderung × min(1; 1,02 − Ruf/350) zu – die volle Forderung reicht immer, guter Ruf bringt Rabatt. Eigene Leute verlängern ab Forderung × (1,15 − Moral/200). Unter 80 % der Schwelle bricht die Person die Gespräche für 4 Wochen ab. Jeder Prozentpunkt Erfolgsbeteiligung über 10 % senkt die Schwelle um 3 %.
- **Verträge** laufen bis Saisonende; ab der Vertragsrunde (Woche 44) zählt die neue Saison als erstes Vertragsjahr. Auslaufende Verträge enden zum Jahreswechsel. Abfindung bei Entlassung: halbes Restgehalt, höchstens 26 Wochen.
- **Moral** nähert sich wöchentlich (15 %) einem Ziel aus Gehalt im Verhältnis zur Forderung, Siegen der letzten 8 Wochen, Ruf und Arbeitslast (überlastete Pfleger, Reiter, Trainer). Unter 30: 5 % Kündigungsrisiko je Woche. Gute Leute (Können > 0,58) mit Moral unter 55 werden abgeworben. Abgang jeweils mit zwei Wochen Frist; eine Gehaltserhöhung um 15 % oder die volle Forderung hält sie.
- **Entwicklung**: Können wächst Richtung Entwicklungsgrenze (schneller mit Erfahrung, bei Anstellung doppelt so schnell), bis 32 (Jockeys) bzw. 45 Jahre. Ruhestand ab 44 (Jockeys) bzw. 64 Jahren.
- **Wirkung** (normiert: Personal mittlerer Qualität 0,5 = Kalibrierung aus Phase 2):
  - Cheftrainer: Trainingseffizienz und Einsicht wie bisher; Spezialisten +8 % für Sprinter bzw. Steher.
  - Assistenztrainer: Der Cheftrainer schafft 20 Pferde, jeder Assistent +20; darüber sinkt die Effizienz (Wurzel des Verhältnisses, mindestens 60 %).
  - Arbeitsreiter: Faktor 0,85 + 0,3 × Können, 8 Pferde je Reiter; ohne Reiter 70 %.
  - Pfleger: 4 Pferde je Pfleger, Erholung +6 × (Können × Bindung − 0,3) Frische je Woche, Temperament wächst leicht. Ohne Pfleger −3 Frische je Woche und leichter Temperamentsverlust. Bindung wächst um 2 je Woche; ein Wechsel setzt sie zurück. Bei Gruppensiegen wird der Pfleger in der Siegerehrung erwähnt.
  - Tierarzt: Risiko × (1 − 0,2 × (Können − 0,5) − 0,02), Ausfallzeit × (1 − 0,3 × (Können − 0,5)); ohne Tierarzt +8 % Risiko, +10 % Ausfallzeit, höhere Behandlungskosten und nur grobe Risikoangaben.
  - Hufschmied: Risiko × (1 − 0,2 × (Können − 0,5) − 0,02); ohne +8 %.
  - Bloodstock-Agent: Gutachten zu Auktionslosen mit Streuung 1,5 + 6 × (1 − Können) Attributpunkte.
  - Datenanalyst: siehe Frage 1.
  - KI-Ställe modellieren nur Cheftrainer und Stalljockeys einzeln, den Rest über eine Personalqualität (0,25–0,85).
- **Jockeys**: Freie Jockeys reiten gegen £160 Reitgebühr und 8 % des Preisgelds. Stalljockeys (Vertrag) reiten die eigenen Pferde zuerst, ohne Reitgebühr, mit vertraglicher Beteiligung (Standard 10 %). Die 8 stärksten KI-Ställe binden zum Start die besten Jockeys. Nachwuchsjockeys (bis 26 Jahre) erhalten 7/5/3 lb Erlaubnis bei unter 20/50/95 Siegen – nicht in Group- und Listed-Rennen. Das getragene Gewicht ist mindestens das Reitgewicht des Jockeys (108–120 lb). Sperren: je Ritt 0,4 % + 1,2 % × (1 − Taktik) (+0,3 % bei frühem Angriff), 1–3 Wochen.
- **Trainer-Beteiligung**: Der Cheftrainer erhält seine vertragliche Erfolgsbeteiligung (Standard 10 %) am Preisgeld, auch bei der KI.

### Finanzen

- **Kosten**: Unterhalt £110 je Pferd und Woche, Gehälter, Anlagenunterhalt (£12 je Box plus Ausbauten), Tierarzt je Verletzung (Husten £300 bis Sehnenschaden £4.000, mit eigenem Tierarzt und Klinik deutlich weniger), Nenn- und Reitgebühren, Erfolgsbeteiligungen, Zinsen. Die Trainingspauschale aus Phase 2 entfällt.
- **Kostenrechnung je Pferd**: direkte Kosten plus gleichmäßig verteilte Gemeinkosten (Gehälter, Anlage). Bilanz = Preisgeld + Verkauf + Marktwert − Kaufpreis (bzw. Marktwert bei Übernahme) − laufende Kosten; ROI = Bilanz ÷ eingesetztes Kapital. Konten verkaufter Pferde bleiben erhalten.
- **Ruf** (0–100) aus Preisgeld und Gruppensiegen der letzten 52 Wochen, geglättet. Er senkt Gehaltsforderungen beim Einstellen und hebt die Moral.
- **Startkapital** £250.000 (statt £150.000): Die Kalibrierung zeigt, dass ein mittelmäßiger Stall, den die KI-Logik verwaltet (Autopilot), mit den schwachen Startpferden etwa £70.000–80.000 pro Saison verliert. Mit Startkapital und Dispo bleiben rund vier bis fünf Saisons, um über Käufe, Verkäufe, Claims und besseres Personal profitabel zu werden – das ist die gewünschte Entscheidungslage („Geld erzwingt Entscheidungen“).
- **KI-Wirtschaft**: KI-Ställe zahlen Unterhalt, Gehälter (modelliertes Personal plus £150 je Pferd für den Rest), Gebühren und Käufe; sie erhalten Preisgeld und Verkaufserlöse. Fällt ein KI-Konto unter £150.000, schießen die Besitzer £250.000 nach (Mäzene, wie im echten Rennsport). Kalibrierung über 3 Saisons: 6 Nachschüsse insgesamt, KI-Kontostände P10/P50/P90 etwa £0,25 Mio./£1,5 Mio./£6 Mio.

### Markt

- **Marktwert**: 9.000 £ × e^((Niveau − 55)/11), Niveau = Official Rating (gemischt mit jüngeren Figures, wenn besser), ohne OR Mittel aus besten und letzten Figures, ohne Rennen Abstammung (aus der Decktaxe) und Exterieur. Altersfaktoren 2j 1,05, 3j 1,0, 4j 0,7, 5j 0,5, 6j 0,38, 7j+ 0,3; Wallache ab 3 × 0,75; Hengste ab Niveau 100 bis 4 Jahre Deckhengst-Aufschlag; Stuten ab 95 × 1,2; verletzt × 0,85 (Sehne × 0,45); Minimum £1.500. Ergebnis (3–4-Jährige): OR 55–69 ≈ £15.000, 70–84 ≈ £47.000, 85–99 ≈ £185.000, 100–114 ≈ £780.000.
- **Exterieur** ist ein öffentlicher, verrauschter Eindruck vom körperlichen Potenzial (Streuung 6 Punkte).
- **Transfermarkt**: Die KI verkauft ab ihrer Mindestforderung: gelistete Pferde ab 93 % des geforderten Preises, sonst Marktwert × 1,3 (Top-8 des Stalls × 1,5, Top-3 × 2). Ab 80 % der Forderung gibt es ein Gegenangebot (höchstens drei Runden), darunter eine Absage; nach zwei Absagen 8 Wochen Funkstille. KI-Ställe listen schwächere ältere Pferde und Überzählige alle 4 Wochen (Preis ≈ 115 % des Werts) und machen Angebote für Spielerpferde (2 % je Woche und Pferd, auf der Verkaufsliste deutlich mehr; Kauf zum geforderten Preis, wenn er unter ihrem Limit liegt). Angebote gelten 2 Wochen; ein Gegenangebot über dem verborgenen Limit beendet die Verhandlung.
- **Auktionen**: Breeze-up in Woche 15 (30 Zweijährige mit Breeze-Zeit über 2 Furlongs), Jährlinge in Woche 40 (80 Lose), Horses in Training in Woche 46 (Abgaben der KI-Ställe plus eingelieferte Spielerpferde). Katalog 3 Wochen vorher, Mindestpreis 45 % des Katalogwerts (Horses in Training 60 %). Bis zu 5 KI-Bieter je Los mit eigenem Gutachten; Verkäufer zahlen 5 % Provision. Unverkaufte Züchterware verschwindet vom Markt. Rangkorrelation Preis ~ verborgene Qualität: 0,86–0,96 bei Breeze-up und Jährlingen.
- **Claiming-Rennen**: neue Rennart (Class 5, 3yo+, 5f–1m2f, Preisgeld £5.000, Claiming-Preis £5.000/8.000/12.000/16.000). Die KI nennt nur Pferde, deren Marktwert höchstens 125 % des Claiming-Preises beträgt, und claimt, wenn ihr eigenes Gutachten den Wert auf mindestens 130 % schätzt. Claims in der Rennwoche nach Bekanntgabe der Starter; bei mehreren Claims entscheidet das Los. Das Preisgeld gehört noch dem alten Besitzer. Etwa 30–40 Claims pro Saison.
- **Neue Zweijährige** aus der „Zucht des Besitzers“ kommen weiter jedes Jahr (Spieler: bis zu 2, nur bei freien Boxen), jetzt mit Abstammung aus dem Hengst-Register. Echte Zucht folgt in Phase 4.

### Migration

- Version-1-Stände: Trainer → Cheftrainer mit Vertrag, Jockeys → freie Jockeys (Siege aus der Startliste + 150), die 8 KI-Ställe mit dem höchsten Ruf binden Stalljockeys, Startteam des Spielers wird eingestellt, Hengst-Register und Abstammungen ergänzt, Kontoauszug „Training“ → „Unterhalt“. Der laufende Kalender bleibt erhalten; Claiming-Rennen gibt es ab der nächsten Saison. Ein fehlender Auktionskatalog wird nachgeholt, solange die Auktion noch bevorsteht.

### Leistung

- Saisonsimulation mit Wirtschaft (Seed 20261117): Ø 97 ms je Woche, max. 0,3 s; die erste Woche nach dem Laden ist langsamer, weil die Standardzeiten der Speed Figures erst berechnet werden.

## Phase 4: Zucht und Generationen (freigegeben am 17.11.2026)

Freigegeben wurde der Plan mit acht Punkten: Genetik, Hengste als Pferde, Gestüt, Jahreszyklus der Zucht, KI-Zucht und Population, Statistik und Oberfläche, Teilhaberschaften und Einstellpferde, Prüfung über 10 Saisons.

### Genetik

- **Merkmale**: 11 erbliche Merkmale mit je 6 Gen-Paaren (additive Allele): *Klasse* (gemeinsamer Anteil von Grundschnelligkeit, Beschleunigung, Ausdauer und Speedreserve), *Distanz* (log2 des Distanzoptimums), *Boden*, je eine Abweichung der vier Leistungsattribute von der Klasse sowie Kampfgeist, Wendigkeit, Temperament und Konstanz direkt. Fohlen erben je Locus ein zufälliges Allel von Vater und Mutter. Distanzspanne, Bahnrichtung, Reifetyp und Laufstil sind nicht erblich (zufällig bzw. abgeleitet).
- **Erblichkeit h²** (Rest Umwelt): Klasse 0,45 (Streuung 7,5), Distanz 0,55, Boden 0,40, Attributabweichungen 0,35, Kampfgeist 0,30, Wendigkeit 0,25, Temperament 0,35, Konstanz 0,25.
- **Jahrgangsausgleich**: Nach jeder Decksaison wird der mittlere Zuchtwert des Deckjahrgangs bei der Ausprägung abgezogen. Damit bleibt das Weltniveau konstant (Standardzeiten, Speed Figures und Preisgelder bleiben kalibriert); Zuchterfolg ist relativ zum Jahrgang.
- **Gründertiere** (Spielstart, Importe, Migration): Der Zuchtwert wird aus dem sichtbaren Phänotyp geschätzt (bedingte Verteilung bei h²), die Allele werden darauf verteilt. Rennpferde im Ruhestand verlieren ihre Allele (sie züchten nie mehr), Abstammung und Linie bleiben.
- **Fellfarbe** nach Extension (E/e je 50 %), Agouti (A 44,5 %, A^t 31 %, a 24,5 %) und Grey (G 4,6 %): Schimmel bei G, Fuchs bei ee, sonst Brauner (A), Dunkelbrauner (A^t) oder Rappe (aa). Gründer erhalten einen zur Farbe passenden Genotyp. Weiße Abzeichen über eine erbliche Weißneigung (Mittel der Eltern plus Streuung); Füchse zeigen mehr Weiß.
- **Inzucht**: Koeffizient nach Wright über die Verwandtschaft der Eltern (bis 6 Generationen). Inzuchtdepression: Klasse −18 × F, Konstanz −50 × F, Temperament −20 × F, Beinrisiko × (1 + 3 F). Eine Halbgeschwister-Paarung (F = 12,5 %) kostet also etwa 2 Klassenpunkte. Die KI paart nicht über 7 %.
- **Hengstlinien und Nicks**: 8 väterliche Linien (fiktive Stammväter). Eine verborgene, per Seed festgelegte Tabelle gibt jeder Kombination aus Vaterlinie und Muttervaterlinie einen Klassenbonus: 35 % der Kombinationen deutlich (Streuung 2, höchstens ±3,5), der Rest fast neutral. Erkennbar nur über die Statistik.

### Hengste

- **Register aus echten Pferden**: Die 40 Gründerhengste sind Pferde im Status „Deckhengst“ (Klasse im Mittel 71, Besitzer: die Gestüte der Züchter), mit erfundener Rennkarriere. Ihre Linien werden gleichmäßig auf die 8 Linien verteilt.
- **Decktaxe** aus öffentlicher Rennleistung: £2.000 × e^((OR − 90)/7) bis OR 110 (≈ £35.000), darüber flacher (OR 125 ≈ £120.000), mindestens £1.000, höchstens £300.000. Jedes Jahr fortgeschrieben: Ab 3 gerateten Nachkommen fließt deren Ø Rating gegenüber dem Durchschnitt aller Pferde ein (Gewicht n/(n + 12)); die neue Taxe ist das geometrische Mittel aus alter und Zieltaxe; ab 19 Jahren −15 %.
- **Buch**: höchstens 110 Stuten je Saison. Pension mit 24 Jahren oder, bei fremden Hengsten, nach mindestens vier Decksaisons mit weniger als 6 Stuten.
- **Neue Hengste**: KI-Hengste gehen ins Gestüt, wenn sie beim Ruhestand ein Rating ab 98 oder zwei Black-Type-Siege haben; Spitzenhengste (ab 108) schon ab vier Jahren. Höchstens 8 neue Hengste pro Jahr, Register höchstens 70. Der Spieler kann eigene Hengste ab Rating 75 aufstellen (Deckstation, £150 Hengsthaltung pro Woche; eigene Stuten deckt er kostenlos).
- **Hengstnamen**: keine weiblichen Titel und Wörter (Lady, Queen, Lass, Girl, Belle …). Bei der Migration werden solche Namen ersetzt, auch in der Abstammung der Nachkommen.

### Gestüt und Jahreszyklus

- **Decksaison** laut Konzept Januar bis Anfang März (Woche 1–10), Geburten in der Folgesaison Februar bis Mai (Woche 6–20). Biologisch läge die Decksaison eher Februar bis Juni; das Spiel folgt dem Konzept.
- **Bedeckung**: Jede Woche der Decksaison nimmt eine Stute mit 16 % × Altersfaktor × (0,8 + 0,4 × Gestütsleiter) auf (Altersfaktor 1 bis 12 Jahre, dann −6 % je Jahr). Über die ganze Saison sind das bei durchschnittlichem Gestütsleiter rund 82 %. Die Decktaxe wird bei bestätigter Trächtigkeit fällig („No Foal, No Fee“ vereinfacht). Genotyp und Geschlecht des Fohlens stehen ab der Befruchtung fest.
- **Fohlenverlust** 6 % × (1,4 − 0,8 × Gestütsleiter). Der Gestütsleiter verbessert zudem das Exterieur (±2 Punkte) und macht die Paarungsprognose genauer.
- **Gestüt** als Anlage: je Stufe 6 Plätze für Stuten und Nachwuchs (£60.000, £150 Unterhalt pro Woche, höchstens 5 Stufen). Eigener Platz £35 je Pferd und Woche; ohne Platz Pension bei einem fremden Gestüt für £90 (dort arbeitet ein durchschnittlicher Gestütsleiter). Der Spieler startet ohne Gestüt und ohne Stuten.
- **Gestütsleiter**: neue Personalrolle, Grundgehalt £360.
- **Stuten**: Spielerstuten gehen mit acht Jahren automatisch in die Zucht, vorher auf Wunsch. Gedeckt wird bis 21 Jahre, mit 23 gehen sie in den Ruhestand. KI-Ställe halten 6–12 Stuten (je Stall fest), nehmen eigene Stuten ab Rating 62 auf und kaufen zu, wenn die Herde zu klein wird. Ab 16 Jahren mustern sie Stuten aus (15 % je Jahr über 15). Die Züchter halten 150 Stuten und kaufen ausgemusterte Rennstuten der KI (ab Rating 55) oder Importe.
- **Nachwuchs**: Fohlen und Jährlinge stehen im Gestüt (Status „Nachwuchs“) und gehen mit zwei Jahren (1. Januar) ins Training – beim Spieler nur, wenn eine Box frei ist, sonst bleiben sie im Gestüt. Jährlinge der Züchter kommen auf die Jährlingsauktion (die besten 80), die übrigen als Zweijährige auf die Breeze-up-Auktion; fehlende Lose sind Importe mit echtem Vater aus dem Register. Der Spieler kann eigene Jährlinge, Stuten und Rennpferde in die passende Auktion einliefern oder Nachwuchs, Stuten und Hengste für 60 % des Marktwerts an die Züchter verkaufen.
- **Zuchtstutenauktion** in Woche 49: überzählige und ältere Stuten der KI und die schwächsten der Züchter; KI-Ställe mit Platz in der Herde bieten.
- **Spielstart**: Die Stuten von KI und Züchtern sind bereits gedeckt (Start in Woche 10), damit im ersten Frühjahr Fohlen kommen. Die Väter der Start-Rennpferde werden nur schwach nach Klasse gewählt (passend zu h²), damit die Nachkommen-Statistik der Gründerhengste so aussagekräftig ist wie später im Spiel.
- **Population**: KI-Ställe werden zum Jahreswechsel auf 45 Pferde im Training aufgefüllt – erst aus eigener Zucht und Käufen, der Rest mit Importen (echter Vater, Mutter aus dem Ausland). Bei mehr als 48 Pferden gehen die schwächsten Älteren. Der Spieler erhält Zweijährige „aus der Zucht des Besitzers“ nur noch bis zur dritten Saison, bis die eigene Zucht greifen kann.

### Prognose und Statistik

- **Paarungsprognose** (öffentlich): Erwartetes Niveau des Fohlens auf der Rating-Skala = Weltmittel + Beitrag von Hengst und Stute. Jeder Beitrag ist h²/2 der öffentlichen Leistungsabweichung (Decktaxe bzw. Rating); mit wachsender Zahl gerateter Nachkommen zählt deren Ø-Abweichung (Gewicht n/(n + 6)). Spanne ±1,3 × (3 + 4 × (1 − Gestütsleiter)) Klassenpunkte. Gegen den verborgenen Erwartungswert geprüft: ohne Verzerrung, Korrelation 0,51 (der Rest steckt in den verborgenen Genen und Nicks). Dazu kommen der Inzuchtkoeffizient (exakt) und die bisher beobachtete Nick-Statistik der Linienkombination.
- **Zucht-Statistik**: Hengsttabelle (Nachkommen, Sieger, Ø Rating, Black-Type-Sieger, mittlere Siegdistanz, Bodenneigung aus den Siegen), Mutterstuten, Nick-Matrix (Ø Rating je Vaterlinie × Muttervaterlinie ab 3 Pferden), Züchtertabelle.
- **Marktwert** für Nachwuchs (Abstammung, Mutterleistung, Exterieur; Fohlen × 0,6), Zuchtstuten (£6.000 × e^((Rating − 70)/14), Aufschlag für erfolgreiche Nachkommen, Altersabschlag ab 11 Jahren, tragend + 60 % der Decktaxe) und Deckhengste (Decktaxe × 45 × Altersfaktor).

### Teilhaberschaften und Einstellpferde

- **Teilhaberschaften**: Anteile zu 25 % oder 50 % an Rennpferden der KI (ab £25.000 Marktwert, nicht die Top 3 des Stalls) und an Deckhengsten der KI und der Gestüte (ab £2.000 Decktaxe). Teilhaber halten zusammen höchstens 50 %, der Besitzer entscheidet allein. Preis = anteiliger Marktwert + 15 %, Rückverkauf an den Besitzer zu 85 %. Teilhaber erhalten ihren Anteil am Preisgeld (nach Trainer- und Jockeybeteiligung), an Decktaxen und am Verkaufserlös und tragen anteilig den Unterhalt. Mit dem Ruhestand endet die Teilhaberschaft.
- **Einstellpferde**: Alle 4 Wochen fragt mit Wahrscheinlichkeit (Ruf − 15)/80 (8–60 %) ein fiktiver Besitzer an, wenn eine Box frei ist; die Anfrage gilt 3 Wochen. Wochenpauschale £300 + 4 × Ruf (Ruf 25: £400), dazu 10 % des Preisgelds. Nenn- und Reitgebühren trägt der Besitzer, den Unterhalt der Spieler (über die Pauschale gedeckt). Verkauf, Einlieferung, Claiming-Rennen und Zucht sind ausgeschlossen. Die Zufriedenheit steigt mit Siegen, Platzierungen und Figures über der Erwartung und sinkt, wenn ein gesundes Pferd in der Saison mehr als 8 Wochen nicht läuft; unter 20 holt der Besitzer das Pferd ab. Ab 6 Jahren beendet der Besitzer die Karriere.

### Archiv und Leistung

- **Archiv**: Replays (Neusimulation), Geschwindigkeitskurven, Rennereignisse und Nennlisten werden nur für die laufende und die vorige Saison aufbewahrt, Sectionals älterer Rennen nur für eigene Starts. Ergebnisse, Zeiten, Speed Figures und alle Statistiken bleiben. Archiviert wird beim Jahreswechsel und (im Speicher) beim Laden.
- **Pferde-Index**: Pferde je Stall und Status liegen in einem nicht gespeicherten Index, der bei jedem Besitzer- oder Statuswechsel neu aufgebaut wird.
- **10 Saisons** (npm run simulate:generations, Seed 20261117, KI-Ställe per Autopilot): keine Abstürze; im Training 914–937 Pferde, 337–343 Zuchtstuten, 34–51 Deckhengste, rund 280 Fohlen und Jährlinge; je Jahrgang 235–266 Fohlen mit Ø Klasse 59,8–60,9 (Streuung ~8,3, keine Drift); Ø Inzucht unter 0,1 %. Laufzeit Ø 67–149 ms je Woche, am Jahreswechsel bis 0,7 s. Der Spielstand wächst trotz Archiv um ~14 MB je Saison (nach 10 Saisons ~160 MB, vor allem Starts und Ergebnisse aller Rennen).
- **Wirtschaft** (npm run calibrate:economy, 3 Saisons): Rangkorrelation Auktionspreis ~ Qualität 0,86–0,96 (Breeze-up, Jährlinge); Zuchtstuten im Median £2.000, gute bis £110.000; Autopilot-Spielerstall weiterhin etwa −£85.000 je Saison.

### Migration

- Version-2-Stände: Die Hengste des alten Registers werden Pferde mit denselben IDs (Abstammungen bleiben gültig). Ihre Qualität wird um 9 Punkte auf die neue Skala gehoben, Decktaxen werden neu aus der (erfundenen) Rennleistung berechnet. KI-Ställe und Züchter erhalten Stutenherden, nach der Decksaison mit Trächtigkeiten. Hengstnamen mit weiblichen Titeln werden ersetzt.

## Phase 5: Grafik und Feinschliff (freigegeben am 18.11.2026)

Ziel laut Konzept: Ein Außenstehender kann ohne Erklärung spielen. Videos entfallen (MVP), der Zufallsregler bleibt beim Standard „ausgewogen“ (40 %).

### Spielstände

- **Speicherform**: Starts, Rennen und Pferde werden in IndexedDB und im Export verdichtet (`engine/game/archive.ts`). Felder, die sich aus Rennen und Ausschreibung ergeben (Rennname, Bahn, Distanz, Klasse, Datum, Boden, Feldgröße), entfallen; feste Felder eines Starts stehen als Werteliste, Sectionals als Zahlenreihe, Taktiken als Zeichenkette. Die Kennzahlen eines Pferds (`stats`) werden beim Laden aus seinen Starts neu berechnet. Im Speicher bleibt alles in voller Form; ältere Stände ohne Verdichtung werden unverändert gelesen.
- **Archiv**: Sectionals, Tempokurven und Rennereignisse der Konkurrenz nur noch für die laufende Saison (vorher zwei). Replays und Nennlisten: Rennen mit eigenen Startern zwei Saisons, sonst eine.
- **Export** als gzip (`.json.gz`); der Import liest gzip und reines JSON.
- **Ergebnis** (`npx tsx scripts/save-size.ts 4`, Seed 7, 20 KI-Ställe): Der gespeicherte Stand wächst um ~4,8 MB je Saison statt ~14 MB, die Exportdatei um ~1 MB (nach 4 Saisons 21,9 MB JSON, 4,0 MB gzip). Im Arbeitsspeicher des Workers liegen weiterhin ~15 MB je Saison.
- **Nachverdichtung (19.11.2026)**: Starter gelaufener Rennen stehen nur noch als Verweis auf ihren Start (Index in `resultRunIds`, ~550 → ~40 Byte je Rennen); Starts tragen keine Rennen-ID mehr, wenn das Rennen sie listet; Standardtaktik als 0, leere Sectionals entfallen; Ausschreibungen als Werteliste; Genotyp-Allele als Zeichenkette (zwei Zeichen je Wert, verlustfrei bei zwei Nachkommastellen); Wertverlauf mit Wochenabständen. Messung mit `npx tsx scripts/save-detail.ts 3` (Seed 7): Zuwachs 2,6 / 3,4 / 3,0 MB je Saison statt ~4,6 MB – das Ziel von ~3 MB ist erreicht. Ältere Spielstände werden weiter gelesen und beim nächsten Speichern neu verdichtet.

### Einstieg

- **Erste Schritte**: Checkliste im Büro mit sieben Schritten (Stall, Pferdeprofil, Nennung, Woche abschließen, Rennergebnis, Personal, Finanzen). Besuche meldet die Oberfläche, Nennung und Woche ergeben sich aus dem Spielstand. Ausblendbar; ältere Spielstände, die schon über Woche 4 hinaus sind, bekommen sie nicht.
- **Hilfe & Glossar**: neuer Menüpunkt mit Wochenablauf und 22 Fachbegriffen; dieselben Erklärungen erscheinen als Tooltip an Spaltenköpfen (OR, SF, Boden, Fitness, Frische, Decktaxe, Nick).
- **Spielstart**: kurzer Einführungstext, drei Voreinstellungen für den Zufall (berechenbar 15 %, ausgewogen 40 %, wie im echten Leben 80 %) plus Regler; KI-Ställe und Seed unter „Erweitert“.

### Grafik (Higgsfield)

- **Stiltest** (18.11.2026): 12 Bilder für 15 Credits. Nano Banana 2.1 kostet 1,5 Credits je Bild (1k), GPT Image 2.6 in mittlerer Qualität 0,5 Credits. Beide treffen Ölbild- und Plakatstil; GPT Image hält die Fellfarbe genauer ein und malt keinen Rahmen und wurde für alle weiteren Bilder genommen (Spieler: „sehen top aus“, keine eigene Wahl).
- **Bibliothek**: 67 Bilder, alle GPT Image 2.6 (mittel, 1024 px), als WebP direkt von Higgsfield (~85 KB je Bild, 4,8 MB zusammen) unter `public/assets`. Quelle und Zielpfad je Bild stehen in `assets/generated.json`, `npm run assets:fetch` lädt fehlende Dateien nach; die Prompts in `assets/prompts.json`.
  - 20 Pferdeporträts (5 Fellfarben × Profil/Galopp × Fohlen/erwachsen). Das Pferdeprofil zeigt das Profilbild; Fohlen und Jährlinge die Fohlenfassung.
  - 23 Personal-Porträts: je Rolle mindestens eine Frau und ein Mann. Zugeordnet wird über den Vornamen aus der Namensliste des Generators und deterministisch über die Personen-ID. Personen aus der Weltdatei (reale Namen, Platzhalter) und unbekannte Vornamen bekommen kein Porträt, sondern Initialen – damit kein erfundenes Gesicht einer realen Person zugeordnet wird.
  - 10 Rennbahn-Plakate: Ascot, Epsom, Newmarket (auch July Course), York, Goodwood, Doncaster, Sandown, Newbury, dazu ein Allwetter-Plakat (Flutlicht) und ein allgemeines Plakat (aus dem Stiltest) für alle übrigen Bahnen. Cheltenham aus der Konzeptliste entfällt (Hindernisbahn, im Spiel nicht vorhanden), dafür Newbury.
  - 6 Klassiker-Plakate (2000/1000 Guineas, Derby, Oaks, St Leger, King George) als Kopfbild ihrer Rennseiten.
  - 8 Szenen: Hof in drei Ausbaustufen (nach Boxenzahl: unter 16, ab 16, ab 30), Bergstrecke, Schwimmbecken, Tierklinik, Gestütsweiden, Büro.
- **Stutenporträts (19.11.2026)**: Erwachsene Stuten zeigen ein eigenes Kopf-Schulter-Porträt je Fellfarbe (5 Bilder). Ein erster Versuch mit Ganzkörper-Stuten ergab trotz Prompt durchweg männliche Anatomie und wurde verworfen; der Bildausschnitt umgeht das. Fohlen, Hengste und Wallache behalten die bisherigen Bilder.
- **Nicht erzeugt**: Abzeichen-Ebenen und Jockey mit Graustufen-Silks. Gemalte Ebenen lassen sich nicht passgenau über unterschiedlich gemalte Porträts legen; die Abzeichen stehen deshalb als Text unter dem Porträt, die Rennfarben bleiben SVG (frei einfärbbar). Ebenso entfällt die Pergament-Textur (CSS genügt). Videos entfallen laut Konzept.
- **Kosten**: Stiltest 15 + Bibliothek 33 + Stuten 5 (10 Bilder, davon 5 verworfen) = **53 Credits**, Rahmen 350.
- **Einbindung**: `src/ui/assets.ts` (Pfade, Zuordnung), `Portrait.tsx` (Pferdeporträt, Personen-Avatar, Kopfbild). Kopfbilder im Startbildschirm, Büro, Gestüt, auf Rennseiten und in der Anlage; Avatare in Personal und Jockeys; Vorschaubilder der Ausbauten.
- **Nutzungsrechte**: vor einer öffentlichen Veröffentlichung laut Higgsfield-Tarif prüfen (Konzept).

### Rennansicht

- **Kommentar**: Statt einer einzigen Zeile entsteht aus dem Replay eine Liste von Kommentarzeilen mit Zeitpunkt (Start, Rennereignisse wie schlechter Start oder eingeschlossen, Führungswechsel mit mindestens 2 s Bestand, Halbzeit, 400 m und 200 m vor dem Ziel, eigenes Pferd 400 m vor dem Ziel, Zieleinlauf mit Abstand in Worten). Die letzten sechs Zeilen stehen unter der Bahn, eigene Pferde hervorgehoben.
- **Zielfoto**: Liegt der Zweite weniger als 0,3 Längen zurück, erscheint nach dem Zieleinlauf ein Zielfoto der ersten drei, maßstäblich nach dem amtlichen Abstand.
- **Positionsliste**: Pferde im Ziel stehen nach dem offiziellen Platz (vorher nach der Strecke inklusive Auslaufen).

### Training (19.11.2026)

- Neuer Menüpunkt **Training**: alle eigenen Pferde mit Fitness, Frische, Vorlage und den sechs Trainingstagen als Auswahl; Tage nach Belastung eingefärbt (hoch, mittel, niedrig, erholend), dazu die Trainer-Einschätzung zur Distanz und das nächste Rennen. Eine Vorlage lässt sich für alle gesunden Pferde auf einmal setzen. Verletzte Pferde zeigen statt der Tage einen Hinweis.
- **Trainer-Einschätzung** (Distanz, Boden, Laufstil) zusätzlich in der Stall-Übersicht und im Rennkalender, sobald dort ein Pferd gewählt ist.
