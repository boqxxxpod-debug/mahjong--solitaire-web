import * as THREE from 'three';
import { BoardGeometry, TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from './BoardGeometry';

export interface TilePosition { x: number; y: number; z: number; }

export class Tile {
  readonly mesh: THREE.Mesh;
  removed = false;
  selected = false;

  private feedbackTimer?: number;
  constructor(readonly id: number, public type: string, readonly logical: TilePosition, private readonly geometry: BoardGeometry) {
    const materials = this.createMaterials(type);
    this.mesh = new THREE.Mesh(geometry.geometry, materials);
    this.mesh.position.set(logical.x * TILE_WIDTH * 0.5, logical.z * TILE_HEIGHT, logical.y * TILE_DEPTH * 0.5);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.tile = this;
  }

  private createMaterials(type: string): THREE.Material[] {
    return this.geometry.materials(type).map((material) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) clone.userData.baseColor = clone.color.getHex();
      return clone;
    });
  }

  setType(type: string): void {
    (this.mesh.material as THREE.Material[]).forEach((material) => material.dispose());
    this.type = type;
    this.mesh.material = this.createMaterials(type);
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

  flash(kind: 'hint' | 'blocked'): void {
    window.clearTimeout(this.feedbackTimer);
    const color = kind === 'hint' ? 0xf4d784 : 0xe35d52;
    this.materials().forEach((material) => { material.emissive.setHex(color); material.emissiveIntensity = 0.9; });
    this.feedbackTimer = window.setTimeout(() => this.setSelected(this.selected), kind === 'hint' ? 2200 : 260);
  }

  private materials(): THREE.MeshStandardMaterial[] {
    return (this.mesh.material as THREE.Material[]).filter((material): material is THREE.MeshStandardMaterial =>
      material instanceof THREE.MeshStandardMaterial);
  }
}
