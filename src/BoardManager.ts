import * as THREE from 'three';
import { BoardGeometry } from './BoardGeometry';
import { Tile } from './Tile';

export class BoardManager {
  readonly tiles: Tile[];
  constructor(scene: THREE.Scene) {
    const geometry = new BoardGeometry();
    const types = ['bamboo', 'circle', 'character', 'dragon', 'dragon', 'character', 'circle', 'bamboo'];
    this.tiles = types.map((type, index) => new Tile(index, type, { gridX: index * 2 - 7, gridY: 0, layer: 0 }, geometry));
    this.tiles.forEach((tile) => scene.add(tile.mesh));
  }

  get activeTiles(): Tile[] { return this.tiles.filter((tile) => !tile.removed); }

  isFree(tile: Tile): boolean {
    if (tile.removed) return false;
    const others = this.activeTiles.filter((other) => other !== tile);
    const covered = others.some((other) => other.logical.layer > tile.logical.layer &&
      Math.abs(other.logical.gridX - tile.logical.gridX) < 2 && Math.abs(other.logical.gridY - tile.logical.gridY) < 2);
    if (covered) return false;
    const sameLayer = others.filter((other) => other.logical.layer === tile.logical.layer && Math.abs(other.logical.gridY - tile.logical.gridY) < 2);
    const leftBlocked = sameLayer.some((other) => other.logical.gridX === tile.logical.gridX - 2);
    const rightBlocked = sameLayer.some((other) => other.logical.gridX === tile.logical.gridX + 2);
    return !leftBlocked || !rightBlocked;
  }

  remove(tile: Tile): void { tile.removed = true; tile.mesh.visible = false; }
}
