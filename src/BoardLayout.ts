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

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { label: 'EASY', positions: EASY_POSITIONS, hints: null, shuffles: null },
  normal: { label: 'NORMAL', positions: NORMAL_POSITIONS, hints: 3, shuffles: 2 },
  hard: { label: 'HARD', positions: HARD_POSITIONS, hints: 1, shuffles: 0 },
};

export const TILE_FACES = ['east', 'south', 'west', 'north', 'plum', 'orchid', 'bamboo', 'circle', 'character', 'green', 'white', 'one', 'two', 'three', 'four', 'red', 'dragon', 'season'] as const;

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
