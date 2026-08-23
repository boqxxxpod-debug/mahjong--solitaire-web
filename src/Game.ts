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
    if (!this.board.tiles.length || this.board.tiles.some((tile) => !this.scene.children.includes(tile.mesh))) {
      throw new Error(`Tile mesh initialization failed (${this.board.tiles.length})`);
    }
    const ui = new UIManager();
    const matches = new MatchManager(this.board, ui);
    (window as Window & { __mahjongGameTest?: { board: BoardManager; matches: MatchManager; camera: THREE.PerspectiveCamera } }).__mahjongGameTest = {
      board: this.board,
      matches,
      camera: this.camera,
    };
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
    this.fitCamera(height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private fitCamera(viewportHeight: number): void {
    const bounds = this.board.getCameraBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0.72, 0.69).normalize();
    this.camera.position.copy(center).add(direction);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();

    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = direction.clone();
    const cornerOffsets: THREE.Vector3[] = [];
    let halfWidth = 0, halfHeight = 0, halfDepth = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(center);
      cornerOffsets.push(offset);
      halfWidth = Math.max(halfWidth, Math.abs(offset.dot(right)));
      halfHeight = Math.max(halfHeight, Math.abs(offset.dot(up)));
      halfDepth = Math.max(halfDepth, Math.abs(offset.dot(forward)));
    }
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontalFov = Math.atan(Math.tan(verticalFov) * this.camera.aspect);
    const usableHeight = this.usableBoardHeight(viewportHeight);
    const usableHeightRatio = usableHeight / viewportHeight;
    // A small safe edge is enough for touch screens; the old 14% gutter made
    // the already fitted tiles needlessly small at narrow phone aspect ratios.
    const distance = Math.max(
      halfWidth / Math.tan(horizontalFov),
      halfHeight / (Math.tan(verticalFov) * usableHeightRatio),
    ) * 1.05 + halfDepth;

    // The tray is an HTML overlay, so it does not reduce the WebGL canvas size.
    // Move the fitted view only as far as needed for its lowest projected
    // corner to clear the tray, preserving the original pair-mode framing.
    const lowestAllowedNdcY = 1 - 2 * usableHeight / viewportHeight;
    const centerShift = cornerOffsets.reduce((requiredShift, offset) => {
      const depth = distance - offset.dot(forward);
      return Math.max(requiredShift, lowestAllowedNdcY * depth * Math.tan(verticalFov) - offset.dot(up));
    }, 0);
    const viewCenter = center.clone().addScaledVector(up, -centerShift);
    this.camera.position.copy(viewCenter).addScaledVector(direction, distance);
    // Keep the fitted board inside the depth range too. This matters on narrow
    // phones where fitting a wide layout can place the camera beyond far=100.
    this.camera.far = Math.max(100, Math.hypot(distance, centerShift) + halfDepth + 10);
    this.camera.lookAt(viewCenter);
  }

  private usableBoardHeight(viewportHeight: number): number {
    const tray = document.querySelector<HTMLElement>('#tray');
    if (!tray || tray.hidden) return viewportHeight;
    const canvasTop = this.renderer.domElement.getBoundingClientRect().top;
    const trayTop = tray.getBoundingClientRect().top - canvasTop;
    return THREE.MathUtils.clamp(trayTop - 12, 1, viewportHeight);
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
