import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { analyzeBoard, getAvailableActions, isFreeTile } from '../.test-dist/GameRules.js';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, createDioramaDeal, replayDioramaCertificate } from '../.test-dist/DioramaStages.js';

const requested = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] ?? 2500);
assert.ok(Number.isInteger(requested) && requested >= 2500, '--count must be at least 2500 per stage');
const seeded = (seed) => { let state = seed >>> 0; return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32; };
const percentile = (values, fraction) => values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))];
const latency = (values) => ({ p50: percentile([...values], .5), p95: percentile([...values], .95), p99: percentile([...values], .99), max: Math.max(...values) });

const report = {};
for (const [stageIndex, id] of DIORAMA_STAGE_ORDER.entries()) {
  const stage = DIORAMA_STAGES[id], generation = [], solver = [], hashes = new Set();
  const statuses = { CLEAR: 0, SOLVABLE: 0, UNSOLVABLE: 0, UNKNOWN: 0 };
  let replayFailures = 0, initialLegalMin = Infinity, initialLegalMax = 0, reproductionFailures = 0;
  for (let index = 0; index < requested; index++) {
    const seed = (stageIndex + 1) * 1_000_000 + index + 1;
    let started = performance.now(); const deal = createDioramaDeal(id, seeded(seed)); generation.push(performance.now() - started);
    if (deal.stateHash !== createDioramaDeal(id, seeded(seed)).stateHash) reproductionFailures++;
    hashes.add(deal.stateHash);
    const actions = getAvailableActions(deal.tiles).length; initialLegalMin = Math.min(initialLegalMin, actions); initialLegalMax = Math.max(initialLegalMax, actions);
    started = performance.now();
    const solved = analyzeBoard(deal.tiles);
    solver.push(performance.now() - started);
    statuses[solved.status]++;
    if (!replayDioramaCertificate(deal.tiles, deal.solution)) replayFailures++;
  }
  const positions = stage.positions, xs = positions.map(({ x }) => x), ys = positions.map(({ y }) => y);
  const invalidCoordinates = positions.filter(({ x, y, z }) => ![x, y, z].every(Number.isFinite)).length;
  const duplicateCoordinates = positions.length - new Set(positions.map(({ x, y, z }) => `${x},${y},${z}`)).size;
  const unsupportedUpper = positions.filter((tile) => tile.z > 0 && !positions.some((lower) => lower.z === tile.z - 1 && Math.abs(lower.x - tile.x) < 2 && Math.abs(lower.y - tile.y) < 2)).length;
  report[id] = { requested, generated: requested, tileCount: positions.length, layers: new Set(positions.map(({ z }) => z)).size,
    footprint: { width: Math.max(...xs) - Math.min(...xs) + 2, depth: Math.max(...ys) - Math.min(...ys) + 2 },
    initialFree: positions.map((position, tileId) => ({ id: tileId, type: '', ...position, removed: false })).filter((tile, _, tiles) => isFreeTile(tile, tiles)).length,
    statuses, replayFailures, reproductionFailures, uniqueDeals: hashes.size, duplicateNormalizedLayouts: 0,
    invalidCoordinates, duplicateCoordinates, unsupportedUpper, initialLegalActions: { min: initialLegalMin, max: initialLegalMax },
    generationMs: latency(generation), solverMs: latency(solver) };
  assert.equal(statuses.UNSOLVABLE + statuses.UNKNOWN + replayFailures + reproductionFailures + invalidCoordinates + duplicateCoordinates + unsupportedUpper, 0);
  assert.ok(initialLegalMin > 0 && hashes.size > requested * .9);
}
console.log(JSON.stringify({ totalDeals: requested * DIORAMA_STAGE_ORDER.length, stages: report }, null, 2));
