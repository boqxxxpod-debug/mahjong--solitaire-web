import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSavedGame, SAVE_SCHEMA_VERSION } from '../.test-dist/GamePersistence.js';

const tiles = Array.from({ length: 36 }, (_, id) => ({
  id, type: `type-${Math.floor(id / 2)}`, x: id * 2, y: 0, z: 0,
  removed: false, faceDown: false, originallyFaceDown: false,
}));
const valid = {
  version: SAVE_SCHEMA_VERSION, mode: 'classic', savedAt: 123, difficulty: 'easy', tiles, initialTiles: tiles,
  playRule: 'pair', tray: [], moves: 0, hints: null, shuffles: null, history: [], safe: null, elapsedMs: 456,
};

test('valid versioned saves are accepted', () => {
  assert.deepEqual(parseSavedGame(JSON.stringify(valid)), valid);
});

test('schema 1 Classic saves migrate without adding closed-page time', () => {
  const legacy = { ...valid, version: 1 }; delete legacy.mode; delete legacy.playRule; delete legacy.tray;
  assert.deepEqual(parseSavedGame(JSON.stringify(legacy)), { ...legacy, version: 3, mode: 'classic', playRule: 'pair', tray: [] });
});

test('tray saves keep held tiles separate and reject over-capacity data', () => {
  const held = [{ ...tiles[0], removed: true }]; const tray = { ...valid, playRule: 'tray', tray: held, tiles: tiles.map((tile, id) => ({ ...tile, removed: id === 0 })) };
  assert.deepEqual(parseSavedGame(JSON.stringify(tray)), tray);
  assert.equal(parseSavedGame(JSON.stringify({ ...tray, tray: Array.from({ length: 6 }, (_, id) => ({ ...tiles[id], removed: true })) })), null);
});

test('corrupt, unknown, and inconsistent saves are rejected', () => {
  assert.equal(parseSavedGame('{'), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, version: 99 })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, tiles: tiles.slice(1) })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, tiles: tiles.map((tile, index) => ({ ...tile, id: index ? tile.id : 1 })) })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, history: [{ moves: 1, tiles: [] }] })), null);
});
