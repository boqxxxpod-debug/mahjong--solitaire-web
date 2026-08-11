export interface TileLayout { x: number; y: number; z: number; face: string; }

const row = (y: number, z: number, faces: readonly string[]): TileLayout[] =>
  faces.map((face, index) => ({ x: index * 2 - (faces.length - 1), y, z, face }));

// A compact, deliberately solvable layout. Each row can be removed symmetrically
// from its free ends once the layer above it has been cleared.
export const COMPACT_LAYOUT: readonly TileLayout[] = [
  ...row(-3, 0, ['east', 'south', 'west', 'west', 'south', 'east']),
  ...row(-1, 0, ['north', 'plum', 'orchid', 'orchid', 'plum', 'north']),
  ...row(1, 0, ['bamboo', 'circle', 'character', 'character', 'circle', 'bamboo']),
  ...row(-2, 1, ['green', 'white', 'white', 'green']),
  ...row(0, 1, ['one', 'two', 'two', 'one']),
  ...row(2, 1, ['three', 'four', 'four', 'three']),
  ...row(0, 2, ['red', 'red']),
];
