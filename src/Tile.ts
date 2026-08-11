import * as THREE from 'three';
import { BoardGeometry, TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from './BoardGeometry';

export interface TilePosition { x: number; y: number; z: number; }

export class Tile {
  readonly mesh: THREE.Mesh;
  removed = false;
  selected = false;

  constructor(readonly id: number, readonly type: string, readonly logical: TilePosition, geometry: BoardGeometry) {
    const materials = geometry.materials(type).map((material) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) clone.userData.baseColor = clone.color.getHex();
      return clone;
    });
    this.mesh = new THREE.Mesh(geometry.geometry, materials);
    this.mesh.position.set(logical.x * TILE_WIDTH * 0.5, logical.z * TILE_HEIGHT, logical.y * TILE_DEPTH * 0.5);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.tile = this;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.mesh.position.y = this.logical.z * TILE_HEIGHT + (selected ? 0.32 : 0);
    this.materials().forEach((material) => {
      material.emissive.setHex(selected ? 0x2b8f77 : 0x000000);
      material.emissiveIntensity = selected ? 0.5 : 0;
    });
  }

  setFree(free: boolean): void {
    this.materials().forEach((material) => {
      const baseColor = material.userData.baseColor as number;
      material.color.setHex(baseColor).multiplyScalar(free ? 1 : 0.58);
    });
  }

  private materials(): THREE.MeshStandardMaterial[] {
    return (this.mesh.material as THREE.Material[]).filter((material): material is THREE.MeshStandardMaterial =>
      material instanceof THREE.MeshStandardMaterial);
  }
}
