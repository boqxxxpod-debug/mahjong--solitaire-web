import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceDownFlags, findSolvableRemovalOrder, generateSolvableTypes, getAvailableActions, getAvailablePairs, hasAvailableAction, hasAvailablePair, isClear, isFreeTile, isStuck, isTileUncovered, removePair, resetTiles, shuffleActiveTypes } from '../.test-dist/GameRules.js';
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
test('face-down tiles use the same free rule but never expose a hint or match', () => {
  const tiles = row(['a', 'b', 'b', 'a']);
  tiles[0].faceDown = true; tiles[1].faceDown = true;
  assert.equal(isFreeTile(tiles[0], tiles), true, 'a free face-down tile can be revealed');
  assert.equal(isFreeTile(tiles[1], tiles), false, 'a blocked face-down tile cannot be revealed');
  assert.equal(getAvailablePairs(tiles).length, 0, 'hidden faces are excluded from hints');
  assert.equal(removePair(tiles[0], tiles[3], tiles), false, 'a hidden tile cannot be removed');
  assert.equal(hasAvailableAction(tiles), true, 'revealing a free tile prevents a false dead end');
  assert.equal(getAvailableActions(tiles)[0].kind, 'reveal', 'hint and dead-end checks share the reveal action');
  tiles[0].faceDown = false;
  assert.equal(getAvailablePairs(tiles).length, 1, 'a revealed tile behaves like a normal tile');
  assert.equal(getAvailableActions(tiles)[0].kind, 'pair');
});

test('clear and stuck remain distinct across every difficulty rule set', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const stuck = row(['a', 'b', 'a', 'b']);
    assert.equal(isStuck(stuck), true, `${difficulty} detects a board with no action`);
    stuck.forEach((tile) => { tile.removed = true; });
    assert.equal(isClear(stuck), true);
    assert.equal(isStuck(stuck), false, `${difficulty} never labels CLEAR as stuck`);
  }
});
test('difficulty controls face-down counts without changing tile information', () => {
  const easy = createFaceDownFlags(DIFFICULTIES.easy.positions, 'easy', () => 0.5);
  const normal = createFaceDownFlags(DIFFICULTIES.normal.positions, 'normal', () => 0.5);
  const hard = createFaceDownFlags(DIFFICULTIES.hard.positions, 'hard', () => 0.5);
  assert.equal(easy.filter(Boolean).length, 0);
  assert.equal(normal.filter(Boolean).length, 6);
  assert.equal(hard.filter(Boolean).length, 14);
  assert.ok(hard.filter(Boolean).length > normal.filter(Boolean).length);
});
test('normal and hard prioritize visible face-down tiles including a free tile', () => {
  for (const [difficulty, minimum] of [['normal', 2], ['hard', 4]]) {
    const positions = DIFFICULTIES[difficulty].positions;
    for (let seed = 1; seed <= 100; seed++) {
      let state = seed;
      const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const flags = createFaceDownFlags(positions, difficulty, random);
      const tiles = positions.map((position, id) => ({ id, type: '', ...position, removed: false, faceDown: flags[id] }));
      assert.ok(tiles.filter((tile) => tile.faceDown && isTileUncovered(tile, tiles)).length >= minimum);
      assert.ok(tiles.some((tile) => tile.faceDown && isFreeTile(tile, tiles)));
    }
  }
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
test('generated normal deals always have a complete legal solution', () => {
  assert.equal(COMPACT_POSITIONS.length, 44);
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
  assert.equal(DIFFICULTIES.easy.positions.length, 36);
  assert.equal(DIFFICULTIES.normal.positions.length, 44);
  assert.equal(DIFFICULTIES.hard.positions.length, 60);
});

test('difficulty layouts stay compact and become progressively more layered', () => {
  const expected = { easy: { count: 36, layers: 3 }, normal: { count: 44, layers: 4 }, hard: { count: 60, layers: 5 } };
  for (const [difficulty, metrics] of Object.entries(expected)) {
    const positions = DIFFICULTIES[difficulty].positions;
    assert.equal(positions.length, metrics.count);
    assert.equal(new Set(positions.map(({ z }) => z)).size, metrics.layers);
    assert.ok(Math.max(...positions.map(({ x }) => x)) - Math.min(...positions.map(({ x }) => x)) <= 8,
      `${difficulty} footprint must be no wider than five tile columns`);
  }
});

test('hard uses a narrow five-layer 16/16/16/6/6 tower', () => {
  const positions = DIFFICULTIES.hard.positions;
  assert.deepEqual([0, 1, 2, 3, 4].map((z) => positions.filter((tile) => tile.z === z).length), [16, 16, 16, 6, 6]);
  const width = Math.max(...positions.map(({ x }) => x)) - Math.min(...positions.map(({ x }) => x)) + 2;
  const depth = Math.max(...positions.map(({ y }) => y)) - Math.min(...positions.map(({ y }) => y)) + 2;
  assert.ok(width / depth >= 1 && width / depth <= 1.5, `hard footprint must be near-square, got ${width}:${depth}`);
  assert.equal(width, 8, 'hard must remain only four tiles wide');
});

test('all 100 seeded hard deals contain 60 unique tiles and a complete legal solution', () => {
  const positions = DIFFICULTIES.hard.positions;
  assert.equal(positions.length, 60);
  for (let seed = 1; seed <= 100; seed++) {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const layout = createSolvableLayout('hard', random);
    assert.equal(layout.length, 60);
    assert.equal(new Set(layout.map(({ x, y, z }) => `${x},${y},${z}`)).size, 60);
    const tiles = layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false }));
    assert.ok(getAvailablePairs(tiles).length >= 1, `seed ${seed} must start with a free pair`);

    for (const [first, second] of findSolvableRemovalOrder(positions, () => 0.5)) {
      assert.equal(removePair(tiles[first], tiles[second], tiles), true, `seed ${seed} solution must remain legal`);
    }
    assert.equal(isClear(tiles), true);
  }
});
