import { getAvailablePairs, isTrayClear, moveTileToTray, type TileState } from './GameRules.js';

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
  const state = initial.map((tile) => ({
    ...tile,
    faceDown: false,
    originallyFaceDown: false,
  }));
  let tray: TileState[] = [];
  let foundForcedMoment = false;

  for (const tileId of tileOrder) {
    if (tray.length > 0 && state.some((tile) => !tile.removed) && getAvailablePairs(state).length === 0) {
      foundForcedMoment = true;
    }

    const tile = state.find((candidate) => candidate.id === tileId);
    if (!tile) return false;
    const nextTray = moveTileToTray(tile, state, tray, capacity);
    if (!nextTray) return false;
    tray = nextTray;
  }

  return foundForcedMoment && isTrayClear(state, tray);
}
