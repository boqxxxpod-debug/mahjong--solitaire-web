/// <reference lib="webworker" />
import { analyzeBoard, createCertifiedShuffle, TileState } from './GameRules';

type Request =
  | { kind: 'analyze' | 'hint'; revision: number; requestId?: number; tiles: TileState[]; nodeLimit: number }
  | { kind: 'shuffle'; revision: number; tiles: TileState[]; nodeLimit: number; seed: number; maxAttempts: number };
self.onmessage = ({ data }: MessageEvent<Request>) => {
  const result = data.kind === 'shuffle'
    ? createCertifiedShuffle(data.tiles, data.seed, data.maxAttempts, data.nodeLimit)
    : analyzeBoard(data.tiles, data.nodeLimit);
  self.postMessage({ kind: data.kind, revision: data.revision, requestId: 'requestId' in data ? data.requestId : undefined, result });
};
