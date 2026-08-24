import { getAvailablePairs, isFreeTile, isTrayClear, moveTileToTray, type TileState } from './GameRules.js';

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
