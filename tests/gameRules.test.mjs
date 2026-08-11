import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAvailablePair, isFreeTile } from '../.test-dist/GameRules.js';
import { COMPACT_LAYOUT } from '../.test-dist/BoardLayout.js';

const row = (types) => types.map((type, id) => ({ id, type, x: id * 2, y: 0, z: 0, removed: false }));

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

test('a tile overlapping from the layer above blocks selection', () => {
  const tiles = row(['a', 'a']);
  tiles.push({ id: 2, type: 'b', x: 0, y: 1, z: 1, removed: false });
  assert.equal(isFreeTile(tiles[0], tiles), false);
  tiles[2].removed = true;
  assert.equal(isFreeTile(tiles[0], tiles), true);
});

test('the compact 32-tile layout can be cleared using legal pairs', () => {
  const tiles = COMPACT_LAYOUT.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false }));
  while (tiles.some((tile) => !tile.removed)) {
    const free = tiles.filter((tile) => isFreeTile(tile, tiles));
    const first = free.find((tile, index) => free.slice(index + 1).some((other) => other.type === tile.type));
    const second = first && free.find((tile) => tile.id !== first.id && tile.type === first.type);
    assert.ok(first && second, 'every step must expose a removable pair');
    first.removed = second.removed = true;
  }
  assert.equal(tiles.filter((tile) => !tile.removed).length, 0);
});
