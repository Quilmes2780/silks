# Spielkonzept: Rennstall-Manager (Arbeitstitel „Silks & Stamina“)

Nov 17, 2026 · @Dennis

## Vision und Spielgefühl

Ein Single-Player-Managerspiel im Browser: Der Spieler baut aus einem kleinen Stall mit zwei mittelmäßigen Pferden über viele Saisons einen Rennstall von Weltrang auf – durch kluge Zucht, Training, Handel und Personalführung. Das Herzstück ist ein glaubwürdiges Leistungsmodell der Pferde, das sich in tiefen, nachvollziehbaren Statistiken zeigt.

- **Genre:** Wirtschafts- und Sportmanager (Vorbilder im Geist: Football Manager, Out of the Park Baseball, klassische Galopp-Manager der 90er).
- **Disziplin zum Start:** Galopp (Flach) nach britischem Vorbild – Rennkalender, Klassen, Official Ratings und Handicap-Gewichte wie in Großbritannien. Hindernis und Traben als spätere Erweiterungen.
- **Spielgefühl:** ruhig, analytisch, „noch eine Saison“. Der Reiz liegt im Lesen von Daten und im langfristigen Zuchtplan, nicht in Reaktionsschnelligkeit.
- **Zielgruppe:** Erwachsene Strategie- und Managerspieler, Pferdesportinteressierte, Statistik-Fans.
- **Optik:** edel und britisch-klassisch – Tweed, Messing, Rennfarben (Silks), Ölgemälde-Ästhetik für Pferdeporträts, klare Datenoberflächen.
- **Abgrenzung:** Kein Wettspiel um echtes Geld. Wetten gibt es höchstens als spielinterne Quoten-Anzeige, die die Marktmeinung über ein Pferd zeigt.

## Kern-Spielschleife und Zeitmodell

Das Spiel läuft rundenbasiert in Wochen; der Spieler plant, drückt „Woche abschließen“ und sieht die Ergebnisse. Eine Saison hat 52 Wochen, Rennen finden am Wochenende statt.

**Wochenschleife**

1. Posteingang lesen: Verletzungen, Angebote, Nennungsfristen, Berichte des Trainers.
2. Trainingspläne pro Pferd anpassen.
3. Rennen nennen, Jockeys buchen, Taktik festlegen.
4. Handel und Personal: Auktionen, Angebote, Verträge.
5. Woche simulieren → Rennen laufen → Ergebnisse, Preisgeld, Statistiken.

**Jahreszyklus**

| Zeitraum | Schwerpunkt |
| --- | --- |
| Jan–Feb | Decksaison: Stuten werden gedeckt, Allwetterbahnen, Planung |
| März–Okt | Hauptsaison auf Rasen, klassische Rennen (Guineas, Derby, Oaks) |
| Feb–Mai | Fohlengeburten |
| Sep–Okt | Jahrlingsauktionen |
| Nov–Dez | Zuchtstutenauktionen, Saisonbilanz, Awards, Vertragsrunde |

Alle Pferde altern zum 1. Januar ein Jahr (Konvention im Galoppsport). Ein Pferd läuft typischerweise mit 2 bis 5 Jahren und geht dann in die Zucht – so entsteht der Generationen-Kreislauf, der das Spiel langfristig trägt.

## Pferde: Attribute, Genetik, Zucht

Jedes Pferd hat ein verborgenes genetisches Potenzial und sichtbare, aktuelle Werte. Der Spieler sieht nie die exakten Gene, sondern schätzt sie über Rennleistungen, Trainerberichte und Abstammung – das macht Statistiken spielentscheidend.

**Leistungsattribute (Skala 1–100, intern Dezimalwerte)**

| Attribut | Wirkung im Rennen |
| --- | --- |
| Grundschnelligkeit | Spitzengeschwindigkeit in m/s |
| Beschleunigung | wie schnell die Spitze erreicht wird (Start, Ausbruch aus dem Feld) |
| Ausdauer | wie lange das Tempo gehalten wird; bestimmt die Wunschdistanz |
| Speedreserve (Kick) | Endspurt-Energie für die letzten 200–400 m |
| Kampfgeist | Reaktion im Kopf-an-Kopf-Duell |
| Wendigkeit | Kurven, Bahnen mit engen Bogen, Lücken finden |
| Temperament | Startboxverhalten, Zerren, Reaktion auf Feldgröße |
| Konstanz | Streuung der Tagesform |

**Präferenzen:** Distanzoptimum (z. B. 1.600–2.000 m), Bodenvorliebe (fest bis schwer), Bahnrichtung (links/rechts), Laufstil (Front-, Mitte-, Schlussläufer).

**Entwicklung:** Jedes Pferd folgt einer Reifekurve – Frühreifer gipfeln mit 2–3, Spätentwickler mit 4–5. Training verschiebt den aktuellen Wert Richtung Potenzial, nie darüber hinaus.

**Gesundheit:** Fitness (0–100), Frische/Ermüdung, Verletzungsrisiko pro Bein, Erkrankungen (Husten, Sehnenschaden, Hufprobleme) mit Ausfallzeiten. Überforderung erhöht das Risiko messbar.

**Genetik und Zucht**

- Jedes Attribut wird durch mehrere Gen-Paare plus Zufallsrauschen bestimmt; Fohlen erben je eine Hälfte von Hengst und Stute.
- Sichtbare Merkmale (Fellfarbe, Abzeichen) folgen echten Erbgängen – ein kleines Detail, das Kenner freut.
- Inzuchtkoeffizient wird angezeigt; zu enge Linien kosten Konstanz und Gesundheit.
- „Nicks“: bestimmte Blutlinien-Kombinationen harmonieren statistisch besser – der Spieler kann sie über Nachkommen-Statistiken entdecken.
- Eigene Deckhengste bringen Decktaxen-Einnahmen; fremde Hengste kosten Decktaxe.

## Training und Rennplanung

Training ist ein Wochenplan aus Bausteinen; jeder Baustein trainiert bestimmte Attribute und kostet Frische. Die Kunst ist, das Pferd zum Zielrennen in Topform zu bringen, ohne es zu überlasten.

| Baustein | Trainiert | Belastung |
| --- | --- | --- |
| Ruhiger Canter | Grundfitness | niedrig |
| Galopp-Arbeit (Gallop) | Grundschnelligkeit, Ausdauer | mittel |
| Bergtraining | Ausdauer, Kraft | hoch |
| Sprint-Intervalle | Beschleunigung, Kick | hoch |
| Startboxtraining | Temperament | niedrig |
| Schwimmen / Weide | Erholung, Verletzungsvorbeugung | negativ (erholt) |

- **Form:** Fitness und Frische ergeben eine Formkurve, die der Trainer in Worten („fast bereit“) und mit Stall-Zugang zu genaueren Daten auch als Zahl meldet.
- **Trainerqualität** bestimmt Trainingseffizienz und wie genau Prognosen sind.
- **Rennplanung:** Rennkalender mit Filtern nach Distanz, Boden, Klasse (Maiden, Handicap, Listed, Gruppe 3/2/1), Preisgeld, Altersgruppe. Nennungen haben Fristen und Gebühren.
- **Handicap-System:** Jedes Pferd erhält nach drei Starts ein offizielles Rating (wie das britische Official Rating); im Handicap tragen bessere Pferde mehr Gewicht.
- **Ausrüstung:** Scheuklappen, Zungenband, Hufbeschlag – kleine Modifikatoren mit Risiken.

## Rennsimulation

Jedes Rennen wird physikalisch-vereinfacht in Zeitschritten von 0,1 s simuliert; daraus entstehen alle Statistiken. Die Simulation läuft deterministisch aus einem Seed, sodass jedes Rennen reproduzierbar und als Replay abspielbar ist.

**Modell pro Zeitschritt**

- Jedes Pferd hat Position (Distanz, Bahnspur), Geschwindigkeit und einen Energievorrat.
- Zielgeschwindigkeit ergibt sich aus Attributen, Taktik des Jockeys, Rennphase und Boden; Energie wird je nach Tempo überproportional verbraucht.
- Ist die Energie aufgebraucht, fällt das Tempo ab – so entstehen realistische Rennverläufe mit einbrechenden Frontläufern und aufkommenden Schlussläufern.
- Verkehr: Pferde können eingeschlossen werden, außen herum laufen (mehr Meter) oder Lücken finden (Wendigkeit, Jockey-Geschick).
- Zufall: Tagesform (Konstanz), Startgeschwindigkeit, Rennzwischenfälle – bewusst begrenzt, damit Daten aussagekräftig bleiben.

**Taktik-Vorgaben:** Laufposition (führen, vorne mit, Mitte, hinten), Zeitpunkt des Angriffs, Peitschen-Einsatz (begrenzt nach Regeln), Rails oder außen.

**Darstellung:** Draufsicht auf die Bahn (2D, Canvas) mit Pferde-Markern in Rennfarben, Kommentar-Ticker, Live-Zwischenzeiten. Wahlweise Sofortergebnis, Schnellvorlauf oder volle Länge. Ein Higgsfield-Video als Zieleinlauf-Szene für große Rennen (Gruppe 1) ist optional.

**KI-Konkurrenz:** 30–60 computergesteuerte Ställe mit eigenen Strategien (Zuchtfokus, Handelsstall, Sprinter-Spezialist), die ebenfalls züchten, kaufen und verkaufen – die Welt lebt.

## Wirtschaft und Handel

Geld ist knapp und jede Investition eine Wette auf Daten. Einnahmen kommen aus Preisgeld, Verkäufen, Decktaxen und Einstellgebühren fremder Besitzer; Ausgaben aus Unterhalt, Gehältern, Tierarzt, Nennungen und Ausbau.

**Handelswege**

- **Jahrlingsauktion:** Junge Pferde ohne Rennleistung – Kauf nach Abstammung, Exterieur-Bewertung und Gutachten des Bloodstock-Agenten. Bieten in Echtzeit gegen KI-Ställe.
- **Breeze-up-Auktion:** Zweijährige zeigen vorab einen kurzen Galopp mit gemessener Zeit.
- **Zuchtstuten- und Abgangsauktion:** Ausgemusterte Rennpferde und Stuten.
- **Transfermarkt:** Direktverhandlung mit KI-Ställen, auch Teilhaberschaften (z. B. 50 % an einem Hengst).
- **Claiming-Rennen:** Jedes Pferd im Rennen kann zu einem festen Preis gekauft werden – klassischer Schnäppchenmarkt mit Risiko, das eigene Pferd zu verlieren.

**Bewertung:** Ein Marktwert-Modell aus Rating, Alter, Geschlecht, Abstammung und Gesundheit; dessen Verlauf ist als Diagramm im Pferdeprofil zu sehen.

**Infrastruktur:** Boxen (Kapazität), Trainingsbahnen (Sand, Rasen, Bergstrecke), Gestüt mit Weiden, Tierklinik, Schwimmbecken. Jede Ausbaustufe schaltet Trainingsbausteine frei oder senkt Risiken.

**Finanzübersicht:** Monats- und Saisonbilanz, Kosten pro Pferd, Return on Investment pro Pferd – auch das sind Leistungsdaten.

## Personal

Personal ist der Hebel, mit dem der Spieler seine Pferde besser macht und besser versteht: Gute Leute verbessern Ergebnisse und machen die verborgenen Werte der Pferde sichtbarer.

| Rolle | Einfluss | Wichtige Eigenschaften |
| --- | --- | --- |
| Cheftrainer | Trainingseffizienz, Formprognose, Rennauswahl-Empfehlungen | Fachwissen, Spezialisierung (Sprint/Steher), Menschenführung |
| Assistenztrainer | entlastet bei großem Stall (ab ca. 20 Pferden) | Fachwissen, Loyalität |
| Jockey (Stall- oder freier Jockey) | Taktikumsetzung, Lücken finden, Endspurt | Gewicht, Taktikverständnis, Gefühl für Tempo, Sperren-Risiko |
| Arbeitsreiter | Qualität des täglichen Trainings | Gefühl, Gewicht |
| Pfleger | Wohlbefinden, Temperament, Gesundheit | Sorgfalt, Bindung zu einzelnen Pferden |
| Tierarzt | Diagnose, Heilungsdauer, Früherkennung | Diagnosegenauigkeit |
| Hufschmied | Verletzungsprophylaxe, Bodenanpassung | Handwerk |
| Gestütsleiter | Abfohlerfolg, Fohlenentwicklung | Zuchtwissen |
| Bloodstock-Agent | Genauigkeit der Auktionsgutachten, Kontakte | Auge, Netzwerk |
| Datenanalyst | schaltet erweiterte Statistiken frei (Sectional Times, Speed Figures) | Analytik |

- **Verwaltung:** Verträge mit Laufzeit und Gehalt, Erfolgsbeteiligung für Jockey und Trainer (üblich ca. 10 % des Preisgelds).
- **Moral und Zufriedenheit:** abhängig von Erfolg, Gehalt, Arbeitslast; unzufriedene Leute wechseln zur Konkurrenz.
- **Entwicklung:** Personal sammelt Erfahrung und kann Fortbildungen besuchen; Nachwuchsjockeys erhalten Gewichtserlaubnis.
- **Pfleger-Pferd-Bindung** als kleines emotionales Detail: der Pfleger eines Derby-Siegers wird in der Siegerehrung erwähnt.

## Statistiken und Leistungsdaten

Die Statistik ist das eigentliche Spiel: Weil die echten Werte verborgen sind, liest der Spieler die Qualität seiner Pferde aus den Rennen heraus. Jedes Rennen erzeugt daher Rohdaten pro Pferd und pro 200-m-Abschnitt, aus denen alle Kennzahlen berechnet werden.

**Rohdaten pro Start**

- Endzeit, Platzierung, Abstand in Längen, Startbox, getragenes Gewicht, Boden, Distanz, Bahn, Feldgröße, Jockey, Taktik.
- Sectional Times: Zeit je 200 m, Position und Abstand zum Führenden an jedem Messpunkt.
- Geschwindigkeitskurve (m/s über die Distanz), Spitzentempo, gelaufene Meter (Umweg durch Außenbahn).
- Rennkommentar-Ereignisse: eingeschlossen, schlecht gestartet, gezerrt.

**Abgeleitete Kennzahlen**

| Kennzahl | Was sie zeigt |
| --- | --- |
| Speed Figure | normierte Leistung eines Starts, bereinigt um Boden, Distanz, Gewicht – der zentrale Vergleichswert |
| Official Rating | Handicap-Einstufung, wird nach jedem Start angepasst |
| Finishing Speed % | Tempo der letzten 400 m relativ zum Durchschnittstempo – erkennt Steher und Sprinter |
| Energieverteilung | wie gleichmäßig das Pferd läuft (Pace-Profil) |
| Leistung nach Bedingung | Speed Figure gruppiert nach Distanz, Boden, Bahn, Startbox, Jockey, Pause seit letztem Start |
| Formkurve | Speed Figures der letzten 10 Starts als Linie mit Trend |
| Konstanz-Index | Streuung der Speed Figures |
| Strike Rate | Sieg- und Platzquote, auch je Klasse |
| Verdienst | Preisgeld gesamt und pro Start |

**Ansichten**

- **Pferdeprofil:** Karriere-Tabelle aller Starts, Formkurve, Radar-Diagramm der geschätzten Attribute (mit Unsicherheitsband, das mit mehr Starts schmaler wird), Distanz-×-Boden-Heatmap.
- **Rennanalyse:** Sectional-Chart aller Pferde eines Rennens (Position über Distanz), Geschwindigkeitskurven übereinander, Pace-Analyse (zu schnell / zu langsam angegangen).
- **Vergleich:** zwei bis vier Pferde nebeneinander, inklusive gemeinsamer Gegner (Form-Linien).
- **Abstammungs-Statistik:** Nachkommen-Leistung je Hengst und Stute, Distanz- und Bodenvererbung, erfolgreiche Nicks, Gewinnerquote der Nachkommen.
- **Ranglisten:** Top-Speed-Figures der Saison, Besitzer-, Trainer-, Jockey- und Züchtertabellen.
- **Export:** CSV aller Starts für eigene Auswertungen.

**Grundsatz:** Jede Zahl ist anklickbar und führt zum Rennen, aus dem sie stammt. So bleibt die Datenspur nachvollziehbar.

## Screens und UI-Struktur

Die Oberfläche ist ein Desktop-Browser-Layout mit linker Navigation, einer Kopfzeile (Datum, Kontostand, „Woche abschließen“) und dichten, sortierbaren Tabellen.

| Bereich | Inhalt |
| --- | --- |
| Büro (Startseite) | Posteingang, anstehende Rennen, Formstatus aller Pferde, Finanz-Kurzinfo |
| Stall | Liste aller Pferde mit Filter; Pferdeprofil mit Tabs: Übersicht, Statistik, Training, Gesundheit, Abstammung |
| Training | Wochenplaner als Raster Pferd × Tag, Belastungsampel |
| Rennkalender | Kalender- und Listenansicht, Nennungen, Gegner-Vorschau mit deren Speed Figures |
| Renntag | Startliste, Quoten, Taktik-Dialog, Rennansicht, Ergebnis und Rennanalyse |
| Gestüt | Stuten, Deckplan mit Hengst-Suche und Paarungs-Prognose, Fohlen |
| Markt | Auktionen, Transferliste, Claiming-Rennen, Angebote |
| Personal | Team, Verträge, Bewerber |
| Anlage | Ausbau der Infrastruktur |
| Statistik-Zentrale | Ranglisten, Vergleiche, Abstammungs-Auswertungen, Export |
| Finanzen | Bilanz, Kosten je Pferd, ROI |

Diagramme (Formkurve, Sectionals, Radar, Heatmap) laufen über eine Chart-Bibliothek, nicht über generierte Bilder – Daten bleiben exakt und interaktiv.

## Grafik-Pipeline mit Higgsfield

Alle Bild- und Videoelemente werden vorab mit Higgsfield erzeugt und als statische Bibliothek ins Spiel eingebunden – nicht zur Laufzeit. So bleiben Kosten planbar, das Spiel läuft ohne API-Schlüssel im Browser und der Stil bleibt einheitlich.

**Stil festlegen**

1. Style Guide: „klassisches englisches Pferdeporträt, Öl auf Leinwand, warme Brauntöne, ruhiger Hintergrund“ für Pferde; „plakative Vintage-Rennplakate der 1930er“ für Rennbahnen und Events.
2. Ein Dutzend Probebilder erzeugen, die besten als Referenzelemente in Higgsfield hinterlegen und für alle weiteren Generierungen nutzen – das hält Pinselstrich, Licht und Proportionen konsistent.

**Pferde-Grafiken modular statt einzeln**

Es wird nicht jedes der tausenden Pferde einzeln gemalt. Stattdessen entsteht eine Bibliothek, die das Spiel aus den Genen zusammensetzt:

- Basisporträts je Fellfarbe (Brauner, Fuchs, Rappe, Schimmel, Dunkelbrauner) in drei Posen (Profil, Dreiviertel, Galopp) und zwei Altersstufen (Fohlen, erwachsen).
- Abzeichen (Stern, Blesse, weiße Füße) als freigestellte Ebenen über dem Basisbild, per Hintergrundentfernung aus Higgsfield vorbereitet.
- Rennfarben (Silks) des Jockeys werden in neutralem Grau generiert und im Browser per Farbmaske eingefärbt – so kann der Spieler seine Farben frei gestalten.

**Asset-Liste für den MVP**

| Asset | Menge (ca.) | Credit-Rahmen | Higgsfield-Werkzeug |
| --- | --- | --- | --- |
| Stilfindung und Testlauf | 8–10 | 30 | Bildgenerierung; Kosten pro Bild messen |
| Pferde-Basisporträts (5 Fellfarben × 2 Posen × Fohlen/erwachsen) | 20 | 90 | Bildgenerierung mit Referenzbildern |
| Abzeichen-Ebenen, Jockey mit Graustufen-Silks | 8 | 30 | Bildgenerierung, Hintergrund entfernen |
| Personal-Porträts (generisch, mehrfach verwendet) | 16 | 45 | Bildgenerierung im Stapel |
| Rennbahnen (z. B. Ascot, Epsom, Newmarket, York, Goodwood, Cheltenham, Doncaster, Sandown) | 8 | 40 | Bildgenerierung im Breitformat |
| Stall-Ausbaustufen, UI-Hintergründe, Plakate der Klassiker | 15 | 45 | Bildgenerierung |
| Videoclips | 0 | 0 | im MVP gestrichen; nur aus Reserve, falls übrig |
| Reserve für Nachbesserungen | – | 70 | – |
| **Summe** | **ca. 75** | **350** |  |

Icons, Diagramme, Rennansicht und Rahmen entstehen im Code (SVG/CSS) und kosten keine Credits. Generiert wird in 1k-Auflösung; nur Titelbilder werden hochskaliert.

**Arbeitsablauf:** Prompt-Liste als Datei führen → Stapelgenerierung → Auswahl → Hintergrund entfernen / Upscale → Export als WebP in `assets/` → Asset-Manifest (JSON) ordnet Fellfarbe, Pose und Datei zu. Die Prompts bleiben im Repo, damit Nachgenerierungen reproduzierbar sind.

**Kosten:** Der Rahmen liegt bei höchstens 350 Credits (aktuelles Guthaben: 681,5). Die Kosten je Bild sind modellabhängig und werden erst im Auftrag angezeigt, daher misst der Testlauf den echten Preis; danach werden die Mengen der Tabelle angepasst. Jede Gruppe wird erst nach Freigabe generiert, und vor jedem Auftrag wird ein Kostenlimit gesetzt. Nutzungsrechte der generierten Bilder laut Higgsfield-Tarif prüfen, falls das Spiel öffentlich erscheinen soll.

## Technik und Architektur

Das Spiel läuft vollständig im Browser ohne Server: TypeScript, React für die Oberfläche, die Spiellogik als reiner TypeScript-Kern in einem Web Worker, Speicherstände in IndexedDB. Das passt gut zur Umsetzung mit Claude Code.

&#91;embedded content: Architektur · 4 Bausteine, alles clientseitig\]

Die Oberfläche schickt nur Befehle an den Spielkern; nur der Kern liest und schreibt die Datenbank.

- **Spielkern (Engine):** Simulation, Genetik, Wirtschaft, KI-Ställe – ohne UI-Abhängigkeiten, deterministisch per Seed, mit Unit-Tests für das Leistungsmodell.
- **Web Worker:** Die Wochensimulation (viele Rennen, 50+ KI-Ställe, tausende Pferde) blockiert die Oberfläche nicht.
- **Datenhaltung:** IndexedDB (z. B. über Dexie) mit Tabellen für Pferde, Starts, Sectionals, Personal, Finanzen; Sectionals werden nach einigen Saisons zu Kennzahlen verdichtet, um Speicher zu sparen.
- **Statistik:** Kennzahlen werden beim Rennabschluss berechnet und gespeichert, nicht bei jedem Seitenaufruf.
- **Diagramme:** eine Chart-Bibliothek wie ECharts (Radar, Heatmap, Linien).
- **Rennansicht:** 2D-Canvas oder PixiJS für flüssige Darstellung.
- **Assets:** statische Higgsfield-Exporte als WebP plus Manifest.
- **Speichern:** mehrere Spielstände, Export/Import als Datei.
- **Veröffentlichung:** als statische Seite (z. B. GitHub Pages) oder als Claude-Artefakt; Higgsfield bietet zudem eine Veröffentlichung für spielbare Browser-Games an, die man prüfen kann.

## Roadmap und Entscheidungen

Der Bau beginnt mit dem Leistungsmodell und den Statistiken, weil alles andere darauf aufsetzt; Grafik kommt erst, wenn das Rennen sich richtig anfühlt.

| Phase | Inhalt | Fertig, wenn … |
| --- | --- | --- |
| 1 Prototyp Rennen | Attribute, Simulation, Ergebnisliste, Sectionals, Speed Figure | 1.000 simulierte Rennen plausible Zeiten und Favoritenquoten liefern |
| 2 Stall-Grundspiel | Wochenschleife, Training, Rennkalender, Pferdeprofil mit Statistik, Speichern | eine Saison mit 6 Pferden spielbar ist |
| 3 Wirtschaft und Personal | Finanzen, Trainer, Jockeys, Pfleger, Tierarzt, Auktionen, Transfermarkt | Geld und Personal echte Entscheidungen erzwingen |
| 4 Zucht und Generationen | Genetik, Deckplan, Fohlen, Abstammungs-Statistik, KI-Ställe züchten mit | 10 Saisons ohne Abstürze und mit stabiler Pferdepopulation durchlaufen |
| 5 Grafik und Feinschliff | Higgsfield-Assets, Rennansicht, Videos, Onboarding | ein Außenstehender ohne Erklärung spielen kann |
| Erweiterungen | Hindernisrennen, internationale Rennen, Erfolge, Mehrspieler-Liga | – |

**Entscheidungen (Stand 17.11.2026)**

| Frage | Entscheidung |
| --- | --- |
| Spielwelt | Reale Rennbahnen und Rennen; zum Start reale Rennställe, Pferde und Jockeys. Neu geborene Pferde und neues Personal erhalten zufällig generierte Namen. Alle Weltdaten liegen in einer editierbaren Weltdatei (JSON), getrennt vom Code. |
| Rennkultur | Britisch: Flat-Saison, Klassiker, Gruppe 1–3, Listed, Handicaps mit Official Rating |
| Spielmodus | Einzelspieler, kein Server |
| Arbeitstitel | „Silks & Stamina“ |
| Higgsfield-Budget | höchstens 350 Credits, weniger ist besser |

Rechtlicher Merkposten für eine spätere Veröffentlichung: Rennnamen ohne Sponsorenzusätze führen; echte Personennamen und registrierte Rennfarben erst vor Veröffentlichung prüfen. Die getrennte Weltdatei erlaubt dann den Austausch gegen fiktive Daten ohne Codeänderung.

**Noch offen**

- [ ] Zufallsanteil der Rennen: Empfehlung ist ein mittlerer Wert als Standard und ein Regler im Spielstart-Dialog („berechenbar“ bis „wie im echten Leben“).

## Prompt für Claude Code

Der Prompt startet das Projekt mit Phase 1 und 2 der Roadmap und legt die Architektur für alles Weitere fest. Vorher dieses Dokument als Markdown exportieren und im neuen Projektordner unter `docs/konzept.md` ablegen; der Prompt verweist darauf.

```text
Du baust "Silks & Stamina", ein Rennstall-Managerspiel (Galopp, britische Rennkultur) als reine Browser-Anwendung für einen Einzelspieler. Das vollständige Spielkonzept steht in docs/konzept.md. Lies es zuerst ganz; bei Widersprüchen gilt das Konzept, und Du fragst nach, statt zu raten.

TECHNIK
- Vite + React + TypeScript (strict), kein Backend. Tests mit Vitest.
- Spiellogik als reiner TypeScript-Kern unter src/engine/ ohne React- oder DOM-Abhängigkeit. Er läuft in einem Web Worker; die UI kommuniziert nur über typisierte Nachrichten (Befehle hin, Ergebnisse zurück).
- Persistenz in IndexedDB über Dexie; mehrere Spielstände; Export/Import als JSON-Datei.
- Diagramme mit ECharts; Rennansicht mit Canvas 2D.
- Determinismus: Ein seedbarer Zufallsgenerator (z. B. mulberry32) im Kern; Math.random ist im Engine-Code verboten. Gleicher Seed + gleiche Eingaben = gleiches Ergebnis.
- Oberfläche und Texte auf Deutsch; Fachbegriffe des britischen Rennsports (Official Rating, Handicap, Group 1, Listed, Maiden, Sectional Times) bleiben englisch.

WELTDATEN
- Alle Weltdaten liegen getrennt vom Code in data/world/*.json mit JSON-Schema-Validierung beim Laden: Rennbahnen (Name, Länge, Richtung links/rechts, Kurvencharakter, Gefälle, Bodenarten), Rennkalender (Rennen, Klasse, Distanz, Alter, Geschlecht, Preisgeld, Woche), Rennställe, Pferde, Jockeys, Trainer.
- Start mit realen britischen Rennbahnen und Rennen (Rennnamen ohne Sponsorenzusätze). Für reale Ställe, Pferde und Jockeys legst Du nur das Schema und einen kleinen, klar als Platzhalter markierten Beispieldatensatz an; die echten Daten trage ich selbst ein. Erfinde keine Fakten über reale Personen.
- Neu geborene Pferde und neues Personal erhalten generierte Namen aus einem Namensgenerator (britisch klingende Pferdenamen nach den Regeln der Weatherbys-Namensvergabe: max. 18 Zeichen inkl. Leerzeichen, keine Duplikate).

UMFANG DIESER RUNDE (Phase 1 und 2 des Konzepts)
1. Pferdemodell: verborgenes Potenzial und aktuelle Werte für Grundschnelligkeit, Beschleunigung, Ausdauer, Speedreserve, Kampfgeist, Wendigkeit, Temperament, Konstanz; Präferenzen (Distanzoptimum, Boden, Bahnrichtung, Laufstil); Reifekurve; Fitness, Frische, Verletzungsrisiko.
2. Rennsimulation in 0,1-s-Schritten mit Position, Bahnspur, Tempo und Energievorrat je Pferd, Taktik (Laufposition, Angriffszeitpunkt), Verkehr/Einschließen und begrenztem Zufall. Ein Parameter randomness (0 = berechenbar bis 1 = sehr zufällig, Standard 0,4) skaliert Tagesform und Rennzwischenfälle.
3. Statistik: pro Start Endzeit, Platz, Abstand in Längen, Gewicht, Box, Boden, Jockey; Sectionals je 200 m (Zeit, Position, Abstand zum Führenden); Geschwindigkeitskurve. Daraus Speed Figure (bereinigt um Boden, Distanz, Gewicht), Official Rating nach 3 Starts, Finishing Speed %, Konstanz-Index, Strike Rate, Leistung nach Bedingung. Kennzahlen werden beim Rennabschluss berechnet und gespeichert.
4. Wochenschleife mit 52 Wochen, Alterung zum 1. Januar, Rennkalender mit Nennfristen und Gebühren, einfache Trainingsbausteine aus dem Konzept.
5. KI-Ställe (zunächst 20), die Pferde nennen und trainieren, damit Felder voll sind.
6. Screens: Büro, Stall-Liste, Pferdeprofil (Karriere-Tabelle, Formkurve, Radar der geschätzten Werte mit Unsicherheitsband, Distanz-x-Boden-Heatmap), Rennkalender, Renntag (Startliste, Taktik, Rennansicht in Draufsicht, Ergebnis, Sectional-Chart). Jede Kennzahl verlinkt auf das Rennen, aus dem sie stammt.

NICHT in dieser Runde: Zucht und Genetik, Auktionen, Personalverwaltung, Finanzen im Detail, Higgsfield-Grafiken. Plane die Datenmodelle aber so, dass diese Teile ohne Umbau dazukommen (z. B. Pferde haben bereits Felder für Abstammung und Genotyp).

GRAFIK
- Noch keine generierten Bilder. Lege assets/manifest.json und assets/prompts.json an: Das Manifest ordnet später Fellfarbe, Pose und Altersstufe einer Datei zu; die Prompt-Liste enthält für jedes geplante Bild (siehe Asset-Tabelle im Konzept, ca. 75 Bilder) einen englischen Prompt im festgelegten Stil (klassisches englisches Pferdeporträt, Öl auf Leinwand; Rennbahnen als Vintage-Rennplakat der 1930er). Bis Bilder da sind, zeigt die UI neutrale SVG-Platzhalter.
- Rennfarben (Silks) werden als Graustufen-Maske im Browser eingefärbt; baue dafür jetzt schon die Einfärbe-Funktion mit einem SVG-Platzhalter-Jockey.

QUALITÄT
- Schreibe Tests für Simulation und Statistik. Pflichttest: 1.000 simulierte Rennen über 1.200 m und 2.400 m liefern plausible Siegerzeiten (britische Rasenbahn, guter Boden: ca. 1:11–1:14 bzw. 2:28–2:36) und der Favorit nach Speed Figure gewinnt bei randomness 0,4 in etwa 25–40 % der Rennen. Gib die Verteilung als Tabelle aus.
- Ein Skript npm run simulate:season simuliert eine komplette Saison ohne UI und gibt Kennzahlen aus (Rennen, Durchschnittsfeldgröße, Laufzeit).
- Die Woche muss auf einem normalen Laptop in unter 2 Sekunden simuliert sein.

ARBEITSWEISE
- Beginne mit einem kurzen Plan (Ordnerstruktur, Datenmodelle, Nachrichten zwischen UI und Worker) und warte auf meine Freigabe.
- Danach in kleinen, lauffähigen Schritten mit Git-Commits; zuerst Engine und Tests, dann UI.
- Halte docs/entscheidungen.md aktuell mit allen Annahmen, die Du treffen musstest.
```

Die Zielzeiten im Pflichttest sind grobe Richtwerte für guten Boden und sollen nur grobe Fehler im Modell abfangen; Claude Code kann sie bei Bedarf feiner kalibrieren.
