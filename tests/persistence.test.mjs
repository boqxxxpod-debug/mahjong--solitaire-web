import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSavedGame, SAVE_SCHEMA_VERSION } from '../.test-dist/GamePersistence.js';

const tiles = Array.from({ length: 36 }, (_, id) => ({
  id, type: `type-${Math.floor(id / 2)}`, x: id * 2, y: 0, z: 0,
  removed: false, faceDown: false, originallyFaceDown: false,
}));
const valid = {
  version: SAVE_SCHEMA_VERSION, mode: 'classic', savedAt: 123, difficulty: 'easy', tiles, initialTiles: tiles,
  moves: 0, hints: null, shuffles: null, history: [], safe: null, elapsedMs: 456,
};

test('valid versioned saves are accepted', () => {
  assert.deepEqual(parseSavedGame(JSON.stringify(valid)), valid);
});

test('schema 1 Classic saves migrate without adding closed-page time', () => {
  const legacy = { ...valid, version: 1 }; delete legacy.mode;
  assert.deepEqual(parseSavedGame(JSON.stringify(legacy)), { ...legacy, version: 2, mode: 'classic' });
});

test('corrupt, unknown, and inconsistent saves are rejected', () => {
  assert.equal(parseSavedGame('{'), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, version: 99 })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, tiles: tiles.slice(1) })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, tiles: tiles.map((tile, index) => ({ ...tile, id: index ? tile.id : 1 })) })), null);
  assert.equal(parseSavedGame(JSON.stringify({ ...valid, history: [{ moves: 1, tiles: [] }] })), null);
});
