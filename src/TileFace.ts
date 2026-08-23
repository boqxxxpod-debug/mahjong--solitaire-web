import * as THREE from 'three';
import { getTileFaceLabel, parseSuitedFace } from './TileCatalog.js';

export const TILE_FACE_WIDTH = 250;
export const TILE_FACE_HEIGHT = 320;

const IVORY = '#fffdf0';
const INK = '#173149';
const BLUE = '#23669a';
const GREEN = '#17805b';
const RED = '#c73932';
const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SERIF = '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif';

type Point = readonly [number, number];

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const right = x + width, bottom = y + height;
  context.beginPath(); context.moveTo(x + radius, y); context.lineTo(right - radius, y);
  context.quadraticCurveTo(right, y, right, y + radius); context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom); context.lineTo(x + radius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - radius); context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y); context.closePath();
}

function drawSurface(context: CanvasRenderingContext2D): void {
  const surface = context.createLinearGradient(0, 0, TILE_FACE_WIDTH, TILE_FACE_HEIGHT);
  surface.addColorStop(0, '#fffef4'); surface.addColorStop(0.55, IVORY); surface.addColorStop(1, '#f2ecd2');
  context.fillStyle = surface; context.fillRect(0, 0, TILE_FACE_WIDTH, TILE_FACE_HEIGHT);
  roundedRect(context, 8, 8, TILE_FACE_WIDTH - 16, TILE_FACE_HEIGHT - 16, 16);
  context.strokeStyle = '#d9cfaa'; context.lineWidth = 4; context.stroke();
  roundedRect(context, 15, 15, TILE_FACE_WIDTH - 30, TILE_FACE_HEIGHT - 30, 12);
  context.strokeStyle = '#f8f3dc'; context.lineWidth = 3; context.stroke();
}

function drawCharacters(context: CanvasRenderingContext2D, rank: number): void {
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = INK; context.font = `900 102px ${SERIF}`; context.fillText(NUMERALS[rank], 125, 103);
  context.fillStyle = RED; context.font = `900 112px ${SERIF}`; context.fillText('萬', 125, 224);
}

function dotLayout(rank: number): Point[] {
  switch (rank) {
    case 1: return [[0.5, 0.5]];
    case 2: return [[0.5, 0.28], [0.5, 0.72]];
    case 3: return [[0.31, 0.24], [0.5, 0.5], [0.69, 0.76]];
    case 4: return [[0.31, 0.28], [0.69, 0.28], [0.31, 0.72], [0.69, 0.72]];
    case 5: return [...dotLayout(4), [0.5, 0.5]];
    case 6: return [0.3, 0.5, 0.7].flatMap((y) => [[0.34, y], [0.66, y]] as Point[]);
    case 7: return [[0.3, 0.2], [0.5, 0.36], [0.7, 0.52], [0.32, 0.68], [0.68, 0.68], [0.32, 0.84], [0.68, 0.84]];
    case 8: return [0.2, 0.4, 0.6, 0.8].flatMap((y) => [[0.34, y], [0.66, y]] as Point[]);
    default: return [0.25, 0.5, 0.75].flatMap((y) => [[0.28, y], [0.5, y], [0.72, y]] as Point[]);
  }
}

function pipColor(rank: number, index: number, count: number): string {
  if (rank === 2) return index === 0 ? GREEN : RED;
  if (rank === 5 && index === count - 1) return RED;
  if (rank === 6) return index < 2 ? GREEN : index >= 4 ? RED : BLUE;
  return [BLUE, GREEN, RED][(index + rank) % 3];
}

function drawOneDot(context: CanvasRenderingContext2D): void {
  const rings: Array<readonly [number, string]> = [[57, GREEN], [46, IVORY], [37, RED], [26, IVORY], [16, BLUE]];
  for (const [radius, color] of rings) {
    context.beginPath(); context.arc(125, 160, radius, 0, Math.PI * 2); context.fillStyle = color; context.fill();
  }
  context.fillStyle = '#f5d889'; context.beginPath(); context.arc(125, 160, 6, 0, Math.PI * 2); context.fill();
}

function drawDots(context: CanvasRenderingContext2D, rank: number): void {
  if (rank === 1) { drawOneDot(context); return; }
  const points = dotLayout(rank); const radius = rank >= 7 ? 17 : rank === 6 ? 20 : 23;
  points.forEach(([x, y], index) => {
    const color = pipColor(rank, index, points.length), px = x * TILE_FACE_WIDTH, py = y * TILE_FACE_HEIGHT;
    context.beginPath(); context.arc(px, py, radius, 0, Math.PI * 2); context.fillStyle = color; context.fill();
    context.beginPath(); context.arc(px, py, radius * 0.58, 0, Math.PI * 2); context.fillStyle = IVORY; context.fill();
    context.beginPath(); context.arc(px, py, radius * 0.29, 0, Math.PI * 2); context.fillStyle = color; context.fill();
  });
}

function bambooLayout(rank: number): Point[] {
  switch (rank) {
    case 2: return [[0.39, 0.5], [0.61, 0.5]];
    case 3: return [[0.5, 0.27], [0.35, 0.7], [0.65, 0.7]];
    case 4: return [[0.35, 0.3], [0.65, 0.3], [0.35, 0.7], [0.65, 0.7]];
    case 5: return [...bambooLayout(4), [0.5, 0.5]];
    case 6: return [0.28, 0.5, 0.72].flatMap((y) => [[0.36, y], [0.64, y]] as Point[]);
    case 7: return [[0.5, 0.17], ...[0.4, 0.62, 0.84].flatMap((y) => [[0.35, y], [0.65, y]] as Point[])];
    case 8: return [0.2, 0.4, 0.6, 0.8].flatMap((y) => [[0.36, y], [0.64, y]] as Point[]);
    default: return [0.23, 0.5, 0.77].flatMap((y) => [[0.3, y], [0.5, y], [0.7, y]] as Point[]);
  }
}

function drawBambooStick(context: CanvasRenderingContext2D, x: number, y: number, height: number, color: string): void {
  const width = Math.max(9, height * 0.24), segment = height * 0.26, gap = height * 0.07;
  for (let index = -1; index <= 1; index++) {
    const top = y + index * (segment + gap) - segment / 2;
    roundedRect(context, x - width / 2, top, width, segment, width / 2);
    context.fillStyle = color; context.fill();
    context.fillStyle = '#d8e8c7'; context.fillRect(x - width * 0.12, top + 3, width * 0.2, Math.max(3, segment - 6));
  }
  context.fillStyle = color; context.fillRect(x - width * 0.75, y - 2, width * 1.5, 4);
}

function drawBambooBird(context: CanvasRenderingContext2D): void {
  context.save(); context.lineCap = 'round';
  const tailBase: Point = [112, 217];
  [[46, 257], [61, 278], [91, 286], [126, 280], [151, 257]].forEach(([x, y], index) => {
    context.beginPath(); context.moveTo(...tailBase); context.quadraticCurveTo(92 + index * 8, 246, x, y);
    context.strokeStyle = index % 2 ? BLUE : GREEN; context.lineWidth = 12; context.stroke();
  });
  context.translate(126, 157); context.rotate(-0.2);
  context.fillStyle = BLUE; context.beginPath(); context.ellipse(0, 18, 35, 62, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = GREEN; context.beginPath(); context.ellipse(-7, 24, 22, 39, -0.25, 0, Math.PI * 2); context.fill();
  context.fillStyle = GREEN; context.beginPath(); context.arc(6, -47, 23, 0, Math.PI * 2); context.fill();
  context.fillStyle = RED; context.beginPath(); context.moveTo(26, -52); context.lineTo(53, -43); context.lineTo(27, -35); context.closePath(); context.fill();
  context.fillStyle = '#fff'; context.beginPath(); context.arc(12, -52, 6, 0, Math.PI * 2); context.fill();
  context.fillStyle = INK; context.beginPath(); context.arc(14, -52, 2.5, 0, Math.PI * 2); context.fill();
  context.restore();
}

function drawBamboo(context: CanvasRenderingContext2D, rank: number): void {
  if (rank === 1) { drawBambooBird(context); return; }
  const points = bambooLayout(rank);
  // Traditional bamboo tiles give the sparse ranks much taller stalks. Keep
  // dense ranks compact enough not to collide while retaining phone legibility.
  const height = rank === 2 ? 150 : rank <= 4 ? 88 : rank === 5 ? 64 : rank <= 7 ? 58 : rank === 8 ? 52 : 58;
  points.forEach(([x, y], index) => {
    const color = rank === 5 && index === points.length - 1 ? RED : index % 4 === 1 ? BLUE : GREEN;
    drawBambooStick(context, x * TILE_FACE_WIDTH, y * TILE_FACE_HEIGHT, height, color);
  });
}

function drawHonor(context: CanvasRenderingContext2D, type: string): void {
  if (type === 'dragon-white') {
    roundedRect(context, 48, 54, 154, 212, 12); context.strokeStyle = BLUE; context.lineWidth = 12; context.stroke();
    roundedRect(context, 62, 68, 126, 184, 8); context.strokeStyle = '#8db8c9'; context.lineWidth = 4; context.stroke();
    return;
  }
  const glyph = getTileFaceLabel(type);
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = type === 'dragon-red' ? RED : type === 'dragon-green' ? GREEN : INK;
  context.font = `900 ${type.startsWith('wind-') ? 154 : 166}px ${SERIF}`;
  context.fillText(glyph, 125, 162);
}

function drawUnknown(context: CanvasRenderingContext2D): void {
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = INK;
  context.font = `900 120px ${SERIF}`; context.fillText('?', 125, 160);
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable');
  context.drawImage(source, 0, 0);
  return canvas;
}

export class TileFace {
  // The first rendering of each face is the canonical artwork for the current
  // page. Board textures and tray previews are cloned from the same pixels so
  // a late web-font load can never make the tray show a different-looking tile.
  private static readonly canonicalCanvases = new Map<string, HTMLCanvasElement>();

  private static drawCanvas(type: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = TILE_FACE_WIDTH; canvas.height = TILE_FACE_HEIGHT;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable');
    drawSurface(context);
    const suited = parseSuitedFace(type);
    if (suited?.suit === 'characters') drawCharacters(context, suited.rank);
    else if (suited?.suit === 'dots') drawDots(context, suited.rank);
    else if (suited?.suit === 'bamboo') drawBamboo(context, suited.rank);
    else if (type.startsWith('wind-') || type.startsWith('dragon-')) drawHonor(context, type);
    else drawUnknown(context);
    return canvas;
  }

  static createCanvas(type: string): HTMLCanvasElement {
    let canonical = this.canonicalCanvases.get(type);
    if (!canonical) {
      canonical = this.drawCanvas(type);
      this.canonicalCanvases.set(type, canonical);
    }
    return cloneCanvas(canonical);
  }

  static createTexture(type: string): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(this.createCanvas(type));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
