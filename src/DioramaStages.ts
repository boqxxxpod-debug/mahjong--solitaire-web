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
  gate: { id: 'gate', label: 'Gate', description: '24 tiles · two open layers.', positions: GATE, hints: null, shuffles: null, hiddenRatio: 0, trayCapacity: 5, trayChallenge: false, camera: { targetZ: 0.8, distanceScale: 1 } },
  tower: { id: 'tower', label: 'Tower', description: '28 tiles · climb four storeys.', positions: TOWER, hints: 5, shuffles: 4, hiddenRatio: 0.04, trayCapacity: 5, trayChallenge: false, camera: { targetZ: 0.8, distanceScale: 1 } },
  bridge: { id: 'bridge', label: 'Bridge', description: '32 tiles · clear the raised span.', positions: BRIDGE, hints: 4, shuffles: 3, hiddenRatio: 0.07, trayCapacity: 4, trayChallenge: true, camera: { targetZ: 1, distanceScale: 1 } },
  turtle: { id: 'turtle', label: 'Turtle', description: '36 tiles · unlock the shell.', positions: TURTLE, hints: 4, shuffles: 3, hiddenRatio: 0.10, trayCapacity: 4, trayChallenge: true, camera: { targetZ: 1, distanceScale: 1 } },
  pyramid: { id: 'pyramid', label: 'Pyramid', description: '40 tiles · work down the core.', positions: PYRAMID, hints: 3, shuffles: 2, hiddenRatio: 0.13, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.2, distanceScale: 1 } },
  fortress: { id: 'fortress', label: 'Fortress', description: '44 tiles · breach five layers.', positions: FORTRESS, hints: 3, shuffles: 2, hiddenRatio: 0.16, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.2, distanceScale: 1 } },
  pagoda: { id: 'pagoda', label: 'Pagoda', description: '50 tiles · dismantle the eaves.', positions: PAGODA, hints: 2, shuffles: 1, hiddenRatio: 0.18, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.4, distanceScale: 1 } },
  spiral: { id: 'spiral', label: 'Spiral', description: '56 tiles · read the six layers.', positions: SPIRAL, hints: 2, shuffles: 1, hiddenRatio: 0.20, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.5, distanceScale: 1 } },
  dragon: { id: 'dragon', label: 'Dragon', description: '62 tiles · open the raised body.', positions: DRAGON, hints: 1, shuffles: 0, hiddenRatio: 0.23, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.5, distanceScale: 1 } },
  'great-wall': { id: 'great-wall', label: 'Great Wall', description: '68 tiles · no rescue remains.', positions: GREAT_WALL, hints: 0, shuffles: 0, hiddenRatio: 0.25, trayCapacity: 3, trayChallenge: true, camera: { targetZ: 1.5, distanceScale: 1 } },
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

function hiddenForStage(stage: DioramaStage, order: readonly (readonly [number, number])[], random: RandomSource): Set<number> {
  const hiddenTarget = Math.round(stage.positions.length * stage.hiddenRatio);
  const hiddenCandidates = shuffle(order.map(([first, second]) => random() < 0.5 ? first : second), random);
  return new Set(hiddenCandidates.slice(0, hiddenTarget));
}

function buildTiles(stage: DioramaStage, types: readonly string[], hidden: ReadonlySet<number>): TileState[] {
  return stage.positions.map((position, id): TileState => ({
    id, type: types[id], ...position, removed: false,
    faceDown: hidden.has(id), originallyFaceDown: hidden.has(id),
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
  const types = Array<string>(stage.positions.length);
  order.forEach(([first, second], index) => { types[first] = types[second] = pairFaces[index]; });

  const hidden = hiddenForStage(stage, order, random);
  const tiles = buildTiles(stage, types, hidden);
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
  const pairOnlyTiles = buildTiles(stage, types, new Set<number>());
  if (analyzeBoard(pairOnlyTiles, 100_000).status !== 'UNSOLVABLE') throw new Error(`${stageId} tray deal still has a pair-only solution`);
  const hidden = hiddenForStage(stage, order, random);
  const tiles = buildTiles(stage, types, hidden);
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
