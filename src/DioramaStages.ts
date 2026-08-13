import {
  applySolverAction,
  boardStateHash,
  findSolvableRemovalOrder,
  isClear,
  type RandomSource,
  type SolverAction,
  type TilePosition,
  type TileState,
} from './GameRules.js';
import { TILE_FACES } from './BoardLayout.js';

export type DioramaStageId = 'gate' | 'tower' | 'bridge' | 'dragon';

export interface DioramaStage {
  id: DioramaStageId;
  label: string;
  description: string;
  positions: readonly TilePosition[];
  hints: number | null;
  shuffles: number | null;
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

// A pair of broad feet, narrowing pillars and a cap make the opening legible.
const GATE = [
  ...at([-5, -3, 3, 5], [-2, 0, 2], 0),
  ...at([-1, 1], [-2, 2], 0),
  ...at([-4, -2, 0, 2, 4], [-1, 1], 1),
  ...at([-3, -1, 1, 3], [0], 2),
];

// Alternating odd/even grids centre each progressively smaller storey.
const TOWER = [
  ...at([-3, -1, 1, 3], [-3, -1, 1, 3], 0),
  ...at([-2, 0, 2], [-1, 1], 1),
  ...at([-1, 1], [-1, 1], 2),
  ...at([-1, 1], [0], 3),
];

// Two low banks support a narrow raised deck and central upper rail.
const BRIDGE = [
  ...at([-5, -3, -1, 1, 3, 5], [-2, 2], 0),
  ...at([-4, -2, 0, 2, 4], [-1, 1], 1),
  ...at([-3, -1, 1, 3], [0], 2),
];

// A winding, two-tile-thick body ends in a raised four-tile head and crest.
const DRAGON = [
  ...at([-5, -3, -1, 1], [-4, -2], 0),
  ...at([-1, 1], [0], 0), ...at([-1], [2], 0),
  ...at([1, 3, 5], [2, 4], 0),
  ...at([-3], [0], 0),
  ...at([-4, -2, 0], [-3], 1), ...at([0], [-1, 1], 1), ...at([2, 4], [3], 1),
  ...at([3, 5], [3, 5], 1),
  ...at([4], [4], 2),
];

export const DIORAMA_STAGE_ORDER = ['gate', 'tower', 'bridge', 'dragon'] as const;

export const DIORAMA_STAGES: Readonly<Record<DioramaStageId, DioramaStage>> = {
  gate: { id: 'gate', label: 'Gate', description: 'Open the side pillars to release the raised lintel.', positions: GATE, hints: 3, shuffles: 2, camera: { targetZ: 0.8, distanceScale: 1 } },
  tower: { id: 'tower', label: 'Tower', description: 'Work inward through four compact storeys to the summit.', positions: TOWER, hints: 2, shuffles: 2, camera: { targetZ: 1.2, distanceScale: 0.9 } },
  bridge: { id: 'bridge', label: 'Bridge', description: 'Clear both banks to bring down the raised central span.', positions: BRIDGE, hints: 2, shuffles: 1, camera: { targetZ: 0.8, distanceScale: 1.1 } },
  dragon: { id: 'dragon', label: 'Dragon', description: 'Follow the winding body toward its raised head and crest.', positions: DRAGON, hints: 1, shuffles: 1, camera: { targetZ: 0.9, distanceScale: 1.15 } },
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

  const hiddenTarget = Math.round(stage.positions.length * 0.15);
  const hiddenCandidates = shuffle(order.map(([first, second]) => random() < 0.5 ? first : second), random);
  const hidden = new Set(hiddenCandidates.slice(0, hiddenTarget));
  const tiles = stage.positions.map((position, id): TileState => ({
    id, type: types[id], ...position, removed: false,
    faceDown: hidden.has(id), originallyFaceDown: hidden.has(id),
  }));
  const solution: SolverAction[] = [];
  for (const [firstId, secondId] of order) {
    const hiddenId = hidden.has(firstId) ? firstId : hidden.has(secondId) ? secondId : null;
    if (hiddenId !== null) solution.push({ kind: 'reveal', tileId: hiddenId });
    solution.push({ kind: 'pair', firstId, secondId });
  }
  if (!replayDioramaCertificate(tiles, solution)) throw new Error(`${stageId} generated an invalid certificate`);
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
