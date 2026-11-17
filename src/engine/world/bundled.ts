import tracks from '../../../data/world/tracks.json';
import races from '../../../data/world/races.json';
import stables from '../../../data/world/stables.json';
import trainers from '../../../data/world/trainers.json';
import jockeys from '../../../data/world/jockeys.json';
import horses from '../../../data/world/horses.json';
import { loadWorld, type WorldData } from './load';

/** Die mit dem Spiel ausgelieferten Weltdaten (validiert). */
export function bundledWorld(): WorldData {
  return loadWorld({ tracks, races, stables, trainers, jockeys, horses });
}
