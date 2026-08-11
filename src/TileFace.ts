import * as THREE from 'three';

const SYMBOLS: Record<string, { glyph: string; color: string }> = {
  bamboo: { glyph: '竹', color: '#167b58' },
  circle: { glyph: '筒', color: '#b64236' },
  character: { glyph: '萬', color: '#263c55' },
  dragon: { glyph: '中', color: '#c63534' },
  east: { glyph: '東', color: '#263c55' }, south: { glyph: '南', color: '#263c55' },
  west: { glyph: '西', color: '#263c55' }, north: { glyph: '北', color: '#263c55' },
  plum: { glyph: '梅', color: '#b64270' }, orchid: { glyph: '蘭', color: '#7753a5' },
  season: { glyph: '季', color: '#b67925' }, flower: { glyph: '花', color: '#b64270' },
  green: { glyph: '發', color: '#167b58' }, white: { glyph: '白', color: '#4c7089' },
  one: { glyph: '一', color: '#263c55' }, two: { glyph: '二', color: '#263c55' },
  three: { glyph: '三', color: '#263c55' }, four: { glyph: '四', color: '#263c55' },
  red: { glyph: '紅', color: '#c63534' },
};

export class TileFace {
  static createTexture(type: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    const symbol = SYMBOLS[type];
    context.fillStyle = '#fffdf0'; context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#d6cba6'; context.lineWidth = 8; context.strokeRect(16, 16, 224, 224);
    context.fillStyle = symbol.color; context.font = 'bold 126px serif';
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(symbol.glyph, 128, 129);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
