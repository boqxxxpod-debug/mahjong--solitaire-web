import * as THREE from 'three';
import {
  BoardGeometry,
  TILE_DEPTH,
  TILE_HEIGHT,
  TILE_LAYER_DEPTH_OFFSET,
  TILE_LAYER_HEIGHT,
  TILE_ROW_STRIDE,
  TILE_WIDTH,
} from './BoardGeometry';
import { Tile } from './Tile';
import { analyzeBoard, applySolverAction, boardStateHash, hasAvailableAction, isFreeTile, isGateLocked, isTileUncovered } from './GameRules';
import type { AvailableAction, PlayRule, SearchResult, SolverAction, TileState } from './GameRules';
import { createSolvableDeal, createTrayChallengeDeal, DIFFICULTIES, Difficulty } from './BoardLayout';
import { createDioramaDeal, createDioramaTrayDeal, DIORAMA_STAGES, type DioramaStageId } from './DioramaStages';
import { hasForcedTrayStorageMoment } from './TrayChallenge';
import type { TilePosition } from './GameRules';

function layoutBounds(positions: readonly TilePosition[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  positions.forEach(({ x, y, z }) => {
    const center = new THREE.Vector3(
      x * TILE_WIDTH * 0.5,
      z * TILE_LAYER_HEIGHT,
      y * TILE_ROW_STRIDE + z * TILE_LAYER_DEPTH_OFFSET,
    );
    bounds.expandByPoint(center.clone().add(new THREE.Vector3(-TILE_WIDTH / 2, -TILE_HEIGHT / 2, -TILE_DEPTH / 2)));
    bounds.expandByPoint(center.clone().add(new THREE.Vector3(TILE_WIDTH / 2, TILE_HEIGHT / 2, TILE_DEPTH / 2)));
  });
  return bounds;
}

const CAMERA_REFERENCE_BOUNDS = layoutBounds([
  ...Object.values(DIFFICULTIES).flatMap((config) => config.positions),
  ...Object.values(DIORAMA_STAGES).flatMap((stage) => stage.positions),
]);

interface InitialTileDefinition { type: string; faceDown: boolean; gateKey?: string; gateGroup?: string }

export class BoardManager {
  tiles: Tile[] = [];
  private readonly geometry = new BoardGeometry();
  private seedState: number;
  private initialDeal: InitialTileDefinition[] = [];
  private hintPlan: SolverAction[] = [];
  private hintPlanStateHash?: string;
  private hintPlanNextHash?: string;
  private dealPlayRule: PlayRule = 'pair';
  private currentDioramaStageId?: DioramaStageId;

  constructor(private readonly scene: THREE.Scene, public difficulty: Difficulty = 'normal') {
    const seed = new URLSearchParams(location.search).get('seed');
    this.seedState = seed === null ? Math.floor(Math.random() * 0xffffffff) : this.hashSeed(seed);
    this.newDeal(difficulty);
  }

  newDioramaDeal(stageId: DioramaStageId): void {
    const random = () => ((this.seedState = (this.seedState * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const playRule = this.preferredPlayRule();
    const deal = playRule === 'tray' ? createDioramaTrayDeal(stageId, random) : createDioramaDeal(stageId, random);
    const stage = DIORAMA_STAGES[stageId];
    if (playRule === 'tray' && stage.trayChallenge &&
      !hasForcedTrayStorageMoment(deal.tiles, deal.removalPairs.flat(), stage.trayCapacity)) {
      throw new Error(`${stageId} tray deal does not force a zero-pair storage moment`);
    }
    this.dealPlayRule = playRule; this.currentDioramaStageId = stageId;
    this.replaceTiles(deal.tiles);
  }

  restoreDioramaGeometry(stageId: DioramaStageId): void {
    const playRule = this.preferredPlayRule();
    const deal = playRule === 'tray' ? createDioramaTrayDeal(stageId, () => 0.5) : createDioramaDeal(stageId, () => 0.5);
    const stage = DIORAMA_STAGES[stageId];
    if (playRule === 'tray' && stage.trayChallenge &&
      !hasForcedTrayStorageMoment(deal.tiles, deal.removalPairs.flat(), stage.trayCapacity)) {
      throw new Error(`${stageId} restored tray deal does not force a zero-pair storage moment`);
    }
    this.dealPlayRule = playRule; this.currentDioramaStageId = stageId;
    this.replaceTiles(deal.tiles);
  }

  newDeal(difficulty: Difficulty = this.difficulty): void {
    this.discardHintPlan();
    const random = () => ((this.seedState = (this.seedState * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const playRule = this.preferredPlayRule();
    let deal = playRule === 'tray' ? createTrayChallengeDeal(difficulty, random) : createSolvableDeal(difficulty, random);
    const config = DIFFICULTIES[difficulty];
    if (playRule === 'tray' && config.trayChallenge) {
      let attempts = 1;
      while (!this.hasForcedClassicTrayMoment(deal, difficulty) && attempts < 12) {
        deal = createTrayChallengeDeal(difficulty, random);
        attempts++;
      }
      if (!this.hasForcedClassicTrayMoment(deal, difficulty)) {
        deal = createTrayChallengeDeal(difficulty, () => 0.5);
      }
      if (!this.hasForcedClassicTrayMoment(deal, difficulty)) {
        throw new Error(`${difficulty} tray deal does not force a zero-pair storage moment`);
      }
    }
    const { layout, faceDown } = deal;
    const expectedCount = DIFFICULTY_TILE_COUNTS[difficulty];
    if (layout.length !== expectedCount) throw new Error(`${difficulty} layout contains ${layout.length}/${expectedCount} tiles`);
    const nextTiles = layout.map(({ face, ...position }, index) => new Tile(index, face, position, this.geometry, faceDown[index]));

    this.tiles.forEach((tile) => {
      this.scene.remove(tile.mesh);
      (tile.mesh.material as THREE.Material[]).forEach((material) => material.dispose());
    });
    this.difficulty = difficulty; this.dealPlayRule = playRule; this.currentDioramaStageId = undefined;
    this.tiles = nextTiles;
    this.initialDeal = nextTiles.map((tile) => ({ type: tile.type, faceDown: tile.faceDown, gateKey: tile.gateKey, gateGroup: tile.gateGroup }));
    this.tiles.forEach((tile) => this.scene.add(tile.mesh));
    if (this.tileMeshCount !== expectedCount) throw new Error(`${difficulty} scene contains ${this.tileMeshCount}/${expectedCount} tile meshes`);
    this.assertRenderable(expectedCount);
    this.refreshFreeTiles();

    const states = this.states();
    const diagnostics = {
      difficulty,
      layoutCount: layout.length,
      tileDefinitionCount: nextTiles.length,
      boardTileCount: this.tiles.length,
      sceneChildrenCount: this.scene.children.length,
      tileMeshCount: this.tileMeshCount,
      visibleFaceDownCount: states.filter((tile) => tile.faceDown && isTileUncovered(tile, states)).length,
      freeFaceDownCount: states.filter((tile) => tile.faceDown && isFreeTile(tile, states)).length,
    };
    console.log(diagnostics);
    (window as Window & { __mahjongBoardDiagnostics?: typeof diagnostics }).__mahjongBoardDiagnostics = diagnostics;
  }

  get tileMeshCount(): number {
    return this.scene.children.filter((child) => child instanceof THREE.Mesh && child.userData.tile instanceof Tile).length;
  }

  get activeTiles(): Tile[] { return this.tiles.filter((tile) => !tile.removed); }

  states(): TileState[] {
    return this.tiles.map((tile) => ({
      id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed,
      faceDown: tile.faceDown, originallyFaceDown: tile.originallyFaceDown,
      gateKey: tile.gateKey, gateGroup: tile.gateGroup,
    }));
  }

  stateHash(): string { return boardStateHash(this.states()); }

  initialStates(): TileState[] {
    return this.tiles.map((tile, index) => ({
      id: tile.id, type: this.initialDeal[index].type, ...tile.logical, removed: false,
      faceDown: this.initialDeal[index].faceDown, originallyFaceDown: tile.originallyFaceDown,
      gateKey: this.initialDeal[index].gateKey, gateGroup: this.initialDeal[index].gateGroup,
    }));
  }

  restoreInitialDeal(initial: readonly TileState[]): void {
    if (initial.length !== this.tiles.length || initial.some((state, index) => {
      const hasSavedGateMetadata = state.gateKey !== undefined || state.gateGroup !== undefined;
      return state.id !== index || state.x !== this.tiles[index].logical.x || state.y !== this.tiles[index].logical.y ||
        state.z !== this.tiles[index].logical.z || state.removed || Boolean(state.faceDown) !== Boolean(state.originallyFaceDown) ||
        (hasSavedGateMetadata && (state.gateKey !== this.tiles[index].gateKey || state.gateGroup !== this.tiles[index].gateGroup));
    }) || initial.map((tile) => tile.type).sort().join('\0') !== this.tiles.map((tile) => tile.type).sort().join('\0') ||
      initial.filter((tile) => tile.originallyFaceDown).length !== this.tiles.filter((tile) => tile.originallyFaceDown).length) {
      throw new Error('Saved initial deal does not match board');
    }
    this.initialDeal = initial.map((tile, index) => ({
      type: tile.type,
      faceDown: Boolean(tile.faceDown),
      gateKey: this.tiles[index].gateKey,
      gateGroup: this.tiles[index].gateGroup,
    }));
    this.tiles.forEach((tile, index) => { tile.originallyFaceDown = Boolean(initial[index].originallyFaceDown); });
  }

  isFree(tile: Tile): boolean {
    return isFreeTile({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed, gateKey: tile.gateKey, gateGroup: tile.gateGroup }, this.states());
  }

  isGateLocked(tile: Tile): boolean {
    return isGateLocked({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed, gateKey: tile.gateKey, gateGroup: tile.gateGroup }, this.states());
  }

  remove(tile: Tile): void {
    tile.removed = true;
    tile.animateRemoval();
    this.refreshFreeTiles();
  }

  hasAvailableAction(): boolean { return hasAvailableAction(this.states()); }

  analyzeProgress() { return analyzeBoard(this.states(), 50_000); }

  restore(states: readonly TileState[]): void {
    if (states.length !== this.tiles.length) throw new Error('Snapshot does not match board');
    this.discardHintPlan();
    states.forEach((state, index) => {
      const tile = this.tiles[index];
      tile.removed = state.removed; tile.resetRemovalVisual(); tile.mesh.visible = !state.removed;
      tile.setType(state.type); tile.setFaceDown(Boolean(state.faceDown));
    });
    this.refreshFreeTiles();
  }

  getHint(result?: SearchResult): AvailableAction<Tile> | null {
    const states = this.states();
    const stateHash = boardStateHash(states);

    if (this.hintPlan.length && stateHash === this.hintPlanNextHash) {
      this.hintPlan.shift();
      this.hintPlanStateHash = stateHash;
      this.hintPlanNextHash = undefined;
    } else if (this.hintPlan.length && stateHash !== this.hintPlanStateHash) {
      this.clearHintPlan();
    }

    if (!this.hintPlan.length) {
      if (!result || result.status !== 'SOLVABLE' || !result.actions.length || result.stateHash !== stateHash) return null;
      this.hintPlan = [...result.actions];
      this.hintPlanStateHash = stateHash;
    }

    const action = this.hintPlan[0];
    const next = applySolverAction(states, action);
    if (!next) { this.clearHintPlan(); return null; }
    this.hintPlanNextHash = boardStateHash(next);

    if (action.kind === 'pair') {
      const first = this.tiles[action.firstId], second = this.tiles[action.secondId];
      return first && second ? { kind: 'pair', tiles: [first, second] } : null;
    }
    const tile = this.tiles[action.tileId];
    return tile ? { kind: 'reveal', tile } : null;
  }

  clearHintDisplay(): void { this.tiles.forEach((tile) => tile.clearFeedback()); }

  discardHintPlan(): void {
    this.clearHintPlan();
    this.clearHintDisplay();
  }

  restart(): void {
    const playRule = this.preferredPlayRule();
    if (playRule !== this.dealPlayRule) {
      if (this.currentDioramaStageId) this.newDioramaDeal(this.currentDioramaStageId);
      else this.newDeal(this.difficulty);
      return;
    }
    this.discardHintPlan();
    this.tiles.forEach((tile, index) => {
      tile.removed = false; tile.resetRemovalVisual(); tile.mesh.visible = true;
      tile.setFaceDown(this.initialDeal[index].faceDown);
      tile.setType(this.initialDeal[index].type);
    });
    this.refreshFreeTiles();
  }

  getBounds(): THREE.Box3 {
    const bounds = new THREE.Box3();
    this.tiles.forEach((tile) => bounds.expandByObject(tile.mesh));
    return bounds;
  }

  /** A shared six-column/six-layer frame keeps the same world-to-screen tile
   * scale when players change levels. The frame follows a layout horizontally,
   * but stays aligned to its lowest layer so short levels are never enlarged. */
  getCameraBounds(): THREE.Box3 {
    const actual = layoutBounds(this.tiles.map((tile) => tile.logical));
    const actualSize = actual.getSize(new THREE.Vector3());
    const referenceSize = CAMERA_REFERENCE_BOUNDS.getSize(new THREE.Vector3());
    const size = new THREE.Vector3(
      Math.max(actualSize.x, referenceSize.x),
      Math.max(actualSize.y, referenceSize.y),
      Math.max(actualSize.z, referenceSize.z),
    );
    const center = actual.getCenter(new THREE.Vector3());
    center.y = actual.min.y + size.y / 2;
    return new THREE.Box3().setFromCenterAndSize(center, size);
  }

  private refreshFreeTiles(): void {
    this.tiles.forEach((tile) => tile.setFree(this.isFree(tile)));
  }

  private replaceTiles(states: readonly TileState[]): void {
    this.discardHintPlan();
    const nextTiles = states.map((state) => new Tile(state.id, state.type, state, this.geometry, state.faceDown, state.gateKey, state.gateGroup));
    this.tiles.forEach((tile) => { this.scene.remove(tile.mesh); (tile.mesh.material as THREE.Material[]).forEach((material) => material.dispose()); });
    this.tiles = nextTiles;
    this.initialDeal = states.map((tile) => ({ type: tile.type, faceDown: Boolean(tile.faceDown), gateKey: tile.gateKey, gateGroup: tile.gateGroup }));
    this.tiles.forEach((tile) => this.scene.add(tile.mesh)); this.assertRenderable(states.length); this.refreshFreeTiles();
  }

  private hasForcedClassicTrayMoment(deal: ReturnType<typeof createTrayChallengeDeal>, difficulty: Difficulty): boolean {
    const states: TileState[] = deal.layout.map(({ face, ...position }, id) => ({
      id,
      type: face,
      ...position,
      removed: false,
      faceDown: Boolean(deal.faceDown[id]),
      originallyFaceDown: Boolean(deal.faceDown[id]),
    }));
    return hasForcedTrayStorageMoment(states, deal.solution.flat(), DIFFICULTIES[difficulty].trayCapacity);
  }

  private clearHintPlan(): void {
    this.hintPlan = []; this.hintPlanStateHash = undefined; this.hintPlanNextHash = undefined;
  }

  private assertRenderable(expectedCount: number): void {
    const invalid = this.tiles.filter((tile) => {
      const materials = Array.isArray(tile.mesh.material) ? tile.mesh.material : [tile.mesh.material];
      return !tile.mesh.visible || !tile.mesh.position.toArray().every(Number.isFinite) ||
        !tile.mesh.scale.toArray().every((value) => Number.isFinite(value) && value > 0) ||
        materials.some((material) => material.opacity <= 0 || !Number.isFinite(material.opacity));
    });
    if (invalid.length || this.tileMeshCount !== expectedCount) {
      throw new Error(`${this.difficulty} has ${invalid.length} non-renderable tiles`);
    }
  }

  private preferredPlayRule(): PlayRule {
    try { return localStorage.getItem('mahjong-solitaire.play-rule.v1') === 'tray' ? 'tray' : 'pair'; }
    catch { return 'pair'; }
  }

  private hashSeed(value: string): number {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  }
}

const DIFFICULTY_TILE_COUNTS: Record<Difficulty, number> = { easy: 36, normal: 44, hard: 60 };
