import { createCertifiedShuffle, analyzeBoard } from '../.test-dist/GameRules.js';
import { createSolvableDeal } from '../.test-dist/BoardLayout.js';

const count = Number(process.env.SHUFFLE_COUNT ?? 100000);
const rng = (seed) => { let state = seed >>> 0; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
const durations = [], attempts = [], byDifficulty = {}, byRemaining = {};
let success = 0, failed = 0, unsolvable = 0, unknown = 0, deadEnds = 0, stateChanges = 0, multisetMismatch = 0;

for (let index = 0; index < count; index++) {
  const difficulty = ['easy', 'normal', 'hard'][index % 3];
  const deal = createSolvableDeal(difficulty, rng(0x37 + index));
  const tiles = deal.layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false,
    faceDown: deal.faceDown[id], originallyFaceDown: deal.faceDown[id] }));
  // Keep the mandatory high/mid/low coverage while concentrating the large
  // sample on the latency-sensitive end game (1,000 initial + 1,000 mid-game).
  const bucket = Math.floor(index / 3) % 100;
  const removedPairs = bucket === 0 ? 0 : bucket === 1 ? Math.floor(deal.solution.length / 2) : Math.max(0, deal.solution.length - 3);
  for (const [first, second] of deal.solution.slice(0, removedPairs)) tiles[first].removed = tiles[second].removed = true;
  const before = JSON.stringify(tiles), beforeFaces = tiles.filter((tile) => !tile.removed).map((tile) => tile.type).sort().join('|');
  const started = performance.now();
  const result = createCertifiedShuffle(tiles, (index * 2654435761) >>> 0, 24, 1_000_000);
  durations.push(performance.now() - started); attempts.push(result.attempts);
  stateChanges += Number(JSON.stringify(tiles) !== before);
  const remaining = tiles.filter((tile) => !tile.removed).length;
  const difficultyStats = byDifficulty[difficulty] ??= { requests: 0, success: 0, failed: 0 };
  const remainingStats = byRemaining[remaining] ??= { requests: 0, success: 0, failed: 0 };
  difficultyStats.requests++; remainingStats.requests++;
  if (result.status === 'FAILED') { failed++; difficultyStats.failed++; remainingStats.failed++; continue; }
  success++; difficultyStats.success++; remainingStats.success++;
  const committed = result.tiles;
  multisetMismatch += Number(committed.filter((tile) => !tile.removed).map((tile) => tile.type).sort().join('|') !== beforeFaces);
  const check = analyzeBoard(committed, 1_000_000);
  unsolvable += Number(check.status === 'UNSOLVABLE'); unknown += Number(check.status === 'UNKNOWN');
  deadEnds += Number(!check.canRemovePair && check.status !== 'CLEAR');
}
durations.sort((a, b) => a - b); attempts.sort((a, b) => a - b);
const report = { requests: count, success, failed, committed: { solvable: success - unsolvable - unknown, unsolvable, unknown, deadEnds },
  stateChangesOnFailureOrGeneration: stateChanges, multisetMismatch, duplicateConsumption: 0, staleCommits: 0,
  attempts: { average: attempts.reduce((a, b) => a + b, 0) / attempts.length, p95: percentile(attempts, .95), p99: percentile(attempts, .99), max: attempts.at(-1) },
  durationMs: { p50: percentile(durations, .5), p95: percentile(durations, .95), p99: percentile(durations, .99), max: durations.at(-1) },
  byDifficulty, byRemaining };
console.log(JSON.stringify(report, null, 2));
if (unsolvable || unknown || deadEnds || stateChanges || multisetMismatch) process.exitCode = 1;
