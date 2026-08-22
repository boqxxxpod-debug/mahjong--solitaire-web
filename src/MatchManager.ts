import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';
import { DIFFICULTIES, Difficulty } from './BoardLayout';
import { boardStateHash } from './GameRules';
import type { CertifiedShuffleResult, SearchResult, TileState } from './GameRules';

interface Snapshot { tiles: TileState[]; moves: number; history: Array<{ tiles: TileState[]; moves: number }> }

export class MatchManager {
  private selected: Tile | null = null;
  private revealedFaceDownTile: Tile | null = null;
  private flipping = false;
  private moves = 0;
  private hints: number | null = 3;
  private shuffles: number | null = 2;
  private stuck = false;
  private revision = 0;
  private worker?: Worker;
  private safe?: Snapshot;
  private history: Array<{ tiles: TileState[]; moves: number }> = [];
  private checkingTimer?: number;
  private searchTimer?: number;
  private shuffling = false;
  private hintRequestId = 0;
  private hintTiles: Tile[] = [];

  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart()); this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle()); this.ui.onUndo(() => this.restoreSafe());
    this.ui.onDifficulty((difficulty) => this.changeDifficulty(difficulty));
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.checkProgress();
  }

  select(tile: Tile): void {
    if (this.flipping || this.stuck) return;
    // A tap is user intent: cancel pending analysis so it cannot repaint this
    // newly selected state, even when the logical board hash is unchanged.
    if (this.worker) this.invalidateSearch(); else this.clearHint();
    if (!this.board.isFree(tile)) { tile.flash('blocked'); this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile.faceDown) { this.invalidateSearch(); this.recordHistory(); void this.revealFaceDown(tile); return; }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
      this.invalidateSearch();
      this.recordHistory();
      const first = this.selected; this.selected.setSelected(false);
      this.board.remove(this.selected); this.board.remove(tile); this.selected = null;
      if (this.revealedFaceDownTile === first || this.revealedFaceDownTile === tile) this.revealedFaceDownTile = null;
      this.moves++; this.ui.updateMoves(this.moves);
      const count = this.board.activeTiles.length; this.ui.updateRemaining(count);
      if (count === 0) { this.invalidateSearch(); this.ui.showClear(this.moves); }
      else { this.ui.showMessage('マッチ！ クリア可能性を確認しています'); this.checkProgress(); }
      return;
    }
    this.selected.setSelected(false); this.selected = null; this.ui.showMessage('絵柄が違います', true);
  }

  restart(): void {
    this.invalidateSearch(); this.selected?.setSelected(false); this.selected = null;
    this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.board.restart(); this.moves = 0; this.history = []; this.safe = undefined;
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.checkProgress();
  }

  private changeDifficulty(difficulty: Difficulty): void {
    this.invalidateSearch(); this.board.newDeal(difficulty); window.dispatchEvent(new Event('resize'));
    this.selected = null; this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.moves = 0; this.history = []; this.safe = undefined; this.resetLimits();
    this.ui.reset(this.board.activeTiles.length); this.checkProgress();
  }

  private resetLimits(): void {
    const config = DIFFICULTIES[this.board.difficulty]; this.hints = config.hints; this.shuffles = config.shuffles;
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
  }

  private hint(): void {
    if (this.hints === 0 || this.stuck) return;
    this.invalidateSearch(); this.clearHint();
    this.selected?.setSelected(false); this.selected = null;
    const revision = ++this.revision, requestId = ++this.hintRequestId;
    const tiles = this.board.states(), expectedHash = boardStateHash(tiles);
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.ui.setHinting(true, this.board.difficulty, this.hints, this.shuffles);
    this.checkingTimer = window.setTimeout(() => {
      if (revision === this.revision && requestId === this.hintRequestId) this.ui.showMessage('安全な手を確認しています…');
    }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (revision !== this.revision || requestId !== this.hintRequestId) return;
      worker.terminate(); this.worker = undefined;
      this.finishHint(revision, requestId, expectedHash, undefined);
    }, 5000);
    worker.onmessage = ({ data }: MessageEvent<{ revision: number; requestId?: number; result: SearchResult }>) => {
      if (data.revision !== revision || revision !== this.revision || data.requestId !== requestId) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined;
      this.finishHint(revision, requestId, expectedHash, data.result);
    };
    worker.onerror = () => {
      if (revision !== this.revision || requestId !== this.hintRequestId) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined;
      this.finishHint(revision, requestId, expectedHash, undefined);
    };
    worker.postMessage({ kind: 'hint', revision, requestId, tiles, nodeLimit: 1_000_000 });
  }

  private finishHint(revision: number, requestId: number, expectedHash: string, result?: SearchResult): void {
    if (revision !== this.revision || requestId !== this.hintRequestId || boardStateHash(this.board.states()) !== expectedHash) return;
    window.clearTimeout(this.checkingTimer);
    this.ui.setHinting(false, this.board.difficulty, this.hints, this.shuffles);
    const next = result?.status === 'SOLVABLE' && result.stateHash === expectedHash ? result.actions[0] : undefined;
    if (!next) {
      if (result?.status === 'UNSOLVABLE') { this.stuck = true; this.ui.showStuck(this.shuffles !== 0, Boolean(this.safe)); }
      else this.ui.showMessage('安全な手を確認できませんでした', true);
      return;
    }
    const targets = next.kind === 'pair' ? next.tileIds.map((id) => this.board.tiles[id]) : [this.board.tiles[next.tileId]];
    if (targets.some((tile) => !tile || tile.removed || !this.board.isFree(tile)) ||
      (next.kind === 'pair' && (targets.some((tile) => tile.faceDown) || targets[0].type !== targets[1].type)) ||
      (next.kind === 'reveal' && !targets[0].faceDown)) {
      this.ui.showMessage('安全な手を確認できませんでした', true); return;
    }
    this.hintTiles = targets; targets.forEach((tile) => tile.flash('hint'));
    if (this.hints !== null) this.hints--;
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
    this.ui.showMessage(next.kind === 'pair' ? '安全なペアをハイライトしました' : '安全にめくれる裏向き牌を示しました');
  }

  private clearHint(): void {
    this.hintRequestId++;
    this.hintTiles.forEach((tile) => tile.clearFeedback()); this.hintTiles = [];
  }

  private shuffle(): void {
    if (this.shuffles === 0 || this.shuffling) return;
    this.invalidateSearch();
    const revision = ++this.revision, before = this.snapshot();
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.shuffling = true; this.ui.setShuffling(true, this.board.difficulty, this.hints, this.shuffles);
    this.checkingTimer = window.setTimeout(() => { if (revision === this.revision) this.ui.showMessage('SHUFFLING...'); }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (revision !== this.revision) return;
      worker.terminate(); this.worker = undefined;
      this.finishShuffle(revision, before, { status: 'FAILED', attempts: 24, rejectedUnsolvable: 0, rejectedUnknown: 1 });
    }, 5000);
    worker.onmessage = ({ data }: MessageEvent<{ revision: number; result: CertifiedShuffleResult }>) => {
      if (data.revision !== revision || revision !== this.revision) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined;
      this.finishShuffle(revision, before, data.result);
    };
    worker.onerror = () => {
      if (revision !== this.revision) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined;
      this.finishShuffle(revision, before, { status: 'FAILED', attempts: 0, rejectedUnsolvable: 0, rejectedUnknown: 1 });
    };
    worker.postMessage({ kind: 'shuffle', revision, tiles: before.tiles, nodeLimit: 1_000_000, maxAttempts: 24,
      seed: (revision * 2654435761) >>> 0 });
  }

  private finishShuffle(revision: number, before: Snapshot, result: CertifiedShuffleResult): void {
    if (revision !== this.revision) return;
    window.clearTimeout(this.checkingTimer); this.shuffling = false;
    if (result.status !== 'SOLVABLE' || !result.tiles) {
      this.ui.setShuffling(false, this.board.difficulty, this.hints, this.shuffles);
      this.ui.showMessage('安全な配置を作れませんでした。もう一度お試しください', true); return;
    }
    // The only commit point: board, history and counter advance together after certification.
    this.selected?.setSelected(false); this.selected = null; this.revealedFaceDownTile = null;
    this.board.restore(result.tiles); this.history.push({ tiles: before.tiles, moves: before.moves });
    if (this.shuffles !== null) this.shuffles--; this.stuck = false;
    this.ui.setShuffling(false, this.board.difficulty, this.hints, this.shuffles);
    this.ui.hideResult(); this.ui.showMessage('安全な配置へシャッフルしました'); this.checkProgress();
  }

  private async revealFaceDown(tile: Tile): Promise<void> {
    this.flipping = true;
    const previousTiles = this.board.activeTiles.filter((candidate) => candidate !== tile && candidate.originallyFaceDown && !candidate.faceDown);
    this.selected?.setSelected(false); this.selected = null;
    const animations = previousTiles.map((previous) => previous.flipTo(true)); animations.push(tile.flipTo(false));
    this.revealedFaceDownTile = tile; this.ui.showMessage('裏向き牌を表にしました');
    await Promise.all(animations); this.flipping = false; this.checkProgress();
  }

  private recordHistory(): void { this.history.push({ tiles: this.board.states(), moves: this.moves }); }
  private snapshot(): Snapshot {
    return { tiles: this.board.states(), moves: this.moves, history: this.history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves })) };
  }

  private restoreSafe(): void {
    if (!this.safe) return;
    this.invalidateSearch(); this.board.restore(this.safe.tiles); this.moves = this.safe.moves;
    this.history = this.safe.history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves }));
    this.selected = null; this.revealedFaceDownTile = this.board.tiles.find((tile) => tile.originallyFaceDown && !tile.faceDown && !tile.removed) ?? null;
    this.stuck = false; this.ui.updateMoves(this.moves); this.ui.updateRemaining(this.board.activeTiles.length);
    this.ui.hideResult(); this.ui.showMessage('最後に確認できた安全な盤面へ戻りました'); this.checkProgress();
  }

  private checkProgress(): void {
    const revision = ++this.revision; this.worker?.terminate();
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    const candidate = this.snapshot();
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.checkingTimer = window.setTimeout(() => { if (revision === this.revision) this.ui.showMessage('CHECKING...'); }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (revision !== this.revision) return; worker.terminate(); this.worker = undefined;
      this.applySearchResult(revision, candidate, { status: 'UNKNOWN', solvable: false, canRemovePair: false, visitedStates: 0, cycleStates: 0, maxDepth: 0, removalPairs: 0, revealMoves: 0, actions: [], stateHash: boardStateHash(candidate.tiles) });
    }, 3000);
    worker.onmessage = ({ data }: MessageEvent<{ revision: number; result: SearchResult }>) => {
      if (data.revision !== this.revision || data.revision !== revision) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined; this.applySearchResult(revision, candidate, data.result);
    };
    worker.postMessage({ kind: 'analyze', revision, tiles: candidate.tiles, nodeLimit: 1_000_000 });
  }

  private applySearchResult(revision: number, candidate: Snapshot, result: SearchResult): void {
    if (revision !== this.revision) return; window.clearTimeout(this.checkingTimer);
    if (result.status === 'SOLVABLE') { this.safe = candidate; this.stuck = false; this.ui.hideResult(); this.ui.showMessage('同じ牌を2枚選んでください'); }
    else if (result.status === 'UNSOLVABLE') { this.stuck = true; this.ui.showStuck(this.shuffles !== 0, Boolean(this.safe)); }
    else if (result.status === 'UNKNOWN') { this.ui.showMessage('探索上限のため判定を保留しました'); }
  }

  private invalidateSearch(): void {
    this.revision++; this.clearHint(); this.worker?.terminate(); this.worker = undefined;
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    if (this.shuffling) { this.shuffling = false; this.ui.setShuffling(false, this.board.difficulty, this.hints, this.shuffles); }
    this.ui.setHinting(false, this.board.difficulty, this.hints, this.shuffles);
  }
}
