import fs from 'node:fs';
import path from 'node:path';
import { createFaceDownFlags, generateSolvableTypes, getAvailablePairs, isFreeTile, shuffleActiveTypes } from '../.test-dist/GameRules.js';
import { createSolvableDeal, DIFFICULTIES, TILE_FACES } from '../.test-dist/BoardLayout.js';

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, raw = 'true'] = value.replace(/^--/, '').split('='); return [key, raw];
}));
const count = Number(args.count ?? process.env.SEED_COUNT ?? 10_000);
const output = args.output;
if (!Number.isSafeInteger(count) || count < 1) throw new Error('--count must be a positive integer');

const rng = (seed) => {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};
const shuffled = (values, random) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const faces = (length) => Array.from({ length }, (_, i) => TILE_FACES[Math.floor(i / 2) % TILE_FACES.length]);
const pairFaces = (count) => Array.from({ length: count }, (_, i) => TILE_FACES[i % TILE_FACES.length]);

function makeBoard(round, difficulty, seed) {
  const random = rng(seed);
  const positions = DIFFICULTIES[difficulty].positions;
  if (round === 'certified-hidden') {
    const deal = createSolvableDeal(difficulty, random);
    const board = deal.layout.map(({ face: type, ...position }, id) => ({ id, type, ...position, removed: false,
      faceDown: deal.faceDown[id], originallyFaceDown: deal.faceDown[id] }));
    board.solution = deal.solution; return board;
  }
  const types = round === 'random-deal'
    ? shuffled(faces(positions.length), random)
    : difficulty === 'hard'
      ? createSolvableDeal(difficulty, random).layout.map(({ face }) => face)
      : generateSolvableTypes(positions, pairFaces(positions.length / 2), random);
  const hidden = createFaceDownFlags(positions, difficulty, random);
  return positions.map((position, id) => ({ id, type: types[id], ...position, removed: false,
    faceDown: hidden[id], originallyFaceDown: hidden[id] }));
}

function play(source, allowShuffle) {
  const tiles = source.map((tile) => ({ ...tile }));
  let pairs = 0, moves = 0, nodes = 0, reveals = 0, shuffles = 0;
  const initiallyPairless = getAvailablePairs(tiles).length === 0;
  // A reverse-generated deal carries a proof. Replay that proof rather than
  // confusing a deliberately naive greedy player's choices with solvability.
  if (source.solution && !allowShuffle) {
    for (const [firstId, secondId] of source.solution) {
      const first = tiles[firstId], second = tiles[secondId]; nodes++;
      for (const tile of [first, second]) if (tile.faceDown) {
        if (!isFreeTile(tile, tiles)) return { cleared: false, category: pairs ? 'removal-order-dead-end' : 'hidden-reveal-no-removal', pairs, moves, nodes, reveals, shuffles, initiallyPairless };
        tiles.forEach((other) => { if (other.originallyFaceDown) other.faceDown = other.id !== tile.id; }); reveals++; moves++;
      }
      if (first.faceDown || second.faceDown || first.type !== second.type || !isFreeTile(first, tiles) || !isFreeTile(second, tiles))
        return { cleared: false, category: pairs ? 'removal-order-dead-end' : 'initial-dead-end', pairs, moves, nodes, reveals, shuffles, initiallyPairless };
      first.removed = second.removed = true; pairs++; moves++;
    }
    return { cleared: true, category: null, pairs, moves, nodes, reveals, shuffles, initiallyPairless };
  }
  while (pairs * 2 < tiles.length) {
    nodes++;
    const pair = getAvailablePairs(tiles)[0];
    if (pair) {
      pair[0].removed = pair[1].removed = true; pairs++; moves++; continue;
    }
    const freeVisible = tiles.filter((tile) => !tile.removed && !tile.faceDown && isFreeTile(tile, tiles));
    const reveal = tiles.find((tile) => !tile.removed && tile.faceDown && isFreeTile(tile, tiles)
      && freeVisible.some((visible) => visible.type === tile.type));
    if (reveal) {
      tiles.forEach((tile) => { if (tile.originallyFaceDown) tile.faceDown = tile.id !== reveal.id; });
      reveals++; moves++; continue;
    }
    if (allowShuffle && shuffles === 0) {
      try { shuffleActiveTypes(tiles, rng(0x9e3779b9 + pairs)); shuffles++; moves++; continue; }
      catch { /* Some partially removed geometries have no complete reverse deal. */ }
    }
    const freeHidden = tiles.filter((tile) => !tile.removed && tile.faceDown && isFreeTile(tile, tiles));
    const category = pairs === 0
      ? freeHidden.length > 1 ? 'reveal-cycle-no-removal' : freeHidden.length ? 'hidden-reveal-no-removal' : 'initial-dead-end'
      : 'removal-order-dead-end';
    return { cleared: false, category, pairs, moves, nodes, reveals, shuffles, initiallyPairless };
  }
  return { cleared: true, category: null, pairs, moves, nodes, reveals, shuffles, initiallyPairless };
}

const rounds = ['random-deal', 'reverse-generated', 'certified-hidden'];
const results = [];
for (const round of rounds) for (const difficulty of ['easy', 'normal', 'hard']) {
  const started = performance.now();
  const summary = { round, difficulty, seeds: count, clear: 0, initialDeadEnds: 0, midgameDeadEnds: 0,
    initialPairless: 0, cycles: 0, hiddenNoRemoval: 0, totalPairs: 0, totalMoves: 0, totalNodes: 0,
    maxNodes: 0, withShuffleClear: 0, failures: {} };
  for (let seed = 1; seed <= count; seed++) {
    const board = makeBoard(round, difficulty, seed);
    const result = play(board, false);
    const shuffledResult = result.cleared || difficulty === 'hard' ? result : play(board, true);
    summary.clear += Number(result.cleared);
    summary.withShuffleClear += Number(shuffledResult.cleared);
    summary.initialDeadEnds += Number(!result.cleared && result.pairs === 0);
    summary.midgameDeadEnds += Number(!result.cleared && result.pairs > 0);
    summary.initialPairless += Number(result.initiallyPairless); summary.cycles += Number(result.category === 'reveal-cycle-no-removal');
    summary.hiddenNoRemoval += Number(result.category === 'hidden-reveal-no-removal');
    summary.totalPairs += result.pairs; summary.totalMoves += result.moves; summary.totalNodes += result.nodes;
    summary.maxNodes = Math.max(summary.maxNodes, result.nodes);
    if (result.category) (summary.failures[result.category] ??= []).length < 10 && summary.failures[result.category].push(seed);
  }
  summary.clearRate = summary.clear / count; summary.initialDeadEndRate = summary.initialDeadEnds / count;
  summary.midgameDeadEndRate = summary.midgameDeadEnds / count; summary.cycleRate = summary.cycles / count;
  summary.averagePairs = summary.totalPairs / count; summary.averageMoves = summary.totalMoves / count;
  summary.averageNodes = summary.totalNodes / count; summary.withShuffleClearRate = summary.withShuffleClear / count;
  summary.elapsedMs = Math.round(performance.now() - started); results.push(summary);
  console.log(JSON.stringify(summary));
}
const artifact = { schemaVersion: 1, seedRange: [1, count], generator: 'LCG(1664525,1013904223)', generatedAt: new Date().toISOString(), results };
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`); }
if (results.filter(({ round }) => round === 'certified-hidden').some(({ clear }) => clear !== count)) process.exitCode = 1;
