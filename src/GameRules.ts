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
export type PlayRule = 'pair' | 'tray';
export const TRAY_CAPACITY = 5;
export type RandomSource = () => number;
export type AvailableAction<T = TileState> =
  | { kind: 'pair'; tiles: readonly [T, T] }
  | { kind: 'reveal'; tile: T };

export type SolverAction =
  | { kind: 'pair'; firstId: number; secondId: number }
  | { kind: 'tray'; tileId: number }
  | { kind: 'reveal'; tileId: number };

export type SearchStatus = 'CLEAR' | 'SOLVABLE' | 'UNSOLVABLE' | 'UNKNOWN';
interface SearchResultBase {
  solvable: boolean;
  canRemovePair: boolean;
  visitedStates: number;
  cycleStates: number;
  maxDepth: number;
  removalPairs: number;
  revealMoves: number;
}
export type SearchResult =
  | (SearchResultBase & { status: 'SOLVABLE'; solvable: true; stateHash: string; actions: SolverAction[] })
  | (SearchResultBase & { status: 'CLEAR' | 'UNSOLVABLE' | 'UNKNOWN'; stateHash?: string; actions?: SolverAction[] });

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

export function getAvailableActions<T extends TileState>(tiles: readonly T[]): Array<AvailableAction<T>> {
  const pairs = getAvailablePairs(tiles);
  if (pairs.length) return pairs.map((pair): AvailableAction<T> => ({ kind: 'pair', tiles: pair }));

  const reveal = findRevealLeadingToPair(tiles);
  return reveal ? [{ kind: 'reveal', tile: reveal }] : [];
}

export function hasAvailableAction(tiles: readonly TileState[]): boolean {
  return getAvailableActions(tiles).length > 0;
}
export function isClear(tiles: readonly TileState[]): boolean { return tiles.every((tile) => tile.removed); }
export function isStuck(tiles: readonly TileState[]): boolean { return !isClear(tiles) && !hasAvailableAction(tiles); }

export function boardStateHash(tiles: readonly TileState[]): string {
  return [...tiles]
    .sort((first, second) => first.id - second.id)
    .map((tile) => [
      tile.id,
      tile.type,
      tile.removed ? 1 : 0,
      tile.removed ? '-' : tile.faceDown ? 1 : 0,
      tile.originallyFaceDown ? 1 : 0,
    ].join(':'))
    .join('|');
}

export function trayStateHash(tiles: readonly TileState[], tray: readonly TileState[]): string {
  return `${boardStateHash(tiles)}#${tray.map((tile) => `${tile.id}:${tile.type}`).sort().join(',')}`;
}

/** Applies one atomic tray tap. A full tray still accepts a matching rescue tile. */
export function moveTileToTray(tile: TileState, tiles: readonly TileState[], tray: readonly TileState[]): TileState[] | null {
  if (tile.removed || tile.faceDown || !isFreeTile(tile, tiles)) return null;
  const match = tray.find((candidate) => candidate.type === tile.type);
  if (!match && tray.length >= TRAY_CAPACITY) return null;
  tile.removed = true;
  return match ? tray.filter((candidate) => candidate.id !== match.id) : [...tray, { ...tile, removed: true }];
}

export function getTrayMoves<T extends TileState>(tiles: readonly T[], tray: readonly TileState[]): T[] {
  return tiles.filter((tile) => !tile.faceDown && isFreeTile(tile, tiles) &&
    (tray.length < TRAY_CAPACITY || tray.some((held) => held.type === tile.type)));
}

export function isTrayClear(tiles: readonly TileState[], tray: readonly TileState[]): boolean {
  return isClear(tiles) && tray.length === 0;
}

export function isTrayGameOver(tiles: readonly TileState[], tray: readonly TileState[]): boolean {
  return !isTrayClear(tiles, tray) && tray.length >= TRAY_CAPACITY && getTrayMoves(tiles, tray).length === 0;
}

/** Solver state includes the normalized tray multiset, so equivalent tray order is explored once. */
export function analyzeTrayBoard(initial: readonly TileState[], initialTray: readonly TileState[] = [], nodeLimit = 1_000_000): SearchResult {
  const start = initial.map((tile) => ({ ...tile }));
  const visited = new Set<string>(); const path: SolverAction[] = [];
  let solution: SolverAction[] = [], limitReached = false, maxDepth = 0, bestRemaining = start.filter((tile) => !tile.removed).length;
  const visit = (tiles: TileState[], tray: TileState[], depth: number): boolean => {
    if (visited.size >= nodeLimit) { limitReached = true; return false; }
    const key = trayStateHash(tiles, tray); if (visited.has(key)) return false;
    visited.add(key); maxDepth = Math.max(maxDepth, depth); bestRemaining = Math.min(bestRemaining, tiles.filter((tile) => !tile.removed).length);
    if (isTrayClear(tiles, tray)) { solution = [...path]; return true; }
    // Matching the tray first minimizes capacity and makes HINT prefer safe rescue moves.
    const moves = getTrayMoves(tiles, tray).sort((a, b) => Number(tray.some((held) => held.type === b.type)) - Number(tray.some((held) => held.type === a.type)));
    for (const candidate of moves) {
      const next = tiles.map((tile) => ({ ...tile })); const tile = next.find((item) => item.id === candidate.id)!;
      const nextTray = moveTileToTray(tile, next, tray)!; path.push({ kind: 'tray', tileId: tile.id });
      if (visit(next, nextTray, depth + 1)) return true; path.pop();
    }
    for (const candidate of tiles) if (candidate.faceDown && isFreeTile(candidate, tiles)) {
      path.push({ kind: 'reveal', tileId: candidate.id });
      if (visit(revealTile(candidate.id, tiles), tray, depth + 1)) return true; path.pop();
    }
    return false;
  };
  const solvable = visit(start, initialTray.map((tile) => ({ ...tile })), 0);
  const remaining = start.filter((tile) => !tile.removed).length;
  const status: SearchStatus = isTrayClear(start, initialTray) ? 'CLEAR' : solvable ? 'SOLVABLE' : limitReached ? 'UNKNOWN' : 'UNSOLVABLE';
  const base: SearchResultBase = { solvable, canRemovePair: bestRemaining < remaining, visitedStates: visited.size,
    cycleStates: 0, maxDepth, removalPairs: solution.filter((action) => action.kind === 'tray').length,
    revealMoves: solution.filter((action) => action.kind === 'reveal').length };
  if (status === 'SOLVABLE') return { ...base, status, solvable: true, stateHash: trayStateHash(start, initialTray), actions: solution };
  return { ...base, status, stateHash: trayStateHash(start, initialTray), actions: [] };
}

export function applySolverAction(source: readonly TileState[], action: SolverAction): TileState[] | null {
  const next = source.map((tile) => ({ ...tile }));
  if (action.kind === 'tray') return null;
  if (action.kind === 'pair') {
    const first = next.find((tile) => tile.id === action.firstId);
    const second = next.find((tile) => tile.id === action.secondId);
    if (!first || !second || !removePair(first, second, next)) return null;
    return next;
  }
  const tile = next.find((candidate) => candidate.id === action.tileId);
  if (!tile || !tile.faceDown || !isFreeTile(tile, next)) return null;
  return revealTile(tile.id, next);
}

export function analyzeBoard(
  initial: readonly TileState[], nodeLimit = 1_000_000, avoidStateHashes: readonly string[] = [],
): SearchResult {
  const tiles = initial.map((tile) => ({ ...tile }));
  const initialHash = boardStateHash(tiles);
  const initiallyActive = tiles.filter((tile) => !tile.removed).length;
  const originalHidden = new Set(tiles.filter((tile) => tile.originallyFaceDown ?? tile.faceDown).map((tile) => tile.id));
  let initialRevealed = -1;
  for (const tile of tiles) if (originalHidden.has(tile.id) && tile.faceDown === false) initialRevealed = tile.id;
  const visited = new Set<string>();
  const avoided = new Set(avoidStateHashes);
  const path: SolverAction[] = [];
  let solutionActions: SolverAction[] = [];
  let cycles = 0, maxDepth = 0, bestRemaining = initiallyActive, solutionPairs = 0, solutionReveals = 0, limitReached = false;

  const visit = (removed: Set<number>, revealed: number, depth: number, pairs: number, reveals: number): boolean => {
    if (visited.size >= nodeLimit) { limitReached = true; return false; }
    const key = `${[...removed].sort((a, b) => a - b).join(',')}|${revealed}`;
    if (visited.has(key)) { cycles++; return false; }
    visited.add(key); maxDepth = Math.max(maxDepth, depth);
    const state = tiles.map((tile) => ({ ...tile, removed: removed.has(tile.id), faceDown: originalHidden.has(tile.id) && tile.id !== revealed }));
    if (depth > 0 && avoided.has(boardStateHash(state))) return false;
    const remaining = state.length - removed.size;
    bestRemaining = Math.min(bestRemaining, remaining);
    if (!remaining) {
      solutionPairs = pairs; solutionReveals = reveals; solutionActions = [...path]; return true;
    }

    for (const [first, second] of getAvailablePairs(state)) {
      const next = new Set(removed); next.add(first.id); next.add(second.id);
      path.push({ kind: 'pair', firstId: first.id, secondId: second.id });
      if (visit(next, revealed === first.id || revealed === second.id ? -1 : revealed, depth + 1, pairs + 1, reveals)) return true;
      path.pop();
    }
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
  const status: SearchStatus = initiallyActive === 0 ? 'CLEAR' : solvable ? 'SOLVABLE' : limitReached ? 'UNKNOWN' : 'UNSOLVABLE';
  const base: SearchResultBase = {
    solvable, canRemovePair, visitedStates: visited.size, cycleStates: cycles, maxDepth,
    removalPairs: solutionPairs, revealMoves: solutionReveals,
  };
  if (status === 'SOLVABLE') return { ...base, status, solvable: true, stateHash: initialHash, actions: solutionActions };
  return { ...base, status, stateHash: initialHash, actions: [] };
}

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

export function generateSolvableTypes(positions: readonly TilePosition[], faces: readonly string[], random: RandomSource = Math.random): string[] {
  if (positions.length % 2 || faces.length !== positions.length / 2) throw new Error('A face is required for every tile pair');
  const order = findSolvableRemovalOrder(positions, random);
  const result = Array<string>(positions.length);
  shuffled(faces, random).forEach((face, index) => {
    const [first, second] = order[index]; result[first] = result[second] = face;
  });
  return result;
}

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

export function createCertifiedShuffle(
  source: readonly TileState[], seed: number, maxAttempts = 24, nodeLimit = 1_000_000, playRule: PlayRule = 'pair', tray: readonly TileState[] = [],
): CertifiedShuffleResult {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let rejectedUnsolvable = 0, rejectedUnknown = 0;
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const candidate = source.map((tile) => ({ ...tile }));
    if (playRule === 'pair') shuffleActiveTypes(candidate, random);
    else {
      const active = candidate.filter((tile) => !tile.removed); const types = shuffled(active.map((tile) => tile.type), random);
      active.forEach((tile, index) => { tile.type = types[index]; });
    }
    const result = playRule === 'tray' ? analyzeTrayBoard(candidate, tray, nodeLimit) : analyzeBoard(candidate, nodeLimit);
    if (result.status === 'SOLVABLE') return { status: 'SOLVABLE', tiles: candidate, attempts, rejectedUnsolvable, rejectedUnknown };
    if (result.status === 'UNKNOWN') rejectedUnknown++; else rejectedUnsolvable++;
  }
  return { status: 'FAILED', attempts: maxAttempts, rejectedUnsolvable, rejectedUnknown };
}
