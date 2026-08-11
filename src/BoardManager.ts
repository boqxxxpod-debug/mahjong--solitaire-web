import * as THREE from 'three';
import { BoardGeometry } from './BoardGeometry';
import { Tile } from './Tile';
import { hasAvailablePair, isFreeTile, TileState } from './GameRules';

export class BoardManager {
  readonly tiles: Tile[];
  constructor(scene: THREE.Scene) {
    const geometry = new BoardGeometry();
    const types = ['bamboo', 'circle', 'character', 'dragon', 'dragon', 'character', 'circle', 'bamboo'];
    this.tiles = types.map((type, index) => new Tile(index, type, { gridX: index * 2 - 7, gridY: 0, layer: 0 }, geometry));
    this.tiles.forEach((tile) => scene.add(tile.mesh));
  }

  get activeTiles(): Tile[] { return this.tiles.filter((tile) => !tile.removed); }

  private states(): TileState[] {
    return this.tiles.map((tile) => ({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed }));
  }

  isFree(tile: Tile): boolean {
    return isFreeTile({ id: tile.id, type: tile.type, ...tile.logical, removed: tile.removed }, this.states());
  }

  remove(tile: Tile): void { tile.removed = true; tile.mesh.visible = false; }

  hasAvailablePair(): boolean { return hasAvailablePair(this.states()); }

  reset(): void {
    this.tiles.forEach((tile) => {
      tile.removed = false;
      tile.mesh.visible = true;
      tile.setSelected(false);
    });
  }
}
