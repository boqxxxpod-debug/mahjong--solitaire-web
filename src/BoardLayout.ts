import { generateSolvableTypes, RandomSource, TilePosition } from './GameRules.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface TileLayout extends TilePosition { face: string; }
export interface DifficultyConfig {
  label: string;
  positions: readonly TilePosition[];
  hints: number | null;
  shuffles: number | null;
}

const row = (y: number, z: number, count: number): TilePosition[] =>
  Array.from({ length: count }, (_, index) => ({ x: index * 2 - (count - 1), y, z }));

export const EASY_POSITIONS: readonly TilePosition[] = [
  ...row(-2, 0, 12), ...row(0, 0, 10), ...row(2, 0, 10),
  ...row(-1, 1, 7), ...row(1, 1, 7), ...row(0, 2, 2),
];

export const NORMAL_POSITIONS: readonly TilePosition[] = [
  ...row(-3, 0, 10), ...row(-1, 0, 10), ...row(1, 0, 10), ...row(3, 0, 10),
  ...row(-1, 1, 10), ...row(1, 1, 10), ...row(0, 2, 10), ...row(0, 3, 2),
];

export const HARD_POSITIONS: readonly TilePosition[] = [
  ...row(-1, 0, 20), ...row(1, 0, 20),
  ...row(-1, 1, 12), ...row(1, 1, 12), ...row(0, 2, 16), ...row(0, 3, 16),
];

export const TILE_FACES = ['east', 'south', 'west', 'north', 'plum', 'orchid', 'bamboo', 'circle', 'character', 'green', 'white', 'one', 'two', 'three', 'four', 'red', 'dragon', 'season'] as const;

/**
 * The guaranteed Hard deal. The recorded removal pairs are a complete legal
 * solution for this four-layer geometry.
 */
export const HARD_FALLBACK_LAYOUT: readonly TileLayout[] = (() => {
  const removalPairs = [
    [0, 95], [1, 80], [19, 81], [18, 82], [20, 94], [21, 93], [39, 83], [38, 84],
    [64, 92], [2, 91], [22, 85], [65, 90], [3, 89], [23, 86], [66, 88], [40, 79],
    [4, 78], [17, 87], [16, 67], [37, 68], [36, 69], [41, 77], [5, 70], [42, 76],
    [6, 71], [43, 75], [7, 72], [44, 74], [8, 73], [45, 63], [9, 62], [35, 52],
    [24, 61], [34, 53], [25, 60], [33, 54], [26, 59], [32, 55], [27, 58], [31, 56],
    [28, 51], [15, 50], [14, 49], [13, 48], [12, 47], [11, 57], [29, 46], [10, 30],
  ] as const;
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

  // Hard is deliberately built from a fixed, known-playable 96-position shape.
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
