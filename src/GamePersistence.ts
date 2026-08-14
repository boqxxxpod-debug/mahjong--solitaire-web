import type { Difficulty } from './BoardLayout.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, type DioramaStageId } from './DioramaStages.js';
import type { TileState } from './GameRules.js';

export const SAVE_KEY = 'mahjong-solitaire.game.v1';
export const SAVE_SCHEMA_VERSION = 2 as const;

export interface PersistedSnapshot { tiles: TileState[]; moves: number }
interface SavedBase {
  version: typeof SAVE_SCHEMA_VERSION; savedAt: number; tiles: TileState[]; initialTiles: TileState[];
  moves: number; hints: number | null; shuffles: number | null; history: PersistedSnapshot[];
  safe: (PersistedSnapshot & { history: PersistedSnapshot[] }) | null; elapsedMs: number;
}
export interface SavedClassicGame extends SavedBase { mode: 'classic'; difficulty: Difficulty }
export interface SavedTourGame extends SavedBase {
  mode: 'tour'; stageId: DioramaStageId; unlockedStages: DioramaStageId[]; completedStages: DioramaStageId[];
}
export type SavedGame = SavedClassicGame | SavedTourGame;
export type LoadResult = { game: SavedGame | null; discarded: boolean; unavailable: boolean };

const CLASSIC_COUNTS: Record<Difficulty, number> = { easy: 36, normal: 44, hard: 60 };
const CLASSIC_LIMITS: Record<Difficulty, { hints: number | null; shuffles: number | null }> = {
  easy: { hints: null, shuffles: null }, normal: { hints: 3, shuffles: 2 }, hard: { hints: 1, shuffles: 1 },
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validCounter = (value: unknown, maximum: number | null): value is number | null =>
  maximum === null ? value === null : Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;

function validTiles(value: unknown, count: number, initial?: readonly TileState[], positions?: readonly { x: number; y: number; z: number }[]): value is TileState[] {
  if (!Array.isArray(value) || value.length !== count) return false;
  const ids = new Set<number>();
  for (const candidate of value) {
    if (!isRecord(candidate)) return false;
    const id = candidate.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= value.length || ids.has(id) ||
      typeof candidate.type !== 'string' || !candidate.type || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || !Number.isFinite(candidate.z) ||
      typeof candidate.removed !== 'boolean' || typeof candidate.faceDown !== 'boolean' || typeof candidate.originallyFaceDown !== 'boolean') return false;
    if (positions && (candidate.x !== positions[id].x || candidate.y !== positions[id].y || candidate.z !== positions[id].z)) return false;
    ids.add(id);
  }
  if (initial) {
    const source = [...initial].sort((a, b) => a.id - b.id), current = [...value].sort((a, b) => a.id - b.id);
    const types = (tiles: readonly TileState[]) => tiles.map((tile) => tile.type).sort().join('\0');
    if (types(source) !== types(current) || current.some((tile, index) => tile.x !== source[index].x || tile.y !== source[index].y || tile.z !== source[index].z ||
      Boolean(tile.originallyFaceDown) !== Boolean(source[index].originallyFaceDown)) ||
      current.filter((tile) => !tile.removed && tile.originallyFaceDown && !tile.faceDown).length > 1) return false;
  }
  return true;
}

function validSnapshot(value: unknown, count: number, initial: readonly TileState[], positions?: readonly { x: number; y: number; z: number }[]): value is PersistedSnapshot {
  return isRecord(value) && Number.isInteger(value.moves) && (value.moves as number) >= 0 &&
    validTiles(value.tiles, count, initial, positions) && value.tiles.filter((tile) => tile.removed).length === (value.moves as number) * 2;
}

function validProgression(unlocked: unknown, completed: unknown): unlocked is DioramaStageId[] {
  if (!Array.isArray(unlocked) || !Array.isArray(completed) || !unlocked.every((id) => DIORAMA_STAGE_ORDER.includes(id)) ||
    !completed.every((id) => DIORAMA_STAGE_ORDER.includes(id)) || new Set(unlocked).size !== unlocked.length || new Set(completed).size !== completed.length) return false;
  if (!unlocked.includes('gate')) return false;
  for (let index = 0; index < DIORAMA_STAGE_ORDER.length; index++) {
    const id = DIORAMA_STAGE_ORDER[index];
    if (completed.includes(id) && DIORAMA_STAGE_ORDER.slice(0, index).some((previous) => !completed.includes(previous))) return false;
    if (unlocked.includes(id) && index > 0 && !completed.includes(DIORAMA_STAGE_ORDER[index - 1])) return false;
    if (completed.includes(id) && !unlocked.includes(id)) return false;
  }
  return true;
}

export function parseSavedGame(raw: string): SavedGame | null {
  let value: unknown; try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value)) return null;
  // Schema 1 is unambiguous Classic data. Upgrade it in memory without adding closed-page time.
  if (value.version === 1 && ['easy', 'normal', 'hard'].includes(value.difficulty as string)) value = { ...value, version: 2, mode: 'classic' };
  if (!isRecord(value) || value.version !== 2 || (value.mode !== 'classic' && value.mode !== 'tour')) return null;
  let count: number, limits: { hints: number | null; shuffles: number | null }, positions: readonly { x: number; y: number; z: number }[] | undefined;
  if (value.mode === 'classic') {
    if (!['easy', 'normal', 'hard'].includes(value.difficulty as string)) return null;
    const difficulty = value.difficulty as Difficulty; count = CLASSIC_COUNTS[difficulty]; limits = CLASSIC_LIMITS[difficulty];
  } else {
    if (!DIORAMA_STAGE_ORDER.includes(value.stageId as DioramaStageId) || !validProgression(value.unlockedStages, value.completedStages) ||
      !(value.unlockedStages as unknown[]).includes(value.stageId)) return null;
    const stage = DIORAMA_STAGES[value.stageId as DioramaStageId]; count = stage.positions.length; limits = { hints: stage.hints, shuffles: stage.shuffles }; positions = stage.positions;
  }
  if (!validTiles(value.initialTiles, count, undefined, positions)) return null;
  const initial = value.initialTiles;
  if (!validTiles(value.tiles, count, initial, positions) || !Number.isFinite(value.savedAt) || (value.savedAt as number) < 0 ||
    !Number.isInteger(value.moves) || (value.moves as number) < 0 || value.tiles.filter((tile) => tile.removed).length !== (value.moves as number) * 2 ||
    !validCounter(value.hints, limits.hints) || !validCounter(value.shuffles, limits.shuffles) || !Number.isFinite(value.elapsedMs) || (value.elapsedMs as number) < 0 ||
    !Array.isArray(value.history) || !value.history.every((entry) => validSnapshot(entry, count, initial, positions))) return null;
  if (value.safe !== null && (!isRecord(value.safe) || !validSnapshot(value.safe, count, initial, positions) || !Array.isArray(value.safe.history) ||
    !value.safe.history.every((entry) => validSnapshot(entry, count, initial, positions)))) return null;
  return value as unknown as SavedGame;
}

export function loadSavedGame(storage: Storage = localStorage): LoadResult {
  try { const raw = storage.getItem(SAVE_KEY); if (raw === null) return { game: null, discarded: false, unavailable: false };
    const game = parseSavedGame(raw); if (game) return { game, discarded: false, unavailable: false };
    try { storage.removeItem(SAVE_KEY); } catch { /* optional storage */ } return { game: null, discarded: true, unavailable: false };
  } catch { return { game: null, discarded: false, unavailable: true }; }
}
export function saveGame(game: SavedGame, storage: Storage = localStorage): boolean { try { storage.setItem(SAVE_KEY, JSON.stringify(game)); return true; } catch { return false; } }
export function clearSavedGame(storage: Storage = localStorage): boolean { try { storage.removeItem(SAVE_KEY); return true; } catch { return false; } }
