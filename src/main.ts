import './style.css';
import { Game } from './Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas not found');
new Game(canvas);
