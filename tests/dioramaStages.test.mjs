import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBoard, analyzeTrayBoard, boardStateHash, getAvailableActions, isFreeTile, isGateLocked, isTileUncovered, removePair } from '../.test-dist/GameRules.js';
import { DIFFICULTIES, createTrayChallengeDeal } from '../.test-dist/BoardLayout.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaDeal, createDioramaTrayDeal, replayDioramaCertificate, replayDioramaTrayCertificate } from '../.test-dist/DioramaStages.js';

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

test('catalog has ten stable stages with a strictly increasing difficulty curve', () => {
  assert.deepEqual(DIORAMA_STAGE_ORDER, [
    'gate', 'tower', 'bridge', 'turtle', 'pyramid',
    'fortress', 'pagoda', 'spiral', 'dragon', 'great-wall',
  ]);
  assert.deepEqual(DIORAMA_STAGE_ORDER.map((id) => DIORAMA_STAGES[id].positions.length), [24, 28, 32, 36, 40, 44, 50, 56, 62, 68]);
  assert.deepEqual(DIORAMA_STAGE_ORDER.map((id) => DIORAMA_STAGES[id].hiddenRatio), [0, 0.04, 0.07, 0.10, 0.13, 0.17, 0.20, 0.24, 0.28, 0.32]);
  assert.deepEqual(DIORAMA_STAGE_ORDER.map((id) => DIORAMA_STAGES[id].gateDepth ?? 0), [0, 0, 0, 0, 0, 1, 2, 2, 3, 4]);
  const normalized = new Map();
  for (const [index, id] of DIORAMA_STAGE_ORDER.entries()) {
    const stage = DIORAMA_STAGES[id], { positions } = stage;
    assert.ok(positions.length > 0 && positions.length <= 68 && positions.length % 2 === 0, `${id} has a valid even count`);
    assert.ok(stage.hiddenRatio >= 0 && stage.hiddenRatio <= 0.32);
    assert.equal(stage.trayChallenge, index >= 2, `${id} tray challenge threshold`);
    assert.equal(stage.gateChallenge, index >= 5, `${id} gate challenge threshold`);
    if (index) {
      const previous = DIORAMA_STAGES[DIORAMA_STAGE_ORDER[index - 1]];
      assert.ok(positions.length > previous.positions.length, `${id} adds tiles`);
      assert.ok(stage.hiddenRatio >= previous.hiddenRatio, `${id} never reduces hidden pressure`);
      assert.ok((stage.hints ?? Infinity) <= (previous.hints ?? Infinity), `${id} never adds hints`);
      assert.ok((stage.shuffles ?? Infinity) <= (previous.shuffles ?? Infinity), `${id} never adds shuffles`);
      assert.ok(stage.trayCapacity <= previous.trayCapacity, `${id} never adds tray capacity`);
    }
    assert.ok(stage.trayCapacity >= 3 && stage.trayCapacity <= 5);
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
      if (seed === 1) assert.equal(analyzeTrayBoard(deal.tiles, [], 1_000_000, DIORAMA_STAGES[id].trayCapacity).status, 'SOLVABLE');
      const hidden = deal.tiles.filter((tile) => tile.originallyFaceDown);
      assert.equal(hidden.length, Math.round(DIORAMA_STAGES[id].positions.length * DIORAMA_STAGES[id].hiddenRatio));
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

test('late pair-mode stages expose a visible four-of-a-kind fork with a proven losing cross-pair', () => {
  const challengedStages = ['pyramid', 'fortress', 'pagoda', 'spiral'];
  for (const [index, id] of challengedStages.entries()) {
    const stage = DIORAMA_STAGES[id];
    const deal = createDioramaDeal(id, seeded(9000 + index));
    const { primaryPairIndex, secondaryPairIndex } = stage.pairChoice;
    const primary = deal.removalPairs[primaryPairIndex];
    const secondary = deal.removalPairs[secondaryPairIndex];
    const challengeIds = [...primary, ...secondary];
    const repeatedFace = deal.tiles[primary[0]].type;

    assert.equal(deal.tiles.filter((tile) => tile.type === repeatedFace).length, 4, `${id} repeats the challenge face exactly four times`);
    assert.ok(challengeIds.every((tileId) => deal.tiles[tileId].type === repeatedFace), `${id} assigns one face to both certified pairs`);
    assert.ok(challengeIds.every((tileId) => !deal.tiles[tileId].faceDown && !deal.tiles[tileId].originallyFaceDown), `${id} keeps all four choices visible`);
    assert.equal(replayDioramaCertificate(deal.tiles, deal.solution), true, `${id} retains its certified winning route`);

    const checkpoint = deal.tiles.map((tile) => ({ ...tile }));
    for (let pairIndex = 0; pairIndex < primaryPairIndex; pairIndex++) {
      const [firstId, secondId] = deal.removalPairs[pairIndex];
      checkpoint[firstId].faceDown = false;
      checkpoint[secondId].faceDown = false;
      assert.equal(removePair(checkpoint[firstId], checkpoint[secondId], checkpoint), true, `${id} reaches its pair-choice checkpoint`);
    }

    assert.ok(challengeIds.every((tileId) => isTileUncovered(checkpoint[tileId], checkpoint)), `${id} exposes all four challenge tiles`);
    const freeChallengeIds = challengeIds.filter((tileId) => isFreeTile(checkpoint[tileId], checkpoint));
    assert.equal(freeChallengeIds.length, 3, `${id} presents three removable copies at the checkpoint`);
    assert.ok(primary.every((tileId) => freeChallengeIds.includes(tileId)), `${id} keeps the certified pair removable`);

    const secondaryFreeId = secondary.find((tileId) => freeChallengeIds.includes(tileId));
    assert.notEqual(secondaryFreeId, undefined, `${id} exposes one tile from the second certified pair`);
    const losingCrossPairs = primary.filter((primaryId) => {
      const wrongRoute = checkpoint.map((tile) => ({ ...tile }));
      if (!removePair(wrongRoute[primaryId], wrongRoute[secondaryFreeId], wrongRoute)) return false;
      return analyzeBoard(wrongRoute, 1_000_000).status === 'UNSOLVABLE';
    });
    assert.ok(losingCrossPairs.length >= 1, `${id} proves at least one tempting cross-pair loses`);
  }
});

test('Fortress and later stages open progressively deeper sealed areas with visible key pairs', () => {
  for (const [index, id] of DIORAMA_STAGE_ORDER.entries()) {
    const stage = DIORAMA_STAGES[id];
    const deal = createDioramaDeal(id, seeded(7000 + index));
    const depth = stage.gateDepth ?? 0;
    const keys = deal.tiles.filter((tile) => tile.gateKey);
    const gated = deal.tiles.filter((tile) => tile.gateGroup);
    if (!stage.gateChallenge) {
      assert.equal(depth, 0, `${id} has no gate depth before Fortress`);
      assert.equal(keys.length, 0, `${id} has no keys before Fortress`);
      assert.equal(gated.length, 0, `${id} has no gated tiles before Fortress`);
      continue;
    }

    assert.equal(keys.length, depth * 2, `${id} has one two-tile key per seal`);
    assert.equal(new Set(keys.map((tile) => tile.gateKey)).size, depth, `${id} has ${depth} distinct seals`);
    assert.ok(keys.every((tile) => !tile.faceDown && !tile.originallyFaceDown), `${id} keeps every gold key visible`);
    assert.ok(gated.every((tile) => isGateLocked(tile, deal.tiles)), `${id} gated tiles are locked while keys remain`);
    assert.ok(gated.every((tile) => !isFreeTile(tile, deal.tiles)), `${id} gate overrides normal FREE status`);
    assert.equal(replayDioramaCertificate(deal.tiles, deal.solution), true, `${id} keeps its certified route`);

    const state = deal.tiles.map((tile) => ({ ...tile }));
    const gateIds = Array.from({ length: depth }, (_, step) => state[deal.removalPairs[step][0]].gateKey);
    for (let step = 0; step < depth; step++) {
      const keyPair = deal.removalPairs[step];
      const gateId = gateIds[step];
      assert.ok(gateId, `${id} seal ${step + 1} has an id`);
      assert.ok(keyPair.every((tileId) => state[tileId].gateKey === gateId), `${id} seal ${step + 1} uses its certified key pair`);
      assert.ok(keyPair.every((tileId) => !isGateLocked(state[tileId], state) && isFreeTile(state[tileId], state)), `${id} exposes only the current key pair in the chain`);
      if (step > 0) assert.ok(keyPair.every((tileId) => state[tileId].gateGroup === gateIds[step - 1]), `${id} key ${step + 1} was sealed by key ${step}`);

      const sealed = state.filter((tile) => !tile.removed && tile.gateGroup === gateId);
      assert.ok(sealed.length >= 2, `${id} seal ${step + 1} protects an area`);
      assert.ok(sealed.every((tile) => isGateLocked(tile, state) && !isFreeTile(tile, state)), `${id} seal ${step + 1} stays closed before its key is removed`);

      assert.equal(removePair(state[keyPair[0]], state[keyPair[1]], state), true, `${id} removes key ${step + 1}`);
      const nextPair = deal.removalPairs[step + 1];
      assert.ok(nextPair.every((tileId) => state[tileId].gateGroup === gateId), `${id} seal ${step + 1} contains the next certified pair`);
      assert.ok(nextPair.every((tileId) => !isGateLocked(state[tileId], state) && isFreeTile(state[tileId], state)), `${id} key ${step + 1} opens the next pair`);

      for (let later = step + 1; later < depth; later++) {
        const laterSealed = state.filter((tile) => !tile.removed && tile.gateGroup === gateIds[later]);
        assert.ok(laterSealed.length >= 2 && laterSealed.every((tile) => isGateLocked(tile, state)), `${id} keeps seal ${later + 1} closed`);
      }
    }
  }
});

test('tray mode starts requiring temporary storage at higher difficulty', () => {
  assert.equal(DIFFICULTIES.easy.trayChallenge, false);
  for (const difficulty of ['normal', 'hard']) {
    const config = DIFFICULTIES[difficulty];
    assert.equal(config.trayChallenge, true);
    const deal = createTrayChallengeDeal(difficulty, seeded(difficulty === 'normal' ? 401 : 701));
    const openingIds = deal.solution.flat().slice(0, config.trayCapacity);
    const openingFaces = openingIds.map((id) => deal.layout[id].face);
    assert.equal(new Set(openingFaces).size, config.trayCapacity, `${difficulty} opens with ${config.trayCapacity} unmatched tray tiles`);
    assert.notEqual(deal.layout[deal.solution[0][0]].face, deal.layout[deal.solution[0][1]].face, `${difficulty} first free pair positions do not match`);
    const pairOnlyTiles = deal.layout.map(({ face, ...position }, id) => ({ id, type: face, ...position, removed: false, faceDown: false, originallyFaceDown: false }));
    assert.equal(analyzeBoard(pairOnlyTiles, 100_000).status, 'UNSOLVABLE', `${difficulty} cannot be cleared without the tray`);
  }

  for (const id of DIORAMA_STAGE_ORDER) {
    const stage = DIORAMA_STAGES[id];
    const deal = createDioramaTrayDeal(id, seeded(1000 + DIORAMA_STAGE_ORDER.indexOf(id)));
    if (!stage.trayChallenge) {
      assert.equal(replayDioramaCertificate(deal.tiles, deal.solution), true, `${id} remains an introductory pair-style tray deal`);
      continue;
    }
    const openingIds = deal.removalPairs.flat().slice(0, stage.trayCapacity);
    const openingFaces = openingIds.map((tileId) => deal.tiles[tileId].type);
    assert.equal(new Set(openingFaces).size, stage.trayCapacity, `${id} fills the tray with distinct temporary tiles before matches arrive`);
    assert.notEqual(deal.tiles[deal.removalPairs[0][0]].type, deal.tiles[deal.removalPairs[0][1]].type, `${id} does not expose the canonical pair as an immediate match`);
    if (stage.gateChallenge) assert.ok(deal.tiles.filter((tile) => tile.gateKey).every((tile) => !tile.faceDown && !tile.originallyFaceDown), `${id} keeps tray keys visible`);
    assert.ok(deal.solution.some((action) => action.kind === 'tray'), `${id} has a tray certificate`);
    const pairOnlyTiles = deal.tiles.map((tile) => ({ ...tile, faceDown: false, originallyFaceDown: false }));
    assert.equal(analyzeBoard(pairOnlyTiles, 100_000).status, 'UNSOLVABLE', `${id} cannot be cleared without the tray`);
    assert.equal(replayDioramaTrayCertificate(deal.tiles, deal.solution, stage.trayCapacity), true, `${id} tray certificate clears safely`);
  }
});

test('invalid stage and random sources fail rather than returning an uncertified fallback', () => {
  assert.throws(() => createDioramaDeal('missing', seeded(1)), /Unknown diorama stage/);
  assert.throws(() => createDioramaDeal('gate', () => Number.NaN), /Random source/);
});
