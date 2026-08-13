import * as THREE from 'three';
import {
  BoardGeometry,
  TILE_LAYER_DEPTH_OFFSET,
  TILE_LAYER_HEIGHT,
  TILE_ROW_STRIDE,
  TILE_WIDTH,
} from './BoardGeometry';

export interface TilePosition { x: number; y: number; z: number; }

export class Tile {
  readonly mesh: THREE.Mesh;
  removed = false;
  selected = false;
  faceDown: boolean;
  /** Identifies tiles that belong to the deal's face-down pool. */
  originallyFaceDown: boolean;
  private displayedFaceDown: boolean;

  private feedbackTimer?: number;
  private flipGeneration = 0;
  constructor(readonly id: number, public type: string, readonly logical: TilePosition, private readonly geometry: BoardGeometry, faceDown = false) {
    this.faceDown = faceDown;
    this.originallyFaceDown = faceDown;
    this.displayedFaceDown = faceDown;
    const materials = this.createMaterials(type);
    this.mesh = new THREE.Mesh(geometry.geometry, materials);
    this.mesh.position.set(
      logical.x * TILE_WIDTH * 0.5,
      logical.z * TILE_LAYER_HEIGHT,
      logical.y * TILE_ROW_STRIDE + logical.z * TILE_LAYER_DEPTH_OFFSET,
    );
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.tile = this;
  }

  private createMaterials(type: string): THREE.Material[] {
    return (this.faceDown ? this.geometry.backMaterials() : this.geometry.materials(type)).map((material) => {
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

  setFaceDown(faceDown: boolean): void {
    this.flipGeneration++;
    this.faceDown = faceDown;
    this.mesh.rotation.y = 0;
    this.replaceMaterials();
  }

  /** Used by diagnostics/tests to assert that logical and rendered faces agree. */
  get isDisplayingFaceDown(): boolean { return this.displayedFaceDown; }

  flipTo(faceDown: boolean): Promise<void> {
    if (this.faceDown === faceDown) return Promise.resolve();
    const generation = ++this.flipGeneration;
    this.faceDown = faceDown;
    // Swap immediately with the logical state. The rotation supplies the flip
    // motion without leaving the material and faceDown flag contradictory.
    this.replaceMaterials();
    const started = performance.now();
    const duration = 260;
    return new Promise((resolve) => {
      const animate = (now: number) => {
        if (generation !== this.flipGeneration) { resolve(); return; }
        const progress = Math.min(1, (now - started) / duration);
        this.mesh.rotation.y = Math.sin(progress * Math.PI) * Math.PI / 2;
        if (progress < 1) requestAnimationFrame(animate);
        else { this.mesh.rotation.y = 0; resolve(); }
      };
      requestAnimationFrame(animate);
    });
  }

  private replaceMaterials(): void {
    (this.mesh.material as THREE.Material[]).forEach((material) => material.dispose());
    this.mesh.material = this.createMaterials(this.type);
    this.displayedFaceDown = this.faceDown;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.mesh.position.y = this.logical.z * TILE_LAYER_HEIGHT + (selected ? 0.32 : 0);
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

  clearFeedback(): void {
    window.clearTimeout(this.feedbackTimer);
    this.setSelected(this.selected);
  }

  private materials(): THREE.MeshStandardMaterial[] {
    return (this.mesh.material as THREE.Material[]).filter((material): material is THREE.MeshStandardMaterial =>
      material instanceof THREE.MeshStandardMaterial);
  }
}
