import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, createTrayChallengeDeal } from '../.test-dist/BoardLayout.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaTrayDeal } from '../.test-dist/DioramaStages.js';
import { getAvailablePairs, isTrayClear, moveTileToTray } from '../.test-dist/GameRules.js';
import { countFullTrayDistractorMoments, hasForcedTrayStorageMoment, hasSustainedForcedTrayStorage, measureTrayDependency } from '../.test-dist/TrayChallenge.js';

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
};

const minimumForcedStorageMoves = (tileCount) => Math.max(3, Math.ceil(tileCount * 0.2));
const withoutGateLocks = (tiles) => tiles.map((tile) => ({ ...tile, gateKey: undefined, gateGroup: undefined }));

function classicStates(deal) {
  return deal.layout.map(({ face, ...position }, id) => ({
    id,
    type: face,
    ...position,
    removed: false,
    faceDown: Boolean(deal.faceDown[id]),
    originallyFaceDown: Boolean(deal.faceDown[id]),
  }));
}

function trayPressure(initial, tileOrder, capacity) {
  const state = initial.map((tile) => ({
    ...tile,
    faceDown: false,
    originallyFaceDown: false,
  }));
  let tray = [];
  let maxTrayLoad = 0;
  let fullTrayMoves = 0;
  let zeroPairStorageMoves = 0;

  for (const tileId of tileOrder) {
    if (tray.length > 0 && state.some((tile) => !tile.removed) && getAvailablePairs(state).length === 0) {
      zeroPairStorageMoves++;
    }
    const tile = state.find((candidate) => candidate.id === tileId);
    assert.ok(tile, `missing tray route tile ${tileId}`);
    const nextTray = moveTileToTray(tile, state, tray, capacity);
    assert.ok(nextTray, `illegal tray route tile ${tileId}`);
    tray = nextTray;
    maxTrayLoad = Math.max(maxTrayLoad, tray.length);
    if (tray.length === capacity) fullTrayMoves++;
  }

  assert.equal(isTrayClear(state, tray), true, 'certified tray route must clear');
  return { maxTrayLoad, fullTrayMoves, zeroPairStorageMoves };
}

function minimumMatchGap(initial, tileOrder) {
  const firstSeen = new Map();
  let minimum = Number.POSITIVE_INFINITY;
  tileOrder.forEach((tileId, index) => {
    const tile = initial.find((candidate) => candidate.id === tileId);
    assert.ok(tile, `missing tile ${tileId}`);
    const first = firstSeen.get(tile.type);
    if (first === undefined) firstSeen.set(tile.type, index);
    else minimum = Math.min(minimum, index - first);
  });
  return minimum;
}

test('Tour tightens tray capacity before the final half', () => {
  assert.deepEqual(
    DIORAMA_STAGE_ORDER.map((id) => DIORAMA_STAGES[id].trayCapacity),
    [5, 5, 4, 4, 3, 3, 3, 3, 3, 3],
  );
});

test('higher classic tray deals sustain pressure, deep spacing, and visible decoys', () => {
  for (const difficulty of ['normal', 'hard']) {
    const config = DIFFICULTIES[difficulty];
    assert.equal(config.trayChallenge, true);
    for (let seed = 1; seed <= 16; seed++) {
      const deal = createTrayChallengeDeal(difficulty, seeded(seed * 97));
      const states = classicStates(deal);
      const tileOrder = deal.solution.flat();
      const minimumStorage = minimumForcedStorageMoves(states.length);
      const dependency = measureTrayDependency(states, tileOrder, config.trayCapacity);
      assert.ok(
        dependency.zeroPairStorageMoves >= minimumStorage,
        `${difficulty} seed ${seed} must spend at least 20% of the route in pairless storage`,
      );
      assert.equal(
        hasSustainedForcedTrayStorage(states, tileOrder, config.trayCapacity, minimumStorage),
        true,
        `${difficulty} seed ${seed} must force sustained tray storage`,
      );
      assert.equal(
        hasForcedTrayStorageMoment(states, tileOrder, config.trayCapacity),
        true,
        `${difficulty} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
      assert.ok(
        minimumMatchGap(states, tileOrder) >= config.trayCapacity,
        `${difficulty} seed ${seed} must delay every partner by at least the tray capacity`,
      );
      assert.ok(
        countFullTrayDistractorMoments(states, tileOrder, config.trayCapacity) > 0,
        `${difficulty} seed ${seed} must expose decoy FREE TILEs while a rescue is available`,
      );
      const pressure = trayPressure(states, tileOrder, config.trayCapacity);
      assert.equal(pressure.maxTrayLoad, config.trayCapacity, `${difficulty} seed ${seed} must fill every tray slot`);
      assert.ok(
        pressure.fullTrayMoves >= Math.floor(tileOrder.length / 3),
        `${difficulty} seed ${seed} must keep the tray full across a sustained section`,
      );
      assert.ok(
        pressure.zeroPairStorageMoves >= minimumStorage,
        `${difficulty} seed ${seed} must repeatedly require storage with no board pair available`,
      );
    }
  }
});

test('Bridge and later Tour stages sustain pressure; 40+ tile stages add visible decoys', () => {
  for (const id of DIORAMA_STAGE_ORDER) {
    const stage = DIORAMA_STAGES[id];
    if (!stage.trayChallenge) continue;
    for (let seed = 1; seed <= 4; seed++) {
      const deal = createDioramaTrayDeal(id, seeded(1000 + seed));
      const tileOrder = deal.removalPairs.flat();
      const structuralTiles = withoutGateLocks(deal.tiles);
      const minimumStorage = minimumForcedStorageMoves(structuralTiles.length);
      const dependency = measureTrayDependency(structuralTiles, tileOrder, stage.trayCapacity);
      assert.ok(
        dependency.zeroPairStorageMoves >= minimumStorage,
        `${id} seed ${seed} must spend at least 20% of the route in pairless storage`,
      );
      assert.equal(
        hasSustainedForcedTrayStorage(structuralTiles, tileOrder, stage.trayCapacity, minimumStorage),
        true,
        `${id} seed ${seed} must force sustained tray storage without relying on gates`,
      );
      assert.equal(
        hasForcedTrayStorageMoment(deal.tiles, tileOrder, stage.trayCapacity),
        true,
        `${id} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
      assert.ok(
        minimumMatchGap(deal.tiles, tileOrder) >= stage.trayCapacity,
        `${id} seed ${seed} must delay every partner by at least the tray capacity`,
      );
      if (stage.positions.length >= 40) {
        assert.ok(
          countFullTrayDistractorMoments(deal.tiles, tileOrder, stage.trayCapacity) > 0,
          `${id} seed ${seed} must expose decoy FREE TILEs while a rescue is available`,
        );
      }
      const pressure = trayPressure(deal.tiles, tileOrder, stage.trayCapacity);
      assert.equal(pressure.maxTrayLoad, stage.trayCapacity, `${id} seed ${seed} must fill every tray slot`);
      assert.ok(
        pressure.fullTrayMoves >= Math.floor(tileOrder.length / 3),
        `${id} seed ${seed} must keep the tray full across a sustained section`,
      );
      assert.ok(
        pressure.zeroPairStorageMoves >= minimumStorage,
        `${id} seed ${seed} must repeatedly require storage with no board pair available`,
      );
    }
  }
});
