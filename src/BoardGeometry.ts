import * as THREE from 'three';
import { TileFace } from './TileFace';

export const TILE_WIDTH = 2.5;
export const TILE_HEIGHT = 0.72;
export const TILE_DEPTH = 3.2;

export class BoardGeometry {
  readonly geometry = new THREE.BoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH, 2, 1, 2);
  private readonly side = new THREE.MeshStandardMaterial({ color: 0xe7dcae, roughness: 0.55 });
  private readonly bottom = new THREE.MeshStandardMaterial({ color: 0x2a8d73, roughness: 0.7 });
  private readonly faces = new Map<string, THREE.MeshStandardMaterial>();

  materials(type: string): THREE.Material[] {
    let face = this.faces.get(type);
    if (!face) {
      face = new THREE.MeshStandardMaterial({ map: TileFace.createTexture(type), roughness: 0.45 });
      this.faces.set(type, face);
    }
    // BoxGeometry order: right, left, top, bottom, front, back. The canvas face sits on top.
    return [this.side, this.side, face, this.bottom, this.side, this.side];
  }
}
