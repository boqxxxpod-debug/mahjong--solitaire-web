import { findSolvableRemovalOrder, generateSolvableTypes, RandomSource, TilePosition } from './GameRules.js';
import { MAHJONG_FACES } from './TileCatalog.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface TileLayout extends TilePosition { face: string; }
export interface DifficultyConfig {
  label: string;
  positions: readonly TilePosition[];
  hints: number | null;
  shuffles: number | null;
  trayCapacity: number;
  trayChallenge: boolean;
}

const rectangle = (columns: number, rows: number, z: number): TilePosition[] =>
  Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) => ({
      x: columnIndex * 2 - (columns - 1),
      y: rowIndex * 2 - (rows - 1),
      z,
    }))).flat();

// Five columns is the deliberate smartphone width budget. Building upward,
// rather than extending the table sideways, lets an individual tile occupy
// roughly twice as many screen pixels as the previous 10–12-column boards.
export const EASY_POSITIONS: readonly TilePosition[] = [
  ...rectangle(5, 4, 0),
  ...rectangle(4, 3, 1),
  ...rectangle(2, 2, 2),
];

export const NORMAL_POSITIONS: readonly TilePosition[] = [
  ...rectangle(5, 4, 0),
  ...rectangle(4, 3, 1),
  ...rectangle(4, 2, 2),
  ...rectangle(2, 2, 3),
];

/** A narrow five-storey tower: difficulty comes from depth, not tiny tiles. */
export const HARD_POSITIONS: readonly TilePosition[] = [
  ...rectangle(4, 4, 0),
  ...rectangle(4, 4, 1),
  ...rectangle(4, 4, 2),
  ...rectangle(3, 2, 3),
  ...rectangle(3, 2, 4),
];

export const TILE_FACES = MAHJONG_FACES;

/**
 * The guaranteed Hard deal. The recorded removal pairs are a complete legal
 * solution for this five-layer geometry.
 */
const HARD_REMOVAL_ORDER = findSolvableRemovalOrder(HARD_POSITIONS, () => 0.5);
export const HARD_FALLBACK_LAYOUT: readonly TileLayout[] = (() => {
  const removalPairs = HARD_REMOVAL_ORDER;
  const faces = Array<string>(HARD_POSITIONS.length);
  removalPairs.forEach(([first, second], index) => {
    faces[first] = faces[second] = TILE_FACES[index % TILE_FACES.length];
  });
  return HARD_POSITIONS.map((position, index) => ({ ...position, face: faces[index] }));
})();

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { label: 'EASY', positions: EASY_POSITIONS, hints: null, shuffles: null, trayCapacity: 5, trayChallenge: false },
  normal: { label: 'NORMAL', positions: NORMAL_POSITIONS, hints: 3, shuffles: 2, trayCapacity: 4, trayChallenge: true },
  hard: { label: 'HARD', positions: HARD_POSITIONS, hints: 1, shuffles: 0, trayCapacity: 3, trayChallenge: true },
};

function hasUniqueValidPositions(positions: readonly TilePosition[]): boolean {
  const keys = new Set<string>();
  return positions.every(({ x, y, z }) => {
    const key = `${x},${y},${z}`;
    if (![x, y, z].every(Number.isFinite) || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function pairFaces(pairCount: number): string[] {
  return Array.from({ length: pairCount }, (_, index) => TILE_FACES[index % TILE_FACES.length]);
}

/**
 * Assigns faces across several consecutive legal removal pairs instead of
 * putting the same face on each pair. Following the recorded removal order
 * therefore fills the tray before later tiles release those stored faces.
 *
 * Capacity 4 blocks: AB / CD / AC / BD
 * Capacity 3 blocks: AB / CA / BC
 */
export function createTrayChallengeTypes(
  removalPairs: readonly (readonly [number, number])[],
  capacity: number,
  random: RandomSource = Math.random,
): string[] {
  if (capacity < 2) throw new Error('Tray challenge requires at least two slots');
  const values = shuffledFaces(removalPairs.length, random);
  const result = Array<string>(removalPairs.length * 2);

  const assign = (pairIndex: number, firstFace: string, secondFace: string): void => {
    const [firstId, secondId] = removalPairs[pairIndex];
    result[firstId] = firstFace; result[secondId] = secondFace;
  };

  let index = 0;
  while (index < removalPairs.length) {
    const remaining = removalPairs.length - index;
    if (capacity >= 4 && remaining >= 4) {
      const [a, b, c, d] = values.slice(index, index + 4);
      assign(index, a, b); assign(index + 1, c, d);
      assign(index + 2, a, c); assign(index + 3, b, d);
      index += 4; continue;
    }
    if (remaining >= 3) {
      const [a, b, c] = values.slice(index, index + 3);
      assign(index, a, b); assign(index + 1, c, a); assign(index + 2, b, c);
      index += 3; continue;
    }
    if (remaining === 2) {
      const [a, b] = values.slice(index, index + 2);
      assign(index, a, b); assign(index + 1, a, b);
      index += 2; continue;
    }
    const [firstId, secondId] = removalPairs[index];
    result[firstId] = result[secondId] = values[index];
    index++;
  }

  if (result.some((face) => !face)) throw new Error('Tray challenge did not assign every tile');
  return result;
}

export function createSolvableLayout(difficulty: Difficulty = 'normal', random: RandomSource = Math.random): TileLayout[] {
  const positions = DIFFICULTIES[difficulty].positions;
  if (!positions.length || positions.length % 2 || !hasUniqueValidPositions(positions)) {
    throw new Error(`${difficulty} board has invalid or duplicate positions`);
  }

  // Hard is deliberately built from a fixed, known-playable tower.
  // Avoid running the generic backtracking solver on its much larger search
  // space; even a hostile/broken random source still returns the safe layout.
  if (difficulty === 'hard') {
    try {
      const offset = Math.floor(random() * TILE_FACES.length);
      if (!Number.isFinite(offset)) throw new Error('Invalid random value');
      return HARD_FALLBACK_LAYOUT.map((tile) => ({
        ...tile,
        face: TILE_FACES[(TILE_FACES.indexOf(tile.face as typeof TILE_FACES[number]) + offset) % TILE_FACES.length],
      }));
    } catch {
      return HARD_FALLBACK_LAYOUT.map((tile) => ({ ...tile }));
    }
  }

  // A deal failure must never turn into an empty board. Try the seeded stream
  // first, then use a known-safe deterministic deal as the final fallback.
  let faces: string[] | undefined;
  try {
    faces = generateSolvableTypes(positions, pairFaces(positions.length / 2), random);
  } catch {
    faces = generateSolvableTypes(positions, pairFaces(positions.length / 2), () => 0.5);
  }
  if (faces.length !== positions.length || faces.some((face) => !face)) {
    throw new Error(`${difficulty} deal did not assign every board position`);
  }
  return positions.map((position, index) => ({ ...position, face: faces[index] }));
}

export interface SolvableDeal { layout: TileLayout[]; faceDown: boolean[]; solution: Array<readonly [number, number]>; }
export interface TrayChallengeDeal { layout: TileLayout[]; faceDown: boolean[]; solution: Array<readonly [number, number]>; }

/** Builds hidden flags from the deal's solution certificate (never both ends
 * of a removal pair), preserving a complete route under the one-reveal rule. */
export function createSolvableDeal(difficulty: Difficulty = 'normal', random: RandomSource = Math.random): SolvableDeal {
  const positions = DIFFICULTIES[difficulty].positions;
  const order = difficulty === 'hard' ? HARD_REMOVAL_ORDER : findSolvableRemovalOrder(positions, random);
  const faces = Array<string>(positions.length);
  shuffledFaces(positions.length / 2, random).forEach((face, index) => {
    const [first, second] = order[index]; faces[first] = faces[second] = face;
  });
  const target = Math.round(positions.length * (difficulty === 'easy' ? 0 : difficulty === 'normal' ? 0.125 : 0.225));
  const candidates = order.map((pair) => pair[random() < 0.5 ? 0 : 1]);
  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1)); [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  const hidden = new Set(candidates.slice(0, target));
  return {
    layout: positions.map((position, index) => ({ ...position, face: faces[index] })),
    faceDown: positions.map((_, index) => hidden.has(index)),
    solution: order.map((pair) => [...pair] as const),
  };
}

/** A tray-only deal: higher difficulties deliberately separate matching faces
 * so the certified removal order requires temporary storage before matching. */
export function createTrayChallengeDeal(difficulty: Difficulty = 'normal', random: RandomSource = Math.random): TrayChallengeDeal {
  if (!DIFFICULTIES[difficulty].trayChallenge) return createSolvableDeal(difficulty, random);
  const positions = DIFFICULTIES[difficulty].positions;
  const order = difficulty === 'hard' ? HARD_REMOVAL_ORDER : findSolvableRemovalOrder(positions, random);
  const faces = createTrayChallengeTypes(order, DIFFICULTIES[difficulty].trayCapacity, random);
  const target = Math.round(positions.length * (difficulty === 'normal' ? 0.125 : 0.225));
  const candidates = order.map((pair) => pair[random() < 0.5 ? 0 : 1]);
  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1)); [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  const hidden = new Set(candidates.slice(0, target));
  return {
    layout: positions.map((position, index) => ({ ...position, face: faces[index] })),
    faceDown: positions.map((_, index) => hidden.has(index)),
    solution: order.map((pair) => [...pair] as const),
  };
}

function shuffledFaces(pairCount: number, random: RandomSource): string[] {
  const values = pairFaces(pairCount);
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1)); [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

// Backwards-compatible names used by existing consumers.
export const COMPACT_POSITIONS = NORMAL_POSITIONS;
export const TILE_PAIR_FACES: readonly string[] = pairFaces(NORMAL_POSITIONS.length / 2);
export const COMPACT_LAYOUT: readonly TileLayout[] = createSolvableLayout('normal', () => 0.5);
