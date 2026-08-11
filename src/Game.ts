import * as THREE from 'three';
import { BoardManager } from './BoardManager';
import { InputController } from './InputController';
import { MatchManager } from './MatchManager';
import { UIManager } from './UIManager';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 14, 15); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xb8d9d1, 1.7));
    const sun = new THREE.DirectionalLight(0xfff2cf, 3.2); sun.position.set(-7, 12, 8); sun.castShadow = true; this.scene.add(sun);
    const board = new BoardManager(this.scene);
    const ui = new UIManager();
    const matches = new MatchManager(board, ui);
    new InputController(canvas, this.camera, board, matches);
    window.addEventListener('resize', () => this.resize());
    this.resize(); this.animate();
  }

  private resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.camera.aspect = width / height;
    // Pull back on portrait screens so the full horizontal row remains visible.
    this.camera.position.set(0, width < height ? 38 : 14, width < height ? 44 : 15);
    this.camera.lookAt(0, 0, 0); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => { this.renderer.render(this.scene, this.camera); requestAnimationFrame(this.animate); };
}
