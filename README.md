# Silks & Stamina

Ein Rennstall-Manager für den Browser: Galopp nach britischem Vorbild, ein Spieler, kein Server.
Das Spielkonzept steht in [docs/konzept.md](docs/konzept.md), alle getroffenen Annahmen in [docs/entscheidungen.md](docs/entscheidungen.md).

**Spielen:** https://quilmes2780.github.io/silks/

## Stand: Phase 1 bis 5

- **Rennsimulation** in 0,1-s-Schritten: Position, Bahnspur, Tempo und Energievorrat je Pferd, Taktik, Verkehr, begrenzter Zufall (`randomness` 0–1, Standard 0,4). Deterministisch: gleicher Seed und gleiche Eingaben ergeben dasselbe Rennen, Replays sind Neusimulationen.
- **Pferdemodell**: verborgenes Potenzial und aktuelle Werte (8 Attribute), Präferenzen, Reifekurve, Fitness, Frische, Verletzungsrisiko je Bein.
- **Statistik**: Sectionals je 200 m, Geschwindigkeitskurve, Speed Figure, Official Rating nach 3 Starts, Finishing Speed %, Konstanz-Index, Strike Rate, Leistung nach Bedingung. Jede Kennzahl verlinkt auf das Rennen, aus dem sie stammt.
- **Wochenschleife** mit 52 Wochen, Alterung zum 1. Januar, Rennkalender mit realen Feature-Rennen, Nennfristen und Gebühren, Trainingsbausteine.
- **20 KI-Ställe**, die Pferde nennen, trainieren, kaufen, verkaufen und claimen.
- **Personal** (Phase 3): Cheftrainer, Assistenztrainer, Stalljockeys, Arbeitsreiter, Pfleger, Tierarzt, Hufschmied, Bloodstock-Agent, Datenanalyst – mit Verträgen, Gehalt, Erfolgsbeteiligung, Moral, Kündigung und Abwerbung, Vertragsrunde im November. Nachwuchsjockeys mit Gewichtserlaubnis, Sperren.
- **Wirtschaft** (Phase 3): Unterhalt, Gehälter, Tierarzt, Gebühren; Monats- und Saisonbilanz, Kosten und ROI je Pferd, Dispokredit mit Zinsen und Zwangsverkauf; Anlage mit Boxen, Schwimmbecken, Bergstrecke und Tierklinik.
- **Markt** (Phase 3): Marktwert-Modell mit Verlauf, Transfermarkt mit Verhandlung und KI-Angeboten, Auktionen (Breeze-up, Jährlinge, Horses in Training) mit Gutachten und Auto-Gebot, Claiming-Rennen, generiertes Deckhengst-Register.
- **Zucht** (Phase 4): Genetik mit Gen-Paaren je Merkmal, Fellfarbe nach echten Erbgängen, Inzuchtkoeffizient, Hengstlinien und verborgene Nicks. Deckhengste sind echte Pferde, Decktaxen folgen Rennleistung und Nachkommen. Gestüt mit Plätzen oder Pension, Gestütsleiter, Deckplan mit Hengstsuche und Paarungsprognose, Fohlen und Jährlinge, Zuchtstutenauktion. KI-Ställe und Züchter züchten mit.
- **Teilhaberschaften und Einstellpferde** (Phase 4): Anteile an Hengsten und Rennpferden der KI; fremde Besitzer stellen Pferde gegen Pauschale ein.
- **Grafik und Einstieg** (Phase 5): 67 gemalte Bilder (Higgsfield) – Pferdeporträts nach Fellfarbe, Personal, Rennbahn- und Klassiker-Plakate, Anlage. „Erste Schritte“ im Büro, Hilfe und Glossar mit Tooltips, Rennkommentar und Zielfoto, kompaktere Spielstände und gzip-Export.
- **Screens**: Büro, Stall, Pferdeprofil (mit Stammbaum und Markt & Pflege), Rennkalender, Renntag mit Rennansicht (Canvas), Ergebnis, Sectional-Chart, Gestüt, Zucht-Statistik, Markt (mit Teilhaberschaften und Einstellpferden), Auktionssaal, Personal, Jockeys, Finanzen, Anlage.
- **Spielstände** in IndexedDB (mehrere), Export/Import als JSON; ältere Stände werden automatisch migriert.

## Entwicklung

```bash
npm install
npm run dev              # Entwicklungsserver
npm test                 # Tests inkl. Pflichttest (1.000 Rennen je 1.200 m und 2.400 m)
npm run simulate:season  # komplette Saison ohne UI, gibt Kennzahlen aus
npm run calibrate        # Kalibrierungstabelle der Rennsimulation
npm run calibrate:economy  # mehrere Saisons: KI-Budgets, Auktionspreise, Marktwerte, Autopilot-Stall
npm run simulate:generations  # 10 Saisons mit Zucht: Population, Jahrgangsqualität, Laufzeit, Spielstandgröße
npm run build            # Produktions-Build nach dist/
npm run assets:lists     # assets/manifest.json und assets/prompts.json neu erzeugen
npm run assets:fetch     # generierte Bilder (assets/generated.json) nach public/assets laden
```

## Aufbau

```
data/world/      Weltdaten (Bahnen, Rennen, Ställe, Pferde, Jockeys, Trainer) – editierbar
data/schema/     JSON-Schemas, gegen die beim Laden validiert wird
assets/          Manifest, Prompt-Liste und Herkunft (generated.json) der Higgsfield-Bilder
public/assets/   die Bilder selbst (WebP)
src/engine/      reiner TypeScript-Kern (kein DOM, kein React, kein Math.random); Zucht in src/engine/breeding
src/worker/      Web Worker, typisiertes Protokoll, Dexie-Persistenz
src/ui/          React-Oberfläche
scripts/         simulate-season, calibrate, asset-lists
```

## Weltdaten

Reale Rennbahnen und Rennen sind angelegt; ihre Geometrie und Preisgelder sind Näherungswerte.
Für reale Ställe, Pferde, Jockeys und Trainer gibt es nur das Schema und klar markierte Platzhalter (`"placeholder": true`).
Fehlende KI-Ställe und Pferde werden beim Spielstart generiert.
