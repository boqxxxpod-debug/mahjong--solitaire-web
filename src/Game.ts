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
  private readonly board: BoardManager;

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
    this.scene.add(new THREE.AmbientLight(0xb8d9d1, 1.7));
    const sun = new THREE.DirectionalLight(0xfff2cf, 3.2); sun.position.set(-7, 12, 8); sun.castShadow = true; this.scene.add(sun);
    this.board = new BoardManager(this.scene);
    if (this.board.tiles.length !== 32 || this.board.tiles.some((tile) => !this.scene.children.includes(tile.mesh))) {
      throw new Error(`Tile mesh initialization failed (${this.board.tiles.length}/32)`);
    }
    const ui = new UIManager();
    const matches = new MatchManager(this.board, ui);
    new InputController(canvas, this.camera, this.board, matches);
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize(); this.animate();
  }

  private resize(): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    this.camera.aspect = width / height;
    this.fitCamera();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private fitCamera(): void {
    const bounds = this.board.getBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0.72, 0.69).normalize();
    this.camera.position.copy(center).add(direction);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();

    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = direction.clone();
    let halfWidth = 0, halfHeight = 0, halfDepth = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(center);
      halfWidth = Math.max(halfWidth, Math.abs(offset.dot(right)));
      halfHeight = Math.max(halfHeight, Math.abs(offset.dot(up)));
      halfDepth = Math.max(halfDepth, Math.abs(offset.dot(forward)));
    }
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontalFov = Math.atan(Math.tan(verticalFov) * this.camera.aspect);
    const distance = Math.max(halfWidth / Math.tan(horizontalFov), halfHeight / Math.tan(verticalFov)) * 1.14 + halfDepth;
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
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
