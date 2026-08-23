import * as THREE from 'three';
import { TileFace } from './TileFace';

export const TILE_WIDTH = 2.5;
export const TILE_HEIGHT = 0.72;
export const TILE_DEPTH = 3.2;
// Logical rows advance by 2 units. Using half the physical tile depth makes
// adjacent rows sit exactly edge-to-edge with no gap or overlap in world space.
export const TILE_ROW_STRIDE = TILE_DEPTH * 0.5;
export const TILE_LAYER_HEIGHT = TILE_HEIGHT * 1.14;
// Lean each successive storey slightly towards the camera. This keeps the
// stack's diorama silhouette but prevents its raised face from landing exactly
// on top of the rear face below it in the camera projection.
export const TILE_LAYER_DEPTH_OFFSET = TILE_DEPTH * 0.09;

export class BoardGeometry {
  readonly geometry = new THREE.BoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH, 2, 1, 2);
  private readonly side = new THREE.MeshStandardMaterial({ color: 0xe7dcae, roughness: 0.55 });
  private readonly bottom = new THREE.MeshStandardMaterial({ color: 0x2a8d73, roughness: 0.7 });
  private readonly faces = new Map<string, THREE.MeshStandardMaterial>();
  private readonly back = new THREE.MeshStandardMaterial({
    map: this.createBackTexture(),
    roughness: 0.5,
    metalness: 0.08,
  });

  materials(type: string): THREE.Material[] {
    let face = this.faces.get(type);
    if (!face) {
      face = new THREE.MeshStandardMaterial({ map: TileFace.createTexture(type), roughness: 0.45 });
      this.faces.set(type, face);
    }
    // BoxGeometry order: right, left, top, bottom, front, back. The canvas face sits on top.
    return [this.side, this.side, face, this.bottom, this.side, this.side];
  }

  backMaterials(): THREE.Material[] {
    return [this.side, this.side, this.back, this.bottom, this.side, this.side];
  }


  private createBackTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#075b55'; context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#3aa38e'; context.lineWidth = 7;
    context.strokeRect(20, 20, 216, 216); context.strokeRect(36, 36, 184, 184);
    context.globalAlpha = 0.35; context.lineWidth = 3;
    for (let offset = -256; offset < 512; offset += 32) {
      context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset + 256, 256); context.stroke();
      context.beginPath(); context.moveTo(offset + 256, 0); context.lineTo(offset, 256); context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
