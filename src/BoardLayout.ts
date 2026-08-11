import { generateSolvableTypes, RandomSource, TilePosition } from './GameRules.js';

export interface TileLayout extends TilePosition { face: string; }
const positions = (y: number, z: number, count: number): TilePosition[] =>
  Array.from({ length: count }, (_, index) => ({ x: index * 2 - (count - 1), y, z }));

export const COMPACT_POSITIONS: readonly TilePosition[] = [
  ...positions(-3, 0, 6), ...positions(-1, 0, 6), ...positions(1, 0, 6),
  ...positions(-2, 1, 4), ...positions(0, 1, 4), ...positions(2, 1, 4), ...positions(0, 2, 2),
];
export const TILE_FACES = ['east', 'south', 'west', 'north', 'plum', 'orchid', 'bamboo', 'circle', 'character', 'green', 'white', 'one', 'two', 'three', 'four', 'red'] as const;
export function createSolvableLayout(random: RandomSource = Math.random): TileLayout[] {
  const faces = generateSolvableTypes(COMPACT_POSITIONS, TILE_FACES, random);
  return COMPACT_POSITIONS.map((position, index) => ({ ...position, face: faces[index] }));
}
// Stable fixture kept for rules tests and consumers that need a deterministic board.
export const COMPACT_LAYOUT: readonly TileLayout[] = createSolvableLayout(() => 0.5);
