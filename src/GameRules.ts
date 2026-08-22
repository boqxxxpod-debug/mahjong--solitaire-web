export interface TileState {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  removed: boolean;
  faceDown?: boolean;
  originallyFaceDown?: boolean;
}

export interface TilePosition { x: number; y: number; z: number; }
export type RandomSource = () => number;
export type AvailableAction<T = TileState> =
  | { kind: 'pair'; tiles: readonly [T, T] }
  | { kind: 'reveal'; tile: T };

export type SearchStatus = 'CLEAR' | 'SOLVABLE' | 'UNSOLVABLE' | 'UNKNOWN';
export type SearchAction =
  | { kind: 'pair'; tileIds: readonly [number, number] }
  | { kind: 'reveal'; tileId: number };
export interface SearchResult {
  status: SearchStatus;
  solvable: boolean;
  canRemovePair: boolean;
  visitedStates: number;
  cycleStates: number;
  maxDepth: number;
  removalPairs: number;
  revealMoves: number;
  /** Cycle-free witness from this exact state to CLEAR. Empty unless proved. */
  actions: SearchAction[];
  stateHash: string;
}

export interface CertifiedShuffleResult {
  status: 'SOLVABLE' | 'FAILED';
  tiles?: TileState[];
  attempts: number;
  rejectedUnsolvable: number;
  rejectedUnknown: number;
}

export function isFreeTile(tile: TileState, tiles: readonly TileState[]): boolean {
  if (tile.removed) return false;
  const active = tiles.filter((other) => !other.removed && other.id !== tile.id);
  if (!isTileUncovered(tile, tiles)) return false;

  const neighbours = active.filter((other) => other.z === tile.z && Math.abs(other.y - tile.y) < 2);
  const leftBlocked = neighbours.some((other) => other.x === tile.x - 2);
  const rightBlocked = neighbours.some((other) => other.x === tile.x + 2);
  return !leftBlocked || !rightBlocked;
}

/** Whether the tile's top is visible because no active tile overlaps it from above. */
export function isTileUncovered(tile: TileState, tiles: readonly TileState[]): boolean {
  if (tile.removed) return false;
  return !tiles.some((other) => !other.removed && other.id !== tile.id && other.z > tile.z &&
    Math.abs(other.x - tile.x) < 2 && Math.abs(other.y - tile.y) < 2);
}

export function getAvailablePairs<T extends TileState>(tiles: readonly T[]): Array<readonly [T, T]> {
  const free = tiles.filter((tile) => !tile.faceDown && isFreeTile(tile, tiles));
  const pairs: Array<readonly [T, T]> = [];
  free.forEach((tile, index) => free.slice(index + 1).forEach((other) => {
    if (other.type === tile.type) pairs.push([tile, other]);
  }));
  return pairs;
}

export function hasAvailablePair(tiles: readonly TileState[]): boolean { return getAvailablePairs(tiles).length > 0; }
/**
 * Returns actions which can reach removal under the one-revealed-tile rule.
 * Reveal hints are the first step of a legal path to an actual pair.
 */
export function getAvailableActions<T extends TileState>(tiles: readonly T[]): Array<AvailableAction<T>> {
  const pairs = getAvailablePairs(tiles);
  if (pairs.length) return pairs.map((pair): AvailableAction<T> => ({ kind: 'pair', tiles: pair }));

  const reveal = findRevealLeadingToPair(tiles);
  return reveal ? [{ kind: 'reveal', tile: reveal }] : [];
}

/** Whether the current board can progress to removing a pair. */
export function hasAvailableAction(tiles: readonly TileState[]): boolean {
  return getAvailableActions(tiles).length > 0;
}
export function isClear(tiles: readonly TileState[]): boolean { return tiles.every((tile) => tile.removed); }
export function isStuck(tiles: readonly TileState[]): boolean { return !isClear(tiles) && !hasAvailableAction(tiles); }

/**
 * Exhaustively explores the actual one-revealed-hidden-tile rules.  The
 * canonical key contains the removed set and the currently revealed original
 * hidden tile, so reveal A -> B -> A loops terminate rather than masquerading
 * as progress.
 */
export function analyzeBoard(initial: readonly TileState[], nodeLimit = 1_000_000): SearchResult {
  const tiles = initial.map((tile) => ({ ...tile }));
  const initiallyActive = tiles.filter((tile) => !tile.removed).length;
  const originalHidden = new Set(tiles.filter((tile) => tile.originallyFaceDown ?? tile.faceDown).map((tile) => tile.id));
  let initialRevealed = -1;
  for (const tile of tiles) if (originalHidden.has(tile.id) && tile.faceDown === false) initialRevealed = tile.id;
  const visited = new Set<string>();
  let cycles = 0, maxDepth = 0, bestRemaining = initiallyActive, solutionPairs = 0, solutionReveals = 0, limitReached = false;
  const path: SearchAction[] = []; let solution: SearchAction[] = [];

  const visit = (removed: Set<number>, revealed: number, depth: number, pairs: number, reveals: number): boolean => {
    if (visited.size >= nodeLimit) { limitReached = true; return false; }
    const key = `${[...removed].sort((a, b) => a - b).join(',')}|${revealed}`;
    if (visited.has(key)) { cycles++; return false; }
    visited.add(key); maxDepth = Math.max(maxDepth, depth);
    const state = tiles.map((tile) => ({ ...tile, removed: removed.has(tile.id), faceDown: originalHidden.has(tile.id) && tile.id !== revealed }));
    const remaining = state.length - removed.size;
    bestRemaining = Math.min(bestRemaining, remaining);
    if (!remaining) { solutionPairs = pairs; solutionReveals = reveals; solution = [...path]; return true; }

    for (const [first, second] of getAvailablePairs(state)) {
      const next = new Set(removed); next.add(first.id); next.add(second.id);
      path.push({ kind: 'pair', tileIds: [first.id, second.id] });
      if (visit(next, revealed === first.id || revealed === second.id ? -1 : revealed, depth + 1, pairs + 1, reveals)) return true;
      path.pop();
    }
    // Reveals are legal even when they do not immediately make a pair.
    for (const tile of state) if (tile.faceDown && isFreeTile(tile, state)) {
      path.push({ kind: 'reveal', tileId: tile.id });
      if (visit(removed, tile.id, depth + 1, pairs, reveals + 1)) return true;
      path.pop();
    }
    return false;
  };

  const removed = new Set(tiles.filter((tile) => tile.removed).map((tile) => tile.id));
  const solvable = visit(removed, initialRevealed, 0, 0, 0);
  const canRemovePair = bestRemaining < initiallyActive;
  return {
    status: initiallyActive === 0 ? 'CLEAR' : solvable ? 'SOLVABLE' : limitReached ? 'UNKNOWN' : 'UNSOLVABLE',
    solvable, canRemovePair, visitedStates: visited.size, cycleStates: cycles, maxDepth,
    removalPairs: solutionPairs, revealMoves: solutionReveals,
    actions: solvable ? solution : [], stateHash: boardStateHash(initial),
  };
}

/** Stable identity used to reject solver answers for a board that has changed. */
export function boardStateHash(tiles: readonly TileState[]): string {
  return [...tiles].sort((a, b) => a.id - b.id)
    .map((tile) => `${tile.id}:${tile.type}:${tile.removed ? 1 : 0}:${tile.faceDown ? 1 : 0}`).join('|');
}

/**
 * Explore legal reveals until a removable pair is reached. The normalized
 * state key prevents a sequence which only turns hidden tiles over in turn
 * from being mistaken for progress (or being explored forever).
 */
function findRevealLeadingToPair<T extends TileState>(tiles: readonly T[]): T | null {
  const pending: Array<{ state: TileState[]; firstRevealId: number }> = [];
  for (const tile of tiles) {
    if (tile.faceDown && isFreeTile(tile, tiles)) {
      pending.push({ state: revealTile(tile.id, tiles), firstRevealId: tile.id });
    }
  }
  const visited = new Set<string>();

  while (pending.length) {
    const { state, firstRevealId } = pending.shift()!;
    const key = normalizeBoardState(state);
    if (visited.has(key)) continue;
    visited.add(key);
    if (hasAvailablePair(state)) return tiles.find((tile) => tile.id === firstRevealId) ?? null;

    for (const tile of state) {
      if (tile.faceDown && isFreeTile(tile, state)) {
        pending.push({ state: revealTile(tile.id, state), firstRevealId });
      }
    }
  }
  return null;
}

function revealTile(candidateId: number, tiles: readonly TileState[]): TileState[] {
  return tiles.map((tile) => ({
    ...tile,
    // Only one originally hidden tile may remain face-up at a time.
    faceDown: tile.id === candidateId ? false : tile.originallyFaceDown ? true : tile.faceDown,
  }));
}

function normalizeBoardState(tiles: readonly TileState[]): string {
  return [...tiles]
    .sort((first, second) => first.id - second.id)
    .map((tile) => `${tile.id}:${tile.removed ? 1 : 0}:${tile.faceDown ? 1 : 0}:${isFreeTile(tile, tiles) ? 1 : 0}`)
    .join('|');
}

export function removePair(first: TileState, second: TileState, tiles: readonly TileState[]): boolean {
  if (first.faceDown || second.faceDown || first.id === second.id || first.type !== second.type || !isFreeTile(first, tiles) || !isFreeTile(second, tiles)) return false;
  first.removed = true;
  second.removed = true;
  return true;
}

/** Marks visible tiles first, then fills the difficulty-dependent total at random. */
export function createFaceDownFlags(positions: readonly TilePosition[], difficulty: 'easy' | 'normal' | 'hard', random: RandomSource = Math.random): boolean[] {
  const count = positions.length;
  const ratio = difficulty === 'easy' ? 0 : difficulty === 'normal' ? 0.125 : 0.225;
  const faceDownCount = Math.round(count * ratio);
  if (!faceDownCount) return Array(count).fill(false);

  const states: TileState[] = positions.map((position, id) => ({ id, type: '', ...position, removed: false }));
  const requiredVisible = difficulty === 'normal' ? 2 : 4;
  const free = shuffled(states.filter((tile) => isFreeTile(tile, states)), random);
  const uncovered = shuffled(states.filter((tile) => isTileUncovered(tile, states)), random);
  const chosen = new Set<number>();

  // A free hidden tile gives the player an immediately revealable action.
  if (free[0]) chosen.add(free[0].id);
  for (const tile of uncovered) {
    if (chosen.size >= requiredVisible) break;
    chosen.add(tile.id);
  }
  for (const tile of shuffled(states, random)) {
    if (chosen.size >= faceDownCount) break;
    chosen.add(tile.id);
  }
  return Array.from({ length: count }, (_, index) => chosen.has(index));
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
  if (!active.length) return;
  const counts = new Map<string, number>();
  active.forEach((tile) => counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1));
  if ([...counts.values()].some((count) => count % 2)) throw new Error('Remaining faces must form pairs');
  const faces = [...counts].flatMap(([type, count]) => Array<string>(count / 2).fill(type));
  const positions = active.map(({ x, y, z }) => ({ x, y, z }));
  const types = generateSolvableTypes(positions, faces, random);
  active.forEach((tile, index) => { tile.type = types[index]; });
}

/**
 * Builds shuffle candidates away from the live board and returns only a board
 * which the complete rules search has certified. The input is never mutated.
 */
export function createCertifiedShuffle(
  source: readonly TileState[], seed: number, maxAttempts = 24, nodeLimit = 1_000_000,
): CertifiedShuffleResult {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let rejectedUnsolvable = 0, rejectedUnknown = 0;
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const candidate = source.map((tile) => ({ ...tile }));
    shuffleActiveTypes(candidate, random);
    const result = analyzeBoard(candidate, nodeLimit);
    if (result.status === 'SOLVABLE') return { status: 'SOLVABLE', tiles: candidate, attempts, rejectedUnsolvable, rejectedUnknown };
    if (result.status === 'UNKNOWN') rejectedUnknown++; else rejectedUnsolvable++;
  }
  return { status: 'FAILED', attempts: maxAttempts, rejectedUnsolvable, rejectedUnknown };
}
