import test from 'node:test';
import assert from 'node:assert/strict';
import { findSolvableRemovalOrder, generateSolvableTypes, getAvailablePairs, hasAvailablePair, isClear, isFreeTile, isStuck, removePair, resetTiles, shuffleActiveTypes } from '../.test-dist/GameRules.js';
import { COMPACT_LAYOUT, COMPACT_POSITIONS, TILE_PAIR_FACES } from '../.test-dist/BoardLayout.js';

const row = (types) => types.map((type, id) => ({ id, type, x: id * 2, y: 0, z: 0, removed: false }));

test('only the ends of an unbroken row are free', () => {
  const tiles = row(['a', 'b', 'b', 'a']);
  assert.deepEqual(tiles.map((tile) => isFreeTile(tile, tiles)), [true, false, false, true]);
});
test('free status follows remaining board positions rather than array neighbours', () => {
  const tiles = row(['a', 'b', 'b', 'a']); tiles[0].removed = true;
  assert.equal(isFreeTile(tiles[1], tiles), true); assert.equal(isFreeTile(tiles[2], tiles), false);
});
test('a tile overlapping from the layer above blocks selection', () => {
  const tiles = row(['a', 'a']); tiles.push({ id: 2, type: 'b', x: 0, y: 1, z: 1, removed: false });
  assert.equal(isFreeTile(tiles[0], tiles), false); tiles[2].removed = true; assert.equal(isFreeTile(tiles[0], tiles), true);
});
test('matching and hint candidates consider only free identical pairs', () => {
  const playable = row(['a', 'b', 'b', 'a']); const stuck = row(['a', 'b', 'a', 'b']);
  assert.equal(hasAvailablePair(playable), true); assert.equal(getAvailablePairs(playable).length, 1);
  assert.equal(hasAvailablePair(stuck), false); assert.equal(isStuck(stuck), true);
});
test('pair removal accepts a legal match and rejects invalid taps', () => {
  const tiles = row(['a', 'b', 'b', 'a']);
  assert.equal(removePair(tiles[0], tiles[0], tiles), false, 'the same tile cannot match itself');
  assert.equal(removePair(tiles[0], tiles[1], tiles), false, 'different faces cannot match');
  assert.equal(tiles.every((tile) => !tile.removed), true, 'invalid taps do not mutate the board');
  assert.equal(removePair(tiles[0], tiles[3], tiles), true); assert.equal(tiles.filter((tile) => tile.removed).length, 2);
  assert.equal(tiles.filter((tile) => !tile.removed).length, 2, 'remaining tile count follows removals');
  assert.equal(removePair(tiles[1], tiles[2], tiles), true); assert.equal(isClear(tiles), true); assert.equal(isStuck(tiles), false);
});
test('restart restores every tile and its initial face', () => {
  const tiles = row(['a', 'a', 'b', 'b']);
  const initial = tiles.map((tile) => tile.type);
  tiles[0].removed = tiles[3].removed = true; tiles[1].type = 'b';
  resetTiles(tiles, initial);
  assert.deepEqual(tiles.map((tile) => tile.type), initial);
  assert.equal(tiles.filter((tile) => !tile.removed).length, 4);
});

function assertSolvable(types, order) {
  const tiles = COMPACT_POSITIONS.map((position, id) => ({ id, type: types[id], ...position, removed: false }));
  for (const [firstId, secondId] of order) {
    assert.equal(types[firstId], types[secondId]);
    assert.equal(removePair(tiles[firstId], tiles[secondId], tiles), true);
  }
  assert.equal(isClear(tiles), true);
}
test('generated 72-tile deals always have a complete legal solution', () => {
  assert.equal(COMPACT_POSITIONS.length, 72);
  for (let seed = 1; seed <= 40; seed++) {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const order = findSolvableRemovalOrder(COMPACT_POSITIONS, random);
    // Replay random state so generation uses the exact order independently.
    state = seed;
    const types = generateSolvableTypes(COMPACT_POSITIONS, TILE_PAIR_FACES, random);
    assert.ok([...new Set(types)].every((type) => types.filter((candidate) => candidate === type).length <= 4));
    assertSolvable(types, order);
  }
  const stableRandom = () => 0.5;
  assertSolvable(COMPACT_LAYOUT.map((tile) => tile.face), findSolvableRemovalOrder(COMPACT_POSITIONS, stableRandom));
});
test('shuffle preserves remaining tile count and face multiset and makes a move', () => {
  const tiles = row(['a', 'b', 'a', 'b']); tiles.push(...row(['c', 'c']).map((tile, index) => ({ ...tile, id: index + 4, x: index * 2 + 8, removed: true })));
  const before = tiles.filter((tile) => !tile.removed).map((tile) => tile.type).sort();
  shuffleActiveTypes(tiles, () => 0.42);
  assert.equal(tiles.filter((tile) => !tile.removed).length, 4);
  assert.deepEqual(tiles.filter((tile) => !tile.removed).map((tile) => tile.type).sort(), before);
  assert.equal(hasAvailablePair(tiles), true);
});
