import * as THREE from 'three';
import { BoardGeometry } from './BoardGeometry';
import { Tile } from './Tile';
import { getAvailablePairs, hasAvailablePair, isFreeTile, shuffleActiveTypes, TileState } from './GameRules';
import { createSolvableLayout, Difficulty } from './BoardLayout';

export class BoardManager {
  tiles: Tile[] = [];
  private readonly geometry = new BoardGeometry();
  private seedState: number;
  constructor(private readonly scene: THREE.Scene, public difficulty: Difficulty = 'normal') {
    const seed = new URLSearchParams(location.search).get('seed');
    this.seedState = seed === null ? Math.floor(Math.random() * 0xffffffff) : this.hashSeed(seed);
    this.newDeal(difficulty);
  }

  newDeal(difficulty: Difficulty = this.difficulty): void {
    const random = () => ((this.seedState = (this.seedState * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const layout = createSolvableLayout(difficulty, random);
    const expectedCount = DIFFICULTY_TILE_COUNTS[difficulty];
    if (layout.length !== expectedCount) throw new Error(`${difficulty} layout contains ${layout.length}/${expectedCount} tiles`);
    const nextTiles = layout.map(({ face, ...position }, index) => new Tile(index, face, position, this.geometry));

    // Build and validate the replacement first. If generation ever fails, the
    // currently visible board remains intact instead of being replaced by [].
    this.tiles.forEach((tile) => {
      this.scene.remove(tile.mesh);
      (tile.mesh.material as THREE.Material[]).forEach((material) => material.dispose());
    });
    this.difficulty = difficulty;
    this.tiles = nextTiles;
    this.tiles.forEach((tile) => this.scene.add(tile.mesh));
    if (this.tileMeshCount !== expectedCount) throw new Error(`${difficulty} scene contains ${this.tileMeshCount}/${expectedCount} tile meshes`);
    this.refreshFreeTiles();
  }

  get tileMeshCount(): number { return this.tiles.filter((tile) => this.scene.children.includes(tile.mesh)).length; }

  get activeTiles(): Tile[] { return this.tiles.filter((tile) => !tile.removed); }

  private states(): TileState[] {
    return this.tiles.map((tile) => ({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed }));
  }

  isFree(tile: Tile): boolean {
    return isFreeTile({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed }, this.states());
  }

  remove(tile: Tile): void {
    tile.removed = true;
    tile.mesh.visible = false;
    this.refreshFreeTiles();
  }

  hasAvailablePair(): boolean { return hasAvailablePair(this.states()); }

  getHint(): readonly [Tile, Tile] | null {
    const pair = getAvailablePairs(this.states())[0];
    return pair ? [this.tiles[pair[0].id], this.tiles[pair[1].id]] : null;
  }

  shuffle(): void {
    const states = this.states();
    shuffleActiveTypes(states);
    states.forEach((state) => { if (!state.removed) this.tiles[state.id].setType(state.type); });
    this.refreshFreeTiles();
  }

  getBounds(): THREE.Box3 {
    const bounds = new THREE.Box3();
    this.tiles.forEach((tile) => bounds.expandByObject(tile.mesh));
    return bounds;
  }

  private refreshFreeTiles(): void {
    this.tiles.forEach((tile) => tile.setFree(this.isFree(tile)));
  }

  private hashSeed(value: string): number {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  }
}

const DIFFICULTY_TILE_COUNTS: Record<Difficulty, number> = { easy: 48, normal: 72, hard: 96 };
