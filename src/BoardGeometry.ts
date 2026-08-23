import * as THREE from 'three';
import { TILE_FACE_HEIGHT, TILE_FACE_WIDTH, TileFace } from './TileFace';

export const TILE_WIDTH = 2.5;
export const TILE_HEIGHT = 0.72;
export const TILE_DEPTH = 3.2;
// Logical rows advance by 2 units. Using half the physical tile depth makes
// adjacent rows sit exactly edge-to-edge with no gap or overlap in world space.
export const TILE_ROW_STRIDE = TILE_DEPTH * 0.5;
export const TILE_LAYER_HEIGHT = TILE_HEIGHT * 1.14;
// A raised tile must stay directly above its logical footprint. Offsetting
// successive layers towards the camera made an upper tile's artwork appear on
// an unrelated lower tile (the overlapping glyph reported in the screenshot).
export const TILE_LAYER_DEPTH_OFFSET = 0;

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
    const canvas = document.createElement('canvas'); canvas.width = TILE_FACE_WIDTH; canvas.height = TILE_FACE_HEIGHT;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#075b55'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#3aa38e'; context.lineWidth = 7;
    context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    context.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    context.globalAlpha = 0.35; context.lineWidth = 3;
    for (let offset = -canvas.height; offset < canvas.width + canvas.height; offset += 32) {
      context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset + canvas.height, canvas.height); context.stroke();
      context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset - canvas.height, canvas.height); context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
