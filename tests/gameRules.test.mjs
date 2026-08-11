import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAvailablePair, isFreeTile } from '../.test-dist/GameRules.js';

const row = (types) => types.map((type, id) => ({ id, type, gridX: id * 2, gridY: 0, layer: 0, removed: false }));

test('only the ends of an unbroken row are free', () => {
  const tiles = row(['a', 'b', 'b', 'a']);
  assert.deepEqual(tiles.map((tile) => isFreeTile(tile, tiles)), [true, false, false, true]);
});

test('free status follows remaining board positions rather than array neighbours', () => {
  const tiles = row(['a', 'b', 'b', 'a']);
  tiles[0].removed = true;
  assert.equal(isFreeTile(tiles[1], tiles), true);
  assert.equal(isFreeTile(tiles[2], tiles), false);
});

test('available pair detection considers only free matching tiles', () => {
  assert.equal(hasAvailablePair(row(['a', 'b', 'b', 'a'])), true);
  assert.equal(hasAvailablePair(row(['a', 'b', 'a', 'b'])), false);
});
