import { generateSolvableTypes, RandomSource, TilePosition } from './GameRules.js';

export interface TileLayout extends TilePosition { face: string; }
const row = (y: number, z: number, count: number): TilePosition[] =>
  Array.from({ length: count }, (_, index) => ({ x: index * 2 - (count - 1), y, z }));

export const COMPACT_POSITIONS: readonly TilePosition[] = [
  // A 48-tile foundation, inset middle terrace, crown, and top pair. Odd/even
  // offsets make upper tiles visibly bridge (and therefore block) lower tiles.
  ...row(-5, 0, 8), ...row(-3, 0, 8), ...row(-1, 0, 8),
  ...row(1, 0, 8), ...row(3, 0, 8), ...row(5, 0, 8),
  ...row(-2, 1, 6), ...row(0, 1, 6), ...row(2, 1, 6),
  ...row(0, 2, 4),
  ...row(0, 3, 2),
];
export const TILE_FACES = ['east', 'south', 'west', 'north', 'plum', 'orchid', 'bamboo', 'circle', 'character', 'green', 'white', 'one', 'two', 'three', 'four', 'red', 'dragon', 'season'] as const;
export const TILE_PAIR_FACES: readonly string[] = TILE_FACES.flatMap((face) => [face, face]);
export function createSolvableLayout(random: RandomSource = Math.random): TileLayout[] {
  const faces = generateSolvableTypes(COMPACT_POSITIONS, TILE_PAIR_FACES, random);
  return COMPACT_POSITIONS.map((position, index) => ({ ...position, face: faces[index] }));
}
// Stable fixture kept for rules tests and consumers that need a deterministic board.
export const COMPACT_LAYOUT: readonly TileLayout[] = createSolvableLayout(() => 0.5);
