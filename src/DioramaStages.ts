import {
  analyzeBoard,
  applySolverAction,
  boardStateHash,
  findSolvableRemovalOrder,
  isClear,
  isFreeTile,
  isTrayClear,
  moveTileToTray,
  type RandomSource,
  type SolverAction,
  type TilePosition,
  type TileState,
} from './GameRules.js';
import { createSeparatedTrayChallengeTypes, TILE_FACES } from './BoardLayout.js';

export type DioramaStageId =
  | 'gate'
  | 'bridge'
  | 'tower'
  | 'turtle'
  | 'pyramid'
  | 'fortress'
  | 'pagoda'
  | 'spiral'
  | 'dragon'
  | 'great-wall';

export interface DioramaStage {
  id: DioramaStageId;
  label: string;
  description: string;
  positions: readonly TilePosition[];
  hints: number | null;
  shuffles: number | null;
  hiddenRatio: number;
  trayCapacity: number;
  trayChallenge: boolean;
  gateChallenge: boolean;
  gateDepth?: number;
  pairChoice?: { primaryPairIndex: number; secondaryPairIndex: number };
  camera: { targetZ: number; distanceScale: number };
}

export interface DioramaDeal {
  stageId: DioramaStageId;
  tiles: TileState[];
  solution: SolverAction[];
  removalPairs: Array<readonly [number, number]>;
  stateHash: string;
}

const at = (xs: readonly number[], ys: readonly number[], z: number): TilePosition[] =>
  ys.flatMap((y) => xs.map((x) => ({ x, y, z })));

const grid = (columns: number, rows: number, z: number): TilePosition[] => {
  const xs = Array.from({ length: columns }, (_, index) => index * 2 - (columns - 1));
  const ys = Array.from({ length: rows }, (_, index) => index * 2 - (rows - 1));
  return at(xs, ys, z);
};

// Every board stays inside a six-by-four smartphone footprint. Later levels
// gain tiles and layers instead of becoming wider and shrinking the artwork.
const GATE = [...grid(4, 4, 0), ...grid(4, 2, 1)]; // 24
const TOWER = [...grid(4, 4, 0), ...grid(3, 2, 1), ...grid(2, 2, 2), ...grid(2, 1, 3)]; // 28
const BRIDGE = [...grid(6, 2, 0), ...grid(5, 2, 1), ...grid(4, 2, 2), ...grid(2, 1, 3)]; // 32
const TURTLE = [...grid(5, 4, 0), ...grid(4, 3, 1), ...grid(2, 1, 2), ...grid(2, 1, 3)]; // 36
const PYRAMID = [...grid(5, 4, 0), ...grid(4, 3, 1), ...grid(2, 3, 2), ...grid(2, 1, 3)]; // 40
const FORTRESS = [...grid(6, 4, 0), ...grid(4, 3, 1), ...grid(2, 2, 2), ...grid(2, 1, 3), ...grid(2, 1, 4)]; // 44
const PAGODA = [...grid(5, 4, 0), ...grid(4, 4, 1), ...grid(4, 2, 2), ...grid(2, 2, 3), ...grid(2, 1, 4)]; // 50
const SPIRAL = [...grid(6, 4, 0), ...grid(4, 4, 1), ...grid(4, 2, 2), ...grid(2, 2, 3), ...grid(2, 1, 4), ...grid(2, 1, 5)]; // 56
const DRAGON = [...grid(6, 4, 0), ...grid(5, 4, 1), ...grid(4, 2, 2), ...grid(2, 2, 3), ...grid(2, 2, 4), ...grid(2, 1, 5)]; // 62
const GREAT_WALL = [...grid(6, 4, 0), ...grid(5, 4, 1), ...grid(4, 3, 2), ...grid(3, 2, 3), ...grid(2, 2, 4), ...grid(2, 1, 5)]; // 68

export const DIORAMA_STAGE_ORDER = [
  'gate', 'tower', 'bridge', 'turtle', 'pyramid',
  'fortress', 'pagoda', 'spiral', 'dragon', 'great-wall',
] as const;

export const DIORAMA_STAGES: Readonly<Record<DioramaStageId, DioramaStage>> = {
  gate: { id: 'gate', label: 'Gate', description: '24 tiles · two open layers.', positions: GATE, hints: null, shuffles: null, hiddenRatio: 0, trayCapacity: 5, trayChallenge: false, gateChallenge: false, camera: { targetZ: 0.8, distanceScale: 1 } },
  tower: { id: 'tower', label: 'Tower', description: '28 tiles · climb four storeys.', positions: TOWER, hints: 5, shuffles: 4, hiddenRatio: 0.04, trayCapacity: 5, trayChallenge: false, gateChallenge: false, camera: { targetZ: 0.8, distanceScale: 1 } },
  bridge: { id: 'bridge', label: 'Bridge', description: '32 tiles · clear the raised span.', positions: BRIDGE, hints: 4, shuffles: 3, hiddenRatio: 0.07, trayCapacity: 4, trayChallenge: true, gateChallenge: false, camera: { targetZ: 1, distanceScale: 1 } },
  turtle: { id: 'turtle', label: 'Turtle', description: '36 tiles · unlock the shell.', positions: TURTLE, hints: 4, shuffles: 3, hiddenRatio: 0.10, trayCapacity: 4, trayChallenge: true, gateChallenge: false, camera: { targetZ: 1, distanceScale: 1 } },
  pyramid: { id: 'pyramid', label: 'Pyramid', description: '40 tiles · choose the right pair through the core.', positions: PYRAMID, hints: 3, shuffles: 2, hiddenRatio: 0.13, trayCapacity: 3, trayChallenge: true, gateChallenge: false, pairChoice: { primaryPairIndex: 12, secondaryPairIndex: 13 }, camera: { targetZ: 1.2, distanceScale: 1 } },
  fortress: { id: 'fortress', label: 'Fortress', description: '44 tiles · one gold key opens the sealed core.', positions: FORTRESS, hints: 3, shuffles: 2, hiddenRatio: 0.17, trayCapacity: 3, trayChallenge: true, gateChallenge: true, gateDepth: 1, pairChoice: { primaryPairIndex: 1, secondaryPairIndex: 2 }, camera: { targetZ: 1.2, distanceScale: 1 } },
  pagoda: { id: 'pagoda', label: 'Pagoda', description: '50 tiles · two keys unseal the nested eaves.', positions: PAGODA, hints: 2, shuffles: 1, hiddenRatio: 0.20, trayCapacity: 3, trayChallenge: true, gateChallenge: true, gateDepth: 2, pairChoice: { primaryPairIndex: 2, secondaryPairIndex: 4 }, camera: { targetZ: 1.4, distanceScale: 1 } },
  spiral: { id: 'spiral', label: 'Spiral', description: '56 tiles · pair safely through two sealed turns.', positions: SPIRAL, hints: 2, shuffles: 1, hiddenRatio: 0.24, trayCapacity: 3, trayChallenge: true, gateChallenge: true, gateDepth: 2, pairChoice: { primaryPairIndex: 1, secondaryPairIndex: 17 }, camera: { targetZ: 1.5, distanceScale: 1 } },
  dragon: { id: 'dragon', label: 'Dragon', description: '62 tiles · three keys open the raised body.', positions: DRAGON, hints: 1, shuffles: 0, hiddenRatio: 0.28, trayCapacity: 3, trayChallenge: true, gateChallenge: true, gateDepth: 3, camera: { targetZ: 1.5, distanceScale: 1 } },
  'great-wall': { id: 'great-wall', label: 'Great Wall', description: '68 tiles · breach four seals with no rescue.', positions: GREAT_WALL, hints: 0, shuffles: 0, hiddenRatio: 0.32, trayCapacity: 3, trayChallenge: true, gateChallenge: true, gateDepth: 4, camera: { targetZ: 1.5, distanceScale: 1 } },
};

const removalOrders = new Map<DioramaStageId, Array<readonly [number, number]>>();

function removalOrder(stage: DioramaStage): Array<readonly [number, number]> {
  const cached = removalOrders.get(stage.id);
  if (cached) return cached;
  const order = findSolvableRemovalOrder(stage.positions, () => 0.5);
  removalOrders.set(stage.id, order);
  return order;
}

function shuffle<T>(source: readonly T[], random: RandomSource): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random source must return a finite value in [0, 1)');
    const swap = Math.floor(value * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pairChoiceTileIds(stage: DioramaStage, order: readonly (readonly [number, number])[]): Set<number> {
  if (!stage.pairChoice) return new Set<number>();
  const { primaryPairIndex, secondaryPairIndex } = stage.pairChoice;
  if (primaryPairIndex === secondaryPairIndex || !order[primaryPairIndex] || !order[secondaryPairIndex]) {
    throw new Error(`${stage.id} has an invalid pair-choice configuration`);
  }
  return new Set([...order[primaryPairIndex], ...order[secondaryPairIndex]]);
}

function gateKeyTileIds(stage: DioramaStage, order: readonly (readonly [number, number])[]): Set<number> {
  if (!stage.gateChallenge) return new Set<number>();
  const depth = stage.gateDepth ?? 0;
  if (depth < 1 || depth >= order.length) throw new Error(`${stage.id} has an invalid gate depth`);
  return new Set(order.slice(0, depth).flatMap((pair) => [...pair]));
}

function protectedHiddenTileIds(stage: DioramaStage, order: readonly (readonly [number, number])[]): Set<number> {
  return new Set([...pairChoiceTileIds(stage, order), ...gateKeyTileIds(stage, order)]);
}

function hiddenForStage(
  stage: DioramaStage,
  order: readonly (readonly [number, number])[],
  random: RandomSource,
  protectedTileIds: ReadonlySet<number> = new Set<number>(),
): Set<number> {
  const hiddenTarget = Math.round(stage.positions.length * stage.hiddenRatio);
  const hiddenCandidates = shuffle(order
    .filter(([first, second]) => !protectedTileIds.has(first) && !protectedTileIds.has(second))
    .map(([first, second]) => random() < 0.5 ? first : second), random);
  if (hiddenCandidates.length < hiddenTarget) throw new Error(`${stage.id} has too few unprotected hidden-tile candidates`);
  return new Set(hiddenCandidates.slice(0, hiddenTarget));
}

function applyPairChoiceTypes(
  stage: DioramaStage,
  order: readonly (readonly [number, number])[],
  source: readonly string[],
): string[] {
  const types = [...source];
  if (!stage.pairChoice) return types;
  const primary = order[stage.pairChoice.primaryPairIndex];
  const secondary = order[stage.pairChoice.secondaryPairIndex];
  const repeatedFace = types[primary[0]];
  types[secondary[0]] = repeatedFace;
  types[secondary[1]] = repeatedFace;
  return types;
}

function buildTiles(stage: DioramaStage, types: readonly string[], hidden: ReadonlySet<number>): TileState[] {
  return stage.positions.map((position, id): TileState => ({
    id, type: types[id], ...position, removed: false,
    faceDown: hidden.has(id), originallyFaceDown: hidden.has(id),
  }));
}

function applyGateMetadata(
  stage: DioramaStage,
  order: readonly (readonly [number, number])[],
  source: readonly TileState[],
): TileState[] {
  if (!stage.gateChallenge) return source.map((tile) => ({ ...tile }));
  const depth = stage.gateDepth ?? 0;
  if (depth < 1 || depth >= order.length) throw new Error(`${stage.id} has an invalid gate depth`);

  const checkpoint = source.map((tile) => ({ ...tile }));
  const pairChoiceIds = pairChoiceTileIds(stage, order);
  const pairIndexByTile = new Map<number, number>();
  order.forEach((pair, pairIndex) => pair.forEach((tileId) => pairIndexByTile.set(tileId, pairIndex)));
  const keyByTile = new Map<number, string>();
  const groupByTile = new Map<number, string>();

  for (let step = 0; step < depth; step++) {
    const gateId = `${stage.id}:seal-${step + 1}`;
    const keyPair = order[step];
    const keys = new Set(keyPair);
    keyPair.forEach((tileId) => keyByTile.set(tileId, gateId));

    // Seal alternate FREE branches at this checkpoint. Always include the
    // next certified pair so sparse layouts still form a visible key chain.
    const sealed = new Set([
      ...checkpoint.filter((tile) => !keys.has(tile.id) && !pairChoiceIds.has(tile.id) && isFreeTile(tile, checkpoint)).map((tile) => tile.id),
      ...order[step + 1],
    ]);
    sealed.forEach((tileId) => {
      if ((pairIndexByTile.get(tileId) ?? -1) > step) groupByTile.set(tileId, gateId);
    });
    keyPair.forEach((tileId) => { checkpoint[tileId].removed = true; });
  }

  for (const gateId of new Set(keyByTile.values())) {
    if (![...groupByTile.values()].includes(gateId)) throw new Error(`${stage.id} has an empty sealed area for ${gateId}`);
  }
  return source.map((tile) => ({
    ...tile,
    gateKey: keyByTile.get(tile.id),
    gateGroup: groupByTile.get(tile.id),
  }));
}

/** Creates a deal whose recorded actions are a complete, canonical-rule replay.
 * Hidden choices contain at most one end of a required pair, so a reveal can
 * always be immediately followed by that pair's removal. */
export function createDioramaDeal(stageId: DioramaStageId, random: RandomSource = Math.random): DioramaDeal {
  const stage = DIORAMA_STAGES[stageId];
  if (!stage) throw new Error(`Unknown diorama stage: ${stageId}`);
  const order = removalOrder(stage);
  const pairFaces = shuffle(Array.from({ length: order.length }, (_, index) => TILE_FACES[index % TILE_FACES.length]), random);
  const sourceTypes = Array<string>(stage.positions.length);
  order.forEach(([first, second], index) => { sourceTypes[first] = sourceTypes[second] = pairFaces[index]; });
  const types = applyPairChoiceTypes(stage, order, sourceTypes);

  const hidden = hiddenForStage(stage, order, random, protectedHiddenTileIds(stage, order));
  const tiles = applyGateMetadata(stage, order, buildTiles(stage, types, hidden));
  const solution: SolverAction[] = [];
  for (const [firstId, secondId] of order) {
    const hiddenId = hidden.has(firstId) ? firstId : hidden.has(secondId) ? secondId : null;
    if (hiddenId !== null) solution.push({ kind: 'reveal', tileId: hiddenId });
    solution.push({ kind: 'pair', firstId, secondId });
  }
  if (!replayDioramaCertificate(tiles, solution)) throw new Error(`${stageId} generated an invalid certificate`);
  return { stageId, tiles, solution, removalPairs: order.map((pair) => [...pair] as const), stateHash: boardStateHash(tiles) };
}

/** Higher tray stages intentionally keep several unmatched faces in storage.
 * The certified route stays near capacity while later free tiles rescue them. */
export function createDioramaTrayDeal(stageId: DioramaStageId, random: RandomSource = Math.random): DioramaDeal {
  const stage = DIORAMA_STAGES[stageId];
  if (!stage) throw new Error(`Unknown diorama stage: ${stageId}`);
  if (!stage.trayChallenge) return createDioramaDeal(stageId, random);
  const order = removalOrder(stage);
  const types = createSeparatedTrayChallengeTypes(stage.positions, order, stage.trayCapacity, random);
  const pairOnlyTiles = applyGateMetadata(stage, order, buildTiles(stage, types, new Set<number>()));
  if (analyzeBoard(pairOnlyTiles, 100_000).status !== 'UNSOLVABLE') throw new Error(`${stageId} tray deal still has a pair-only solution`);
  const hidden = hiddenForStage(stage, order, random, gateKeyTileIds(stage, order));
  const tiles = applyGateMetadata(stage, order, buildTiles(stage, types, hidden));
  const solution: SolverAction[] = [];
  for (const [firstId, secondId] of order) {
    for (const tileId of [firstId, secondId]) {
      if (hidden.has(tileId)) solution.push({ kind: 'reveal', tileId });
      solution.push({ kind: 'tray', tileId });
    }
  }
  if (!replayDioramaTrayCertificate(tiles, solution, stage.trayCapacity)) throw new Error(`${stageId} generated an invalid tray certificate`);
  return { stageId, tiles, solution, removalPairs: order.map((pair) => [...pair] as const), stateHash: boardStateHash(tiles) };
}

export function replayDioramaCertificate(initial: readonly TileState[], solution: readonly SolverAction[]): boolean {
  let state = initial.map((tile) => ({ ...tile }));
  for (const action of solution) {
    const next = applySolverAction(state, action);
    if (!next) return false;
    state = next;
  }
  return isClear(state);
}

export function replayDioramaTrayCertificate(initial: readonly TileState[], solution: readonly SolverAction[], capacity: number): boolean {
  const state = initial.map((tile) => ({ ...tile }));
  let tray: TileState[] = [];
  for (const action of solution) {
    if (action.kind === 'reveal') {
      const tile = state.find((candidate) => candidate.id === action.tileId);
      if (!tile || !tile.faceDown || !isFreeTile(tile, state)) return false;
      state.forEach((candidate) => {
        if (!candidate.removed && candidate.originallyFaceDown) candidate.faceDown = candidate.id !== tile.id;
      });
      continue;
    }
    if (action.kind !== 'tray') return false;
    const tile = state.find((candidate) => candidate.id === action.tileId);
    if (!tile) return false;
    const nextTray = moveTileToTray(tile, state, tray, capacity);
    if (!nextTray) return false;
    tray = nextTray;
  }
  return isTrayClear(state, tray);
}
