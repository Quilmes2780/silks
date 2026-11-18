/** Fachbegriffe des Spiels – für Tooltips (<Term>) und die Hilfeseite. */

export interface GlossaryEntry {
  term: string;
  short: string;
  long?: string;
  group: 'Rennen' | 'Kennzahlen' | 'Stall' | 'Zucht' | 'Geld';
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  or: {
    term: 'Official Rating (OR)',
    short: 'Offizielle Leistungseinstufung in Pfund (lb). Bestimmt das Gewicht im Handicap.',
    long: 'Nach jedem Start passt der Handicapper das Rating an die gezeigte Leistung an. Ein Pferd mit OR 90 trägt im selben Handicap 10 lb mehr als eines mit OR 80. Ein Rating gibt es nach drei Starts oder einem Sieg.',
    group: 'Kennzahlen',
  },
  sf: {
    term: 'Speed Figure (SF)',
    short: 'Leistung eines Starts in Pfund, bereinigt um Bahn, Distanz, Boden und Gewicht.',
    long: 'Speed Figures machen Starts auf verschiedenen Bahnen vergleichbar. Grob gilt: eine Figure entspricht dem Rating, das die Leistung im Handicap wert ist.',
    group: 'Kennzahlen',
  },
  sectionals: {
    term: 'Sectionals',
    short: 'Zwischenzeiten je Abschnitt (alle 200 m) mit Position und Abstand zum Führenden.',
    long: 'Sectionals zeigen, wie ein Rennen gelaufen ist: zu schnell angegangen, im Finish zugelegt oder eingeklemmt. Die eigenen Starts behalten sie dauerhaft, die der Konkurrenz eine Saison lang.',
    group: 'Kennzahlen',
  },
  finishing: {
    term: 'Finishing Speed %',
    short: 'Tempo der letzten 400 m im Verhältnis zum Durchschnittstempo des ganzen Rennens.',
    long: 'Über 100 % heißt: zum Schluss schneller als im Schnitt. Hohe Werte deuten auf ein langsames Rennen oder einen starken Endspurt.',
    group: 'Kennzahlen',
  },
  consistency: {
    term: 'Konstanz-Index',
    short: '0–100: wie gleichmäßig die letzten Speed Figures ausfallen. Hoch = verlässlich.',
    group: 'Kennzahlen',
  },
  lengths: {
    term: 'Längen (L)',
    short: 'Abstand im Ziel, gemessen in Pferdelängen (rund 2,4 m).',
    group: 'Kennzahlen',
  },
  handicap: {
    term: 'Handicap',
    short: 'Rennen, in dem jedes Pferd nach seinem Official Rating Gewicht trägt – so haben alle eine Chance.',
    group: 'Rennen',
  },
  pattern: {
    term: 'Gruppe 1–3 und Listed',
    short: 'Die Spitzenrennen (Black Type). Gruppe 1 ist die höchste Stufe, darunter Gruppe 2, Gruppe 3 und Listed.',
    long: 'Siege und Platzierungen in diesen Rennen machen Pferde für die Zucht wertvoll.',
    group: 'Rennen',
  },
  maiden: {
    term: 'Maiden und Novice',
    short: 'Rennen für Pferde ohne Sieg (Maiden) bzw. mit höchstens wenigen Siegen (Novice) – der Einstieg für junge Pferde.',
    group: 'Rennen',
  },
  claiming: {
    term: 'Claiming-Rennen',
    short: 'Jedes Pferd im Feld kann nach dem Rennen zum ausgeschriebenen Preis gekauft werden.',
    group: 'Rennen',
  },
  deadline: {
    term: 'Nennschluss',
    short: 'Bis dahin muss ein Pferd genannt sein. Danach stehen die Starter fest (Startbox, Gewicht).',
    group: 'Rennen',
  },
  going: {
    term: 'Boden (Going)',
    short: 'Zustand der Bahn von fest bis schwer; Allwetterbahnen sind „Standard“. Pferde haben Vorlieben.',
    group: 'Rennen',
  },
  randomness: {
    term: 'Zufallsanteil',
    short: 'Wie stark Tagesform und Rennzwischenfälle das Ergebnis beeinflussen. Wird beim Spielstart festgelegt.',
    group: 'Rennen',
  },
  fitness: {
    term: 'Fitness und Frische',
    short: 'Fitness steigt durch Training und Rennen, Frische sinkt dabei. Am besten läuft ein fittes, frisches Pferd.',
    group: 'Stall',
  },
  tactic: {
    term: 'Taktik',
    short: 'Position im Rennen (vorne, Mittelfeld, hinten), Zeitpunkt des Angriffs und Laufweg (innen/außen).',
    group: 'Stall',
  },
  fee: {
    term: 'Decktaxe',
    short: 'Preis für eine Bedeckung durch einen Hengst. Fällig erst, wenn die Stute tragend ist.',
    group: 'Zucht',
  },
  coi: {
    term: 'Inzuchtkoeffizient (COI)',
    short: 'Wahrscheinlichkeit, dass beide Gen-Kopien eines Fohlens vom selben Vorfahren stammen. Hohe Werte kosten Konstanz und Gesundheit.',
    group: 'Zucht',
  },
  nick: {
    term: 'Nick',
    short: 'Zwei Hengstlinien, die zusammen besser (oder schlechter) passen als erwartet. Nur über die Zucht-Statistik zu erkennen.',
    group: 'Zucht',
  },
  prognosis: {
    term: 'Paarungsprognose',
    short: 'Erwartete Qualität des Fohlens mit Spanne. Stimmt im Mittel, der Einzelfall streut stark, weil die Gene verborgen sind.',
    group: 'Zucht',
  },
  share: {
    term: 'Teilhaberschaft',
    short: 'Anteil an einem Pferd: Preisgeld, Decktaxen und Kosten werden anteilig geteilt.',
    group: 'Geld',
  },
  boarding: {
    term: 'Einstellpferd',
    short: 'Pferd eines fremden Besitzers in deinem Stall. Du bekommst eine Wochenpauschale und 10 % des Preisgelds.',
    group: 'Geld',
  },
  overdraft: {
    term: 'Dispolimit',
    short: 'So weit darf das Konto ins Minus. Bleibt es mehrere Wochen darunter, droht die Bank mit Zwangsverkauf.',
    group: 'Geld',
  },
};
