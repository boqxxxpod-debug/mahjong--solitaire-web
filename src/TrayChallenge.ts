import { getAvailablePairs, isFreeTile, isTrayClear, moveTileToTray, type TileState } from './GameRules.js';

export interface TrayDependencyMetrics {
  initialPairCount: number;
  zeroPairStorageMoves: number;
  longestZeroPairStorageRun: number;
  clears: boolean;
}

/**
 * Measures tray dependence along a certified route with every tile face-up.
 * This deliberately ignores hidden information so a board only earns credit
 * for geometry + face assignment that genuinely forces temporary storage.
 */
export function measureTrayDependency(
  initial: readonly TileState[],
  tileOrder: readonly number[],
  capacity: number,
): TrayDependencyMetrics {
  const state = initial.map((tile) => ({
    ...tile,
    faceDown: false,
    originallyFaceDown: false,
  }));
  let tray: TileState[] = [];
  const initialPairCount = getAvailablePairs(state).length;
  let zeroPairStorageMoves = 0;
  let currentZeroPairStorageRun = 0;
  let longestZeroPairStorageRun = 0;

  for (const tileId of tileOrder) {
    const forcedStorage = tray.length > 0 && state.some((tile) => !tile.removed) && getAvailablePairs(state).length === 0;
    if (forcedStorage) {
      zeroPairStorageMoves++;
      currentZeroPairStorageRun++;
      longestZeroPairStorageRun = Math.max(longestZeroPairStorageRun, currentZeroPairStorageRun);
    } else {
      currentZeroPairStorageRun = 0;
    }

    const tile = state.find((candidate) => candidate.id === tileId);
    if (!tile) return { initialPairCount, zeroPairStorageMoves, longestZeroPairStorageRun, clears: false };
    const nextTray = moveTileToTray(tile, state, tray, capacity);
    if (!nextTray) return { initialPairCount, zeroPairStorageMoves, longestZeroPairStorageRun, clears: false };
    tray = nextTray;
  }

  return { initialPairCount, zeroPairStorageMoves, longestZeroPairStorageRun, clears: isTrayClear(state, tray) };
}

/**
 * Strong tray challenge gate: there must be no immediately removable pair at
 * the opening, and a substantial part of the certified route must keep an
 * unmatched tile stored while the board exposes no same-face FREE pair.
 */
export function hasSustainedForcedTrayStorage(
  initial: readonly TileState[],
  tileOrder: readonly number[],
  capacity: number,
  minimumZeroPairStorageMoves: number,
): boolean {
  const metrics = measureTrayDependency(initial, tileOrder, capacity);
  return metrics.clears && metrics.initialPairCount === 0 && metrics.zeroPairStorageMoves >= minimumZeroPairStorageMoves;
}

/**
 * Verifies that a certified tray route contains a genuine storage-only moment:
 * at least one unmatched tile is already held in the tray while the remaining
 * board exposes no same-face pair at all. The check intentionally turns every
 * tile face-up first, so hidden tiles cannot create a false positive by merely
 * concealing an otherwise available pair.
 *
 * Returning true also means the supplied tile order is a complete legal tray
 * clear within the configured capacity.
 */
export function hasForcedTrayStorageMoment(
  initial: readonly TileState[],
  tileOrder: readonly number[],
  capacity: number,
): boolean {
  const metrics = measureTrayDependency(initial, tileOrder, capacity);
  return metrics.clears && metrics.zeroPairStorageMoves > 0;
}

/**
 * Counts full-tray choice points where at least one matching rescue is free,
 * while two or more other free tiles would overflow the tray because neither
 * matches anything already held. These visible alternatives act as decoys:
 * the player must identify the rescue rather than tapping any available tile.
 * Hidden information is removed so the metric measures geometry and face
 * assignment rather than accidental concealment.
 */
export function countFullTrayDistractorMoments(
  initial: readonly TileState[],
  tileOrder: readonly number[],
  capacity: number,
): number {
  const state = initial.map((tile) => ({
    ...tile,
    faceDown: false,
    originallyFaceDown: false,
  }));
  let tray: TileState[] = [];
  let moments = 0;

  for (const tileId of tileOrder) {
    if (tray.length === capacity) {
      const free = state.filter((tile) => !tile.removed && !tile.faceDown && isFreeTile(tile, state));
      const heldTypes = new Set(tray.map((tile) => tile.type));
      const rescues = free.filter((tile) => heldTypes.has(tile.type));
      const distractors = free.filter((tile) => !heldTypes.has(tile.type));
      if (rescues.length > 0 && distractors.length >= 2) moments++;
    }

    const tile = state.find((candidate) => candidate.id === tileId);
    if (!tile) return -1;
    const nextTray = moveTileToTray(tile, state, tray, capacity);
    if (!nextTray) return -1;
    tray = nextTray;
  }

  return isTrayClear(state, tray) ? moments : -1;
}
