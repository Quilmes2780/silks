import { Rng } from '../rng';
import type { Horse } from '../types';
import { GameError } from '../game/commands';
import { addInbox, formatMoney, type GameState, MARKET_STABLE_ID, touch } from '../game/state';
import { marketValue } from '../economy/value';
import { freeBoxes, roundPrice, scratchFutureEntries, transferHorse } from '../market/transfer';
import { endPartnerships } from '../market/partnership';
import { dropLoci } from './genetics';
import { COVER_LAST_WEEK, mareCounts, pregnancyOf, retireRacehorse } from './cycle';
import { MARE_MAX_AGE, pensionStallion, raceRecordLevel, standStallion, startTraining } from './stud';

/** Befehle des Spielers rund ums Gestüt. */

/** Saison, für die ein Deckplan jetzt gilt (nach der Decksaison: die nächste). */
export function planSeason(g: GameState): number {
  return g.week <= COVER_LAST_WEEK ? g.season : g.season + 1;
}

function ownHorse(g: GameState, horseId: string): Horse {
  const h = g.horses[horseId];
  if (!h || h.stableId !== g.playerStableId) throw new GameError('Das Pferd gehört nicht zu deinem Stall.');
  return h;
}

/** Deckplan: Hengst für eine Stute wählen (null = Plan löschen). */
export function setMating(g: GameState, mareId: string, stallionId: string | null): void {
  const mare = ownHorse(g, mareId);
  if (mare.status !== 'broodmare') throw new GameError(`${mare.name} ist keine Zuchtstute.`);
  if (stallionId === null) {
    delete g.breeding.plans[mareId];
    return;
  }
  const season = planSeason(g);
  if (season - mare.foalYear > MARE_MAX_AGE) throw new GameError(`${mare.name} ist zu alt für die Zucht.`);
  if (pregnancyOf(g, mareId, season)) throw new GameError(`${mare.name} ist in dieser Decksaison bereits tragend.`);
  const s = g.stallions[stallionId];
  if (!s || !s.active) throw new GameError('Dieser Hengst deckt nicht.');
  if (s.since > season) throw new GameError(`${s.name} deckt erst ab ${s.since}.`);
  if (s.covers >= s.bookLimit && season === g.season) throw new GameError(`Das Buch von ${s.name} ist voll.`);
  if (stallionId === mare.sireId) throw new GameError(`${s.name} ist der Vater von ${mare.name}.`);
  g.breeding.plans[mareId] = stallionId;
}

/** Stute aus dem Rennstall ins Gestüt nehmen. */
export function toBroodmare(g: GameState, horseId: string): void {
  const h = ownHorse(g, horseId);
  if (h.status !== 'active' || h.sex !== 'female') throw new GameError('Nur Stuten im Training können in die Zucht gehen.');
  if (h.boarding) throw new GameError('Einstellpferde gehören ihrem Besitzer.');
  if (g.season - h.foalYear < 3) throw new GameError('Stuten gehen frühestens mit drei Jahren in die Zucht.');
  scratchFutureEntries(g, h.id);
  endPartnerships(g, h);
  retireRacehorse(g, h, new Rng(g.seed).fork('to-broodmare', h.id), mareCounts(g), false);
}

/** Hengst als Deckhengst aufstellen (steht auf einer öffentlichen Deckstation, Decktaxen gehen an dich). */
export function standAsStallion(g: GameState, horseId: string): void {
  const h = ownHorse(g, horseId);
  if (h.status !== 'active' || h.sex !== 'male' || h.gelded) throw new GameError('Nur Hengste im Training können aufgestellt werden.');
  if (h.boarding) throw new GameError('Einstellpferde gehören ihrem Besitzer.');
  if (g.season - h.foalYear < 3) throw new GameError('Hengste gehen frühestens mit drei Jahren ins Gestüt.');
  const level = raceRecordLevel(h);
  if (level === null || level < 75) throw new GameError('Ohne Rennleistung (Rating ab 75) nimmt keine Deckstation den Hengst auf.');
  scratchFutureEntries(g, h.id);
  const s = standStallion(g, h, g.playerStableId);
  addInbox(g, {
    kind: 'breeding',
    title: `${h.name} ist Deckhengst`,
    body: `${h.name} steht ab der Decksaison ${s.since} für ${formatMoney(s.fee)} Decktaxe. Fremde Stuten bringen dir Decktaxen ein, eigene Stuten deckt er kostenlos.`,
    horseId: h.id,
  });
}

/** Ins Training holen: Zweijährige aus eigener Zucht, sobald eine Box frei ist. */
export function bringIntoTraining(g: GameState, horseId: string): void {
  const h = ownHorse(g, horseId);
  if (h.status !== 'young' || g.season - h.foalYear < 2) throw new GameError('Erst Zweijährige können ins Training.');
  if (freeBoxes(g) <= 0) throw new GameError('Keine freie Box.');
  startTraining(g, h, new Rng(g.seed).fork('into-training', h.id, g.weekIndex));
}

/** Pferd ganz aus Zucht und Sport nehmen (Gnadenbrot). */
export function retireHorse(g: GameState, horseId: string): void {
  const h = ownHorse(g, horseId);
  if (h.boarding) throw new GameError('Einstellpferde gehören ihrem Besitzer.');
  if (h.status === 'retired') return;
  scratchFutureEntries(g, h.id);
  delete g.breeding.plans[h.id];
  endPartnerships(g, h);
  const s = g.stallions[h.id];
  if (s?.active) pensionStallion(g, s);
  h.status = 'retired';
  h.forSale = null;
  dropLoci(h);
  touch(g, h.id);
}

/** Schnellverkauf von Stute, Nachwuchs oder Hengst an die Züchter (60 % des Marktwerts). */
export function sellToBreeders(g: GameState, horseId: string): number {
  const h = ownHorse(g, horseId);
  if (h.status !== 'young' && h.status !== 'broodmare' && h.status !== 'stud') throw new GameError('Rennpferde werden über den Markt verkauft.');
  const price = roundPrice(marketValue(g, h) * 0.6);
  transferHorse(g, h.id, MARKET_STABLE_ID, price, 'transfer');
  const s = g.stallions[h.id];
  if (s) s.ownerId = MARKET_STABLE_ID;
  return price;
}

