import * as THREE from 'three';
import { BoardGeometry } from './BoardGeometry';
import { Tile } from './Tile';
import { getAvailablePairs, hasAvailablePair, isFreeTile, resetTiles, shuffleActiveTypes, TileState } from './GameRules';
import { createSolvableLayout } from './BoardLayout';

export class BoardManager {
  readonly tiles: Tile[];
  private readonly initialFaces: readonly string[];
  constructor(scene: THREE.Scene) {
    const geometry = new BoardGeometry();
    const seed = new URLSearchParams(location.search).get('seed');
    let state = seed === null ? Math.floor(Math.random() * 0xffffffff) : this.hashSeed(seed);
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const layout = createSolvableLayout(random);
    this.initialFaces = layout.map((tile) => tile.face);
    this.tiles = layout.map(({ face, ...position }, index) => new Tile(index, face, position, geometry));
    this.tiles.forEach((tile) => scene.add(tile.mesh));
    this.refreshFreeTiles();
  }

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

  reset(): void {
    const states = this.states();
    resetTiles(states, this.initialFaces);
    this.tiles.forEach((tile, index) => {
      tile.setType(states[index].type);
      tile.removed = states[index].removed;
      tile.mesh.visible = true;
      tile.setSelected(false);
    });
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
