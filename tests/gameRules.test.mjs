import test from 'node:test';
import assert from 'node:assert/strict';
import { findSolvableRemovalOrder, generateSolvableTypes, getAvailablePairs, hasAvailablePair, isClear, isFreeTile, isStuck, removePair, resetTiles, shuffleActiveTypes } from '../.test-dist/GameRules.js';
import { COMPACT_LAYOUT, COMPACT_POSITIONS, TILE_PAIR_FACES, DIFFICULTIES, createSolvableLayout } from '../.test-dist/BoardLayout.js';

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

test('100 seeded boards per difficulty are paired, playable, and carry a complete solution', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const positions = DIFFICULTIES[difficulty].positions;
    let freeTotal = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let state = seed;
      const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const layout = createSolvableLayout(difficulty, random);
      assert.equal(layout.length, positions.length);
      assert.notEqual(layout.length, 0);
      assert.equal(new Set(layout.map(({ x, y, z }) => `${x},${y},${z}`)).size, layout.length, 'coordinates must be unique');
      const counts = new Map();
      layout.forEach(({ face }) => counts.set(face, (counts.get(face) ?? 0) + 1));
      assert.ok([...counts.values()].every((count) => count % 2 === 0));
      const tiles = layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false }));
      const free = tiles.filter((tile) => isFreeTile(tile, tiles));
      freeTotal += free.length;
      assert.ok(getAvailablePairs(tiles).length > 0);

      // The generator's assignment itself is the certificate: reproduce its
      // random stream and replay every legal pair in the geometric order.
      state = seed;
      const order = findSolvableRemovalOrder(positions, difficulty === 'hard' ? () => 0.5 : random);
      for (const [first, second] of order) assert.equal(removePair(tiles[first], tiles[second], tiles), true);
      assert.equal(isClear(tiles), true);
    }
    assert.ok(freeTotal / 100 > 1, `${difficulty} must expose playable edge tiles`);
    assert.ok(freeTotal / 100 < positions.length, `${difficulty} must retain blocked tiles`);
  }
  assert.equal(DIFFICULTIES.easy.positions.length, 48);
  assert.equal(DIFFICULTIES.normal.positions.length, 72);
  assert.equal(DIFFICULTIES.hard.positions.length, 96);
});

test('hard uses a compact four-layer 48/28/16/4 turtle', () => {
  const positions = DIFFICULTIES.hard.positions;
  assert.deepEqual([0, 1, 2, 3].map((z) => positions.filter((tile) => tile.z === z).length), [48, 28, 16, 4]);
  const width = Math.max(...positions.map(({ x }) => x)) - Math.min(...positions.map(({ x }) => x)) + 2;
  const depth = Math.max(...positions.map(({ y }) => y)) - Math.min(...positions.map(({ y }) => y)) + 2;
  assert.ok(width / depth >= 1 && width / depth <= 1.5, `hard footprint must be near-square, got ${width}:${depth}`);
  for (let z = 1; z <= 3; z++) {
    const layer = positions.filter((tile) => tile.z === z);
    assert.ok(Math.max(...layer.map(({ x }) => Math.abs(x))) < Math.max(...positions.filter((tile) => tile.z === z - 1).map(({ x }) => Math.abs(x))));
  }
});

test('all 100 seeded hard deals contain 96 unique tiles and a complete legal solution', () => {
  const positions = DIFFICULTIES.hard.positions;
  assert.equal(positions.length, 96);
  for (let seed = 1; seed <= 100; seed++) {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const layout = createSolvableLayout('hard', random);
    assert.equal(layout.length, 96);
    assert.equal(new Set(layout.map(({ x, y, z }) => `${x},${y},${z}`)).size, 96);
    const tiles = layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false }));
    assert.ok(getAvailablePairs(tiles).length >= 1, `seed ${seed} must start with a free pair`);

    for (const [first, second] of findSolvableRemovalOrder(positions, () => 0.5)) {
      assert.equal(removePair(tiles[first], tiles[second], tiles), true, `seed ${seed} solution must remain legal`);
    }
    assert.equal(isClear(tiles), true);
  }
});
