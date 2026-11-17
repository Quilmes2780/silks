# Silks & Stamina

Ein Rennstall-Manager für den Browser: Galopp nach britischem Vorbild, ein Spieler, kein Server.
Das Spielkonzept steht in [docs/konzept.md](docs/konzept.md), alle getroffenen Annahmen in [docs/entscheidungen.md](docs/entscheidungen.md).

**Spielen:** https://quilmes2780.github.io/silks/ (nach dem ersten erfolgreichen Pages-Deployment)

## Stand: Phase 1 und 2

- **Rennsimulation** in 0,1-s-Schritten: Position, Bahnspur, Tempo und Energievorrat je Pferd, Taktik, Verkehr, begrenzter Zufall (`randomness` 0–1, Standard 0,4). Deterministisch: gleicher Seed und gleiche Eingaben ergeben dasselbe Rennen, Replays sind Neusimulationen.
- **Pferdemodell**: verborgenes Potenzial und aktuelle Werte (8 Attribute), Präferenzen, Reifekurve, Fitness, Frische, Verletzungsrisiko je Bein.
- **Statistik**: Sectionals je 200 m, Geschwindigkeitskurve, Speed Figure, Official Rating nach 3 Starts, Finishing Speed %, Konstanz-Index, Strike Rate, Leistung nach Bedingung. Jede Kennzahl verlinkt auf das Rennen, aus dem sie stammt.
- **Wochenschleife** mit 52 Wochen, Alterung zum 1. Januar, Rennkalender mit realen Feature-Rennen, Nennfristen und Gebühren, Trainingsbausteine.
- **20 KI-Ställe**, die Pferde nennen und trainieren.
- **Screens**: Büro, Stall, Pferdeprofil, Rennkalender, Renntag mit Rennansicht (Canvas), Ergebnis, Sectional-Chart.
- **Spielstände** in IndexedDB (mehrere), Export/Import als JSON.

## Entwicklung

```bash
npm install
npm run dev              # Entwicklungsserver
npm test                 # Tests inkl. Pflichttest (1.000 Rennen je 1.200 m und 2.400 m)
npm run simulate:season  # komplette Saison ohne UI, gibt Kennzahlen aus
npm run calibrate        # Kalibrierungstabelle der Rennsimulation
npm run build            # Produktions-Build nach dist/
npm run assets:lists     # assets/manifest.json und assets/prompts.json neu erzeugen
```

## Aufbau

```
data/world/      Weltdaten (Bahnen, Rennen, Ställe, Pferde, Jockeys, Trainer) – editierbar
data/schema/     JSON-Schemas, gegen die beim Laden validiert wird
assets/          Manifest und Prompt-Liste für die Higgsfield-Grafiken
src/engine/      reiner TypeScript-Kern (kein DOM, kein React, kein Math.random)
src/worker/      Web Worker, typisiertes Protokoll, Dexie-Persistenz
src/ui/          React-Oberfläche
scripts/         simulate-season, calibrate, asset-lists
```

## Weltdaten

Reale Rennbahnen und Rennen sind angelegt; ihre Geometrie und Preisgelder sind Näherungswerte.
Für reale Ställe, Pferde, Jockeys und Trainer gibt es nur das Schema und klar markierte Platzhalter (`"placeholder": true`).
Fehlende KI-Ställe und Pferde werden beim Spielstart generiert.
