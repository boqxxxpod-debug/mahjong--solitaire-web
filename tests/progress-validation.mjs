import { analyzeBoard, isFreeTile } from '../.test-dist/GameRules.js';
import { createSolvableDeal } from '../.test-dist/BoardLayout.js';

const target = Number(process.env.STATE_COUNT ?? 10002);
const rng = (seed) => { let state = seed >>> 0; return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const durations = []; let mismatches = 0, unknown = 0;
for (let index = 0; index < target; index++) {
  const difficulty = ['easy', 'normal', 'hard'][index % 3];
  const deal = createSolvableDeal(difficulty, rng(1 + (index % 60)));
  const tiles = deal.layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false,
    faceDown: deal.faceDown[id], originallyFaceDown: deal.faceDown[id] }));
  const prefix = Math.floor(index / 180) % (deal.solution.length + 1);
  let independentlySolvable = true;
  for (const [firstId, secondId] of deal.solution.slice(0, prefix)) {
    for (const id of [firstId, secondId]) if (tiles[id].faceDown) {
      if (!isFreeTile(tiles[id], tiles)) independentlySolvable = false;
      tiles.forEach((tile) => { if (tile.originallyFaceDown) tile.faceDown = tile.id !== id; });
    }
    const first = tiles[firstId], second = tiles[secondId];
    if (first.faceDown || second.faceDown || first.type !== second.type || !isFreeTile(first, tiles) || !isFreeTile(second, tiles)) independentlySolvable = false;
    first.removed = second.removed = true;
  }
  const started = performance.now(); const result = analyzeBoard(tiles, 1_000_000); durations.push(performance.now() - started);
  const expected = prefix === deal.solution.length ? 'CLEAR' : independentlySolvable ? 'SOLVABLE' : 'UNSOLVABLE';
  mismatches += Number(result.status !== expected); unknown += Number(result.status === 'UNKNOWN');
}
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
const report = { states: target, mismatches, unknown, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: durations.at(-1) };
console.log(JSON.stringify(report, null, 2));
if (mismatches || unknown) process.exitCode = 1;
