/// <reference lib="webworker" />
import { analyzeBoard, TileState } from './GameRules';

interface Request { revision: number; tiles: TileState[]; nodeLimit: number }
self.onmessage = ({ data }: MessageEvent<Request>) => {
  self.postMessage({ revision: data.revision, result: analyzeBoard(data.tiles, data.nodeLimit) });
};
