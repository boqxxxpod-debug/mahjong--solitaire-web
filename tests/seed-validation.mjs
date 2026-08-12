import { isFreeTile } from '../.test-dist/GameRules.js';
import { createSolvableDeal } from '../.test-dist/BoardLayout.js';

const count = Number(process.argv[2] ?? 1000);
for (const difficulty of ['easy', 'normal', 'hard']) {
  const totals = { boards: count, solvable: 0, deadEnd: 0, unsolvable: 0, nodes: 0, maxDepth: 0, cycles: 0 };
  const started = performance.now();
  for (let seed = 1; seed <= count; seed++) {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const deal = createSolvableDeal(difficulty, random);
    const tiles = deal.layout.map(({ face: type, ...position }, id) => ({
      id, type, ...position, removed: false, faceDown: deal.faceDown[id], originallyFaceDown: deal.faceDown[id],
    }));
    let valid = true, actions = 0;
    for (const [firstId, secondId] of deal.solution) {
      const first = tiles[firstId], second = tiles[secondId];
      for (const tile of [first, second]) if (tile.faceDown) {
        if (!isFreeTile(tile, tiles)) valid = false;
        tiles.forEach((other) => { if (other.originallyFaceDown) other.faceDown = other.id !== tile.id; });
        actions++;
      }
      if (first.faceDown || second.faceDown || first.type !== second.type || !isFreeTile(first, tiles) || !isFreeTile(second, tiles)) valid = false;
      first.removed = second.removed = true; actions++;
    }
    totals.solvable += Number(valid && tiles.every((tile) => tile.removed));
    totals.deadEnd += Number(!valid && actions === 0);
    totals.unsolvable += Number(!valid && actions > 0);
    totals.nodes += actions + 1;
    totals.maxDepth = Math.max(totals.maxDepth, actions);
  }
  console.log(JSON.stringify({ difficulty, ...totals, averageNodes: Math.round(totals.nodes / count), milliseconds: Math.round(performance.now() - started) }));
  if (totals.solvable !== count) process.exitCode = 1;
}
