import { findSolvableRemovalOrder, generateSolvableTypes, RandomSource, TilePosition } from './GameRules.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface TileLayout extends TilePosition { face: string; }
export interface DifficultyConfig {
  label: string;
  positions: readonly TilePosition[];
  hints: number | null;
  shuffles: number | null;
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

export const TILE_FACES = ['east', 'south', 'west', 'north', 'plum', 'orchid', 'bamboo', 'circle', 'character', 'green', 'white', 'one', 'two', 'three', 'four', 'red', 'dragon', 'season'] as const;

/**
 * The guaranteed Hard deal. The recorded removal pairs are a complete legal
 * solution for this five-layer geometry.
 */
export const HARD_FALLBACK_LAYOUT: readonly TileLayout[] = (() => {
  const removalPairs = findSolvableRemovalOrder(HARD_POSITIONS, () => 0.5);
  const faces = Array<string>(HARD_POSITIONS.length);
  removalPairs.forEach(([first, second], index) => {
    faces[first] = faces[second] = TILE_FACES[index % TILE_FACES.length];
  });
  return HARD_POSITIONS.map((position, index) => ({ ...position, face: faces[index] }));
})();

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { label: 'EASY', positions: EASY_POSITIONS, hints: null, shuffles: null },
  normal: { label: 'NORMAL', positions: NORMAL_POSITIONS, hints: 3, shuffles: 2 },
  hard: { label: 'HARD', positions: HARD_POSITIONS, hints: 1, shuffles: 0 },
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

// Backwards-compatible names used by existing consumers.
export const COMPACT_POSITIONS = NORMAL_POSITIONS;
export const TILE_PAIR_FACES: readonly string[] = pairFaces(NORMAL_POSITIONS.length / 2);
export const COMPACT_LAYOUT: readonly TileLayout[] = createSolvableLayout('normal', () => 0.5);
