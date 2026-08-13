import test from 'node:test';
import assert from 'node:assert/strict';
import { boardStateHash, getAvailableActions, isFreeTile } from '../.test-dist/GameRules.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaDeal, replayDioramaCertificate } from '../.test-dist/DioramaStages.js';

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
};

function normalizedTransforms(positions) {
  const transforms = [
    (x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x],
    (x, y) => [-x, y], (x, y) => [x, -y], (x, y) => [y, x], (x, y) => [-y, -x],
  ];
  return transforms.map((transform) => {
    const changed = positions.map(({ x, y, z }) => { const [nextX, nextY] = transform(x, y); return { x: nextX, y: nextY, z }; });
    const minX = Math.min(...changed.map(({ x }) => x)); const minY = Math.min(...changed.map(({ y }) => y));
    return changed.map(({ x, y, z }) => `${x - minX},${y - minY},${z}`).sort().join('|');
  });
}

test('catalog has four stable, valid, supported and structurally distinct stages', () => {
  assert.deepEqual(DIORAMA_STAGE_ORDER, ['gate', 'tower', 'bridge', 'dragon']);
  const normalized = new Map();
  for (const id of DIORAMA_STAGE_ORDER) {
    const { positions } = DIORAMA_STAGES[id];
    assert.ok(positions.length > 0 && positions.length <= 60 && positions.length % 2 === 0, `${id} has a valid even count`);
    assert.equal(new Set(positions.map(({ x, y, z }) => `${x},${y},${z}`)).size, positions.length);
    assert.ok(positions.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)));
    for (const tile of positions.filter(({ z }) => z > 0)) {
      assert.ok(positions.some((lower) => lower.z === tile.z - 1 && Math.abs(lower.x - tile.x) < 2 && Math.abs(lower.y - tile.y) < 2), `${id} upper tile is supported`);
    }
    normalized.set(id, new Set(normalizedTransforms(positions)));
  }
  for (let first = 0; first < DIORAMA_STAGE_ORDER.length; first++) for (let second = first + 1; second < DIORAMA_STAGE_ORDER.length; second++) {
    const a = DIORAMA_STAGE_ORDER[first], b = DIORAMA_STAGE_ORDER[second];
    assert.equal([...normalized.get(a)].some((shape) => normalized.get(b).has(shape)), false, `${a} and ${b} are not transformed copies`);
  }
});

test('seeded deals reproduce, vary, expose an action, and replay through CLEAR', () => {
  for (const id of DIORAMA_STAGE_ORDER) {
    const hashes = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const deal = createDioramaDeal(id, seeded(seed));
      const duplicate = createDioramaDeal(id, seeded(seed));
      assert.equal(deal.stateHash, duplicate.stateHash);
      assert.equal(deal.stateHash, boardStateHash(deal.tiles));
      assert.ok(getAvailableActions(deal.tiles).length > 0);
      assert.equal(replayDioramaCertificate(deal.tiles, deal.solution), true);
      const hidden = deal.tiles.filter((tile) => tile.originallyFaceDown);
      assert.ok(deal.removalPairs.every(([a, b]) => !(deal.tiles[a].originallyFaceDown && deal.tiles[b].originallyFaceDown)));
      assert.ok(hidden.every((tile) => tile.faceDown));
      const counts = new Map(); deal.tiles.forEach(({ type }) => counts.set(type, (counts.get(type) ?? 0) + 1));
      assert.ok([...counts.values()].every((count) => count % 2 === 0 && count <= 4));
      hashes.add(deal.stateHash);
    }
    assert.ok(hashes.size >= 20, `${id} meaningfully varies across seeds`);
    const geometry = DIORAMA_STAGES[id].positions.map((position, tileId) => ({ id: tileId, type: '', ...position, removed: false }));
    assert.ok(geometry.filter((tile) => isFreeTile(tile, geometry)).length >= 2);
  }
});

test('invalid stage and random sources fail rather than returning an uncertified fallback', () => {
  assert.throws(() => createDioramaDeal('missing', seeded(1)), /Unknown diorama stage/);
  assert.throws(() => createDioramaDeal('gate', () => Number.NaN), /Random source/);
});
