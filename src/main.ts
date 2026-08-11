import './style.css';
import { Game } from './Game';
import { installGlobalErrorOverlay, showFatalError } from './DebugOverlay';

installGlobalErrorOverlay();

try {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) throw new Error('Game canvas not found');
  new Game(canvas);
} catch (error) {
  showFatalError('WebGL初期化', error);
}
