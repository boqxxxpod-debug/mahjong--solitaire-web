/// <reference lib="webworker" />
import { analyzeBoard, analyzeTrayBoard, createCertifiedShuffle, type PlayRule, type TileState } from './GameRules';

type Request =
  | { kind: 'analyze'; revision: number; tiles: TileState[]; playRule?: PlayRule; tray?: TileState[]; trayCapacity?: number; nodeLimit: number }
  | { kind: 'hint'; revision: number; requestId: number; tiles: TileState[]; playRule?: PlayRule; tray?: TileState[]; trayCapacity?: number; nodeLimit: number; avoidStateHashes?: string[] }
  | { kind: 'shuffle'; revision: number; tiles: TileState[]; playRule?: PlayRule; tray?: TileState[]; trayCapacity?: number; nodeLimit: number; seed: number; maxAttempts: number };
self.onmessage = ({ data }: MessageEvent<Request>) => {
  const result = data.kind === 'shuffle'
    ? createCertifiedShuffle(data.tiles, data.seed, data.maxAttempts, data.nodeLimit, data.playRule, data.tray, data.trayCapacity)
    : data.playRule === 'tray' ? analyzeTrayBoard(data.tiles, data.tray, data.nodeLimit, data.trayCapacity)
      : analyzeBoard(data.tiles, data.nodeLimit, data.kind === 'hint' ? data.avoidStateHashes ?? [] : []);
  self.postMessage({
    kind: data.kind,
    revision: data.revision,
    requestId: data.kind === 'hint' ? data.requestId : undefined,
    result,
  });
};
