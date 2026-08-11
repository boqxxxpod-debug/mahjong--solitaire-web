export interface TileState {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  removed: boolean;
}

export function isFreeTile(tile: TileState, tiles: readonly TileState[]): boolean {
  if (tile.removed) return false;
  const active = tiles.filter((other) => !other.removed && other.id !== tile.id);
  const covered = active.some((other) => other.z > tile.z &&
    Math.abs(other.x - tile.x) < 2 && Math.abs(other.y - tile.y) < 2);
  if (covered) return false;

  const neighbours = active.filter((other) => other.z === tile.z && Math.abs(other.y - tile.y) < 2);
  const leftBlocked = neighbours.some((other) => other.x === tile.x - 2);
  const rightBlocked = neighbours.some((other) => other.x === tile.x + 2);
  return !leftBlocked || !rightBlocked;
}

export function hasAvailablePair(tiles: readonly TileState[]): boolean {
  const free = tiles.filter((tile) => isFreeTile(tile, tiles));
  return free.some((tile, index) => free.slice(index + 1).some((other) => other.type === tile.type));
}
