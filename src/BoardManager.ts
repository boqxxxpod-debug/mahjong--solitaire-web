import * as THREE from 'three';
import { BoardGeometry } from './BoardGeometry';
import { Tile } from './Tile';
import { hasAvailablePair, isFreeTile, TileState } from './GameRules';
import { COMPACT_LAYOUT } from './BoardLayout';

export class BoardManager {
  readonly tiles: Tile[];
  constructor(scene: THREE.Scene) {
    const geometry = new BoardGeometry();
    this.tiles = COMPACT_LAYOUT.map(({ face, ...position }, index) => new Tile(index, face, position, geometry));
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

  reset(): void {
    this.tiles.forEach((tile) => {
      tile.removed = false;
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
}
