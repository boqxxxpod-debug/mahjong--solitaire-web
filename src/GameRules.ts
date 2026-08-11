export interface TileState {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  removed: boolean;
}

export interface TilePosition { x: number; y: number; z: number; }
export type RandomSource = () => number;

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

export function getAvailablePairs<T extends TileState>(tiles: readonly T[]): Array<readonly [T, T]> {
  const free = tiles.filter((tile) => isFreeTile(tile, tiles));
  const pairs: Array<readonly [T, T]> = [];
  free.forEach((tile, index) => free.slice(index + 1).forEach((other) => {
    if (other.type === tile.type) pairs.push([tile, other]);
  }));
  return pairs;
}

export function hasAvailablePair(tiles: readonly TileState[]): boolean { return getAvailablePairs(tiles).length > 0; }
export function isClear(tiles: readonly TileState[]): boolean { return tiles.every((tile) => tile.removed); }
export function isStuck(tiles: readonly TileState[]): boolean { return !isClear(tiles) && !hasAvailablePair(tiles); }

export function removePair(first: TileState, second: TileState, tiles: readonly TileState[]): boolean {
  if (first.id === second.id || first.type !== second.type || !isFreeTile(first, tiles) || !isFreeTile(second, tiles)) return false;
  first.removed = true;
  second.removed = true;
  return true;
}

/** Restores the logical deal used by RESTART without changing board coordinates. */
export function resetTiles(tiles: TileState[], initialTypes: readonly string[]): void {
  if (tiles.length !== initialTypes.length) throw new Error('Initial deal does not match the board');
  tiles.forEach((tile, index) => { tile.type = initialTypes[index]; tile.removed = false; });
}

function shuffled<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Finds a legal geometric removal order for a board shape. */
export function findSolvableRemovalOrder(positions: readonly TilePosition[], random: RandomSource = Math.random): Array<readonly [number, number]> {
  if (positions.length % 2) throw new Error('Board requires an even number of tiles');
  const states: TileState[] = positions.map((position, id) => ({ id, type: '', ...position, removed: false }));
  const order: Array<readonly [number, number]> = [];
  const solve = (): boolean => {
    if (order.length === positions.length / 2) return true;
    const free = shuffled(states.filter((tile) => isFreeTile(tile, states)), random);
    const candidates: Array<readonly [TileState, TileState]> = [];
    free.forEach((tile, index) => free.slice(index + 1).forEach((other) => candidates.push([tile, other])));
    for (const [first, second] of shuffled(candidates, random)) {
      first.removed = second.removed = true; order.push([first.id, second.id]);
      if (solve()) return true;
      order.pop(); first.removed = second.removed = false;
    }
    return false;
  };
  if (!solve()) throw new Error('Board geometry has no legal removal sequence');
  return order;
}

/** Finds a legal geometric removal order, then deals identical faces onto each pair. */
export function generateSolvableTypes(positions: readonly TilePosition[], faces: readonly string[], random: RandomSource = Math.random): string[] {
  if (positions.length % 2 || faces.length !== positions.length / 2) throw new Error('A face is required for every tile pair');
  const order = findSolvableRemovalOrder(positions, random);
  const result = Array<string>(positions.length);
  shuffled(faces, random).forEach((face, index) => {
    const [first, second] = order[index]; result[first] = result[second] = face;
  });
  return result;
}

/** Shuffles active faces in place, forcing a playable free pair when possible. */
export function shuffleActiveTypes(tiles: TileState[], random: RandomSource = Math.random): void {
  const active = tiles.filter((tile) => !tile.removed);
  const types = shuffled(active.map((tile) => tile.type), random);
  active.forEach((tile, index) => { tile.type = types[index]; });
  if (active.length < 2 || hasAvailablePair(tiles)) return;
  const free = active.filter((tile) => isFreeTile(tile, tiles));
  const pairedType = types.find((type, index) => types.indexOf(type) !== index);
  if (free.length < 2 || !pairedType) return;
  for (const target of free.slice(0, 2)) {
    if (target.type === pairedType) continue;
    const donor = active.find((tile) => tile !== target && !free.slice(0, 2).includes(tile) && tile.type === pairedType);
    if (!donor) continue;
    [target.type, donor.type] = [donor.type, target.type];
  }
}
