import * as THREE from 'three';
import { BoardManager } from './BoardManager';
import { MatchManager } from './MatchManager';
import { Tile } from './Tile';

export class InputController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private down?: { pointerId: number; x: number; y: number };

  constructor(canvas: HTMLCanvasElement, camera: THREE.Camera, board: BoardManager, matches: MatchManager) {
    canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      this.down = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }, { passive: true });
    canvas.addEventListener('pointercancel', () => { this.down = undefined; }, { passive: true });
    canvas.addEventListener('pointerup', (event) => {
      const down = this.down;
      this.down = undefined;
      if (!down || down.pointerId !== event.pointerId || !event.isPrimary ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return;
      const bounds = canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, camera);
      const hit = this.raycaster.intersectObjects(board.activeTiles.map((tile) => tile.mesh), false)[0];
      const tile = hit?.object.userData.tile as Tile | undefined;
      if (tile) matches.select(tile);
    }, { passive: true });
  }
}
