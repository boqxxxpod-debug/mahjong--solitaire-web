import * as THREE from 'three';
import { BoardGeometry, TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from './BoardGeometry';

export interface TilePosition { gridX: number; gridY: number; layer: number; }

export class Tile {
  readonly mesh: THREE.Mesh;
  removed = false;
  selected = false;

  constructor(readonly id: number, readonly type: string, readonly logical: TilePosition, geometry: BoardGeometry) {
    this.mesh = new THREE.Mesh(geometry.geometry, geometry.materials(type));
    this.mesh.position.set(logical.gridX * TILE_WIDTH * 0.5, logical.layer * TILE_HEIGHT, logical.gridY * TILE_DEPTH * 0.5);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.tile = this;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.mesh.position.y = this.logical.layer * TILE_HEIGHT + (selected ? 0.32 : 0);
  }
}
