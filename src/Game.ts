import * as THREE from 'three';
import { BoardManager } from './BoardManager';
import { InputController } from './InputController';
import { MatchManager } from './MatchManager';
import { UIManager } from './UIManager';
import { showFatalError } from './DebugOverlay';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      showFatalError('WebGL context lost', 'GPUコンテキストが失われました。ページを再読み込みしてください。');
    });
    canvas.addEventListener('webglcontextcreationerror', (event) => {
      showFatalError('WebGL context creation', (event as WebGLContextEvent).statusMessage || 'WebGLを開始できませんでした');
    });

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 14, 15); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xb8d9d1, 1.7));
    const sun = new THREE.DirectionalLight(0xfff2cf, 3.2); sun.position.set(-7, 12, 8); sun.castShadow = true; this.scene.add(sun);
    const board = new BoardManager(this.scene);
    if (board.tiles.length !== 8 || board.tiles.some((tile) => !this.scene.children.includes(tile.mesh))) {
      throw new Error(`Tile mesh initialization failed (${board.tiles.length}/8)`);
    }
    const ui = new UIManager();
    const matches = new MatchManager(board, ui);
    new InputController(canvas, this.camera, board, matches);
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize(); this.animate();
  }

  private resize(): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    this.camera.aspect = width / height;
    if (width < height) {
      // Fit the 20-unit-wide row with a small margin, even on narrow phones.
      const horizontalHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
      const distance = 11 / horizontalHalfFov;
      this.camera.position.set(0, 38, 44).setLength(distance);
    } else {
      this.camera.position.set(0, 14, 15);
    }
    this.camera.lookAt(0, 0, 0); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    try {
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this.animate);
    } catch (error) {
      showFatalError('Render loop', error);
    }
  };
}
