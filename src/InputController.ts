import * as THREE from 'three';
import { BoardManager } from './BoardManager';
import { MatchManager } from './MatchManager';
import { Tile } from './Tile';

export class InputController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, camera: THREE.Camera, board: BoardManager, matches: MatchManager) {
    canvas.addEventListener('pointerup', (event) => {
      const bounds = canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, camera);
      const hit = this.raycaster.intersectObjects(board.activeTiles.map((tile) => tile.mesh), false)[0];
      const tile = hit?.object.userData.tile as Tile | undefined;
      if (tile) matches.select(tile);
    }, { passive: true });
  }
}
