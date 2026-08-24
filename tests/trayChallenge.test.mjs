import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, createTrayChallengeDeal } from '../.test-dist/BoardLayout.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaTrayDeal } from '../.test-dist/DioramaStages.js';
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

test('higher classic tray deals force a safe no-pair storage moment', () => {
  for (const difficulty of ['normal', 'hard']) {
    const config = DIFFICULTIES[difficulty];
    assert.equal(config.trayChallenge, true);
    for (let seed = 1; seed <= 16; seed++) {
      const deal = createTrayChallengeDeal(difficulty, seeded(seed * 97));
      assert.equal(
        hasForcedTrayStorageMoment(classicStates(deal), deal.solution.flat(), config.trayCapacity),
        true,
        `${difficulty} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
    }
  }
});

test('Bridge and every later Tour tray stage force a safe no-pair storage moment', () => {
  for (const id of DIORAMA_STAGE_ORDER) {
    const stage = DIORAMA_STAGES[id];
    if (!stage.trayChallenge) continue;
    for (let seed = 1; seed <= 4; seed++) {
      const deal = createDioramaTrayDeal(id, seeded(1000 + seed));
      assert.equal(
        hasForcedTrayStorageMoment(deal.tiles, deal.removalPairs.flat(), stage.trayCapacity),
        true,
        `${id} seed ${seed} must reach a zero-pair board while unmatched tiles are stored`,
      );
    }
  }
});
