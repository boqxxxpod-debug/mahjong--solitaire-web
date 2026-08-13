import type { Difficulty } from './BoardLayout';
import type { TileState } from './GameRules';

export const SAVE_KEY = 'mahjong-solitaire.game.v1';
export const SAVE_SCHEMA_VERSION = 1 as const;

export interface PersistedSnapshot { tiles: TileState[]; moves: number }
export interface SavedGame {
  version: typeof SAVE_SCHEMA_VERSION;
  savedAt: number;
  difficulty: Difficulty;
  tiles: TileState[];
  initialTiles: TileState[];
  moves: number;
  hints: number | null;
  shuffles: number | null;
  history: PersistedSnapshot[];
  safe: (PersistedSnapshot & { history: PersistedSnapshot[] }) | null;
  elapsedMs: number;
}

export type LoadResult = { game: SavedGame | null; discarded: boolean; unavailable: boolean };
const COUNTS: Record<Difficulty, number> = { easy: 36, normal: 44, hard: 60 };
const LIMITS: Record<Difficulty, { hints: number | null; shuffles: number | null }> = {
  easy: { hints: null, shuffles: null }, normal: { hints: 3, shuffles: 2 }, hard: { hints: 1, shuffles: 1 },
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validCounter = (value: unknown, maximum: number | null): value is number | null =>
  maximum === null ? value === null : Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;

function validTiles(value: unknown, difficulty: Difficulty, initial?: readonly TileState[]): value is TileState[] {
  if (!Array.isArray(value) || value.length !== COUNTS[difficulty]) return false;
  const ids = new Set<number>();
  for (const candidate of value) {
    if (!isRecord(candidate)) return false;
    const id = candidate.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= value.length || ids.has(id) ||
      typeof candidate.type !== 'string' || !candidate.type || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || !Number.isFinite(candidate.z) ||
      typeof candidate.removed !== 'boolean' || typeof candidate.faceDown !== 'boolean' || typeof candidate.originallyFaceDown !== 'boolean') return false;
    ids.add(id);
  }
  if (initial) {
    const source = [...initial].sort((a, b) => a.id - b.id), current = [...value].sort((a, b) => a.id - b.id);
    const types = (tiles: readonly TileState[]) => tiles.map((tile) => tile.type).sort().join('\0');
    if (types(source) !== types(current)) return false;
    if (current.some((tile, index) => tile.x !== source[index].x || tile.y !== source[index].y || tile.z !== source[index].z ||
      Boolean(tile.originallyFaceDown) !== Boolean(source[index].originallyFaceDown))) return false;
    if (current.filter((tile) => !tile.removed && tile.originallyFaceDown && !tile.faceDown).length > 1) return false;
  }
  return true;
}

function validSnapshot(value: unknown, difficulty: Difficulty, initial: readonly TileState[]): value is PersistedSnapshot {
  return isRecord(value) && typeof value.moves === 'number' && Number.isInteger(value.moves) && value.moves >= 0 &&
    validTiles(value.tiles, difficulty, initial) && value.tiles.filter((tile) => tile.removed).length === value.moves * 2;
}

export function parseSavedGame(raw: string): SavedGame | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.version !== SAVE_SCHEMA_VERSION || !['easy', 'normal', 'hard'].includes(value.difficulty as string)) return null;
  const difficulty = value.difficulty as Difficulty, limits = LIMITS[difficulty];
  if (!validTiles(value.initialTiles, difficulty)) return null;
  const initial = value.initialTiles;
  if (!validTiles(value.tiles, difficulty, initial) ||
    typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt) || value.savedAt < 0 ||
    typeof value.moves !== 'number' || !Number.isInteger(value.moves) || value.moves < 0 || value.tiles.filter((tile) => tile.removed).length !== value.moves * 2 ||
    !validCounter(value.hints, limits.hints) || !validCounter(value.shuffles, limits.shuffles) ||
    typeof value.elapsedMs !== 'number' || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || !Array.isArray(value.history) ||
    !value.history.every((entry) => validSnapshot(entry, difficulty, initial))) return null;
  if (value.safe !== null) {
    if (!isRecord(value.safe) || !validSnapshot(value.safe, difficulty, initial) || !Array.isArray(value.safe.history) ||
      !value.safe.history.every((entry) => validSnapshot(entry, difficulty, initial))) return null;
  }
  return value as unknown as SavedGame;
}

export function loadSavedGame(storage: Storage = localStorage): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { game: null, discarded: false, unavailable: false };
    const game = parseSavedGame(raw);
    if (game) return { game, discarded: false, unavailable: false };
    try { storage.removeItem(SAVE_KEY); } catch { /* storage is optional */ }
    return { game: null, discarded: true, unavailable: false };
  } catch { return { game: null, discarded: false, unavailable: true }; }
}

export function saveGame(game: SavedGame, storage: Storage = localStorage): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(game)); return true; } catch { return false; }
}
export function clearSavedGame(storage: Storage = localStorage): boolean {
  try { storage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
