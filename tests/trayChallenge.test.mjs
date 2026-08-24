import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, createTrayChallengeDeal } from '../.test-dist/BoardLayout.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaTrayDeal } from '../.test-dist/DioramaStages.js';
import { getAvailablePairs, isTrayClear, moveTileToTray } from '../.test-dist/GameRules.js';
import { hasForcedTrayStorageMoment } from '../.test-dist/TrayChallenge.js';

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
};

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

test('higher classic tray deals sustain near-full storage pressure', () => {
  for (const difficulty of ['normal', 'hard']) {
    const config = DIFFICULTIES[difficulty];
    assert.equal(config.trayChallenge, true);
    for (let seed = 1; seed <= 16; seed++) {
      const deal = createTrayChallengeDeal(difficulty, seeded(seed * 97));
      const states = classicStates(deal);
      const tileOrder = deal.solution.flat();
      assert.equal(
        hasForcedTrayStorageMoment(states, tileOrder, config.trayCapacity),
        true,
        `${difficulty} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
      const pressure = trayPressure(states, tileOrder, config.trayCapacity);
      assert.equal(pressure.maxTrayLoad, config.trayCapacity, `${difficulty} seed ${seed} must fill every tray slot`);
      assert.ok(
        pressure.fullTrayMoves >= Math.floor(tileOrder.length / 3),
        `${difficulty} seed ${seed} must keep the tray full across a sustained section`,
      );
      assert.ok(pressure.zeroPairStorageMoves > 0, `${difficulty} seed ${seed} must require storage with no board pair available`);
    }
  }
});

test('Bridge and every later Tour tray stage sustain near-full storage pressure', () => {
  for (const id of DIORAMA_STAGE_ORDER) {
    const stage = DIORAMA_STAGES[id];
    if (!stage.trayChallenge) continue;
    for (let seed = 1; seed <= 4; seed++) {
      const deal = createDioramaTrayDeal(id, seeded(1000 + seed));
      const tileOrder = deal.removalPairs.flat();
      assert.equal(
        hasForcedTrayStorageMoment(deal.tiles, tileOrder, stage.trayCapacity),
        true,
        `${id} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
      const pressure = trayPressure(deal.tiles, tileOrder, stage.trayCapacity);
      assert.equal(pressure.maxTrayLoad, stage.trayCapacity, `${id} seed ${seed} must fill every tray slot`);
      assert.ok(
        pressure.fullTrayMoves >= Math.floor(tileOrder.length / 3),
        `${id} seed ${seed} must keep the tray full across a sustained section`,
      );
      assert.ok(pressure.zeroPairStorageMoves > 0, `${id} seed ${seed} must require storage with no board pair available`);
    }
  }
});
