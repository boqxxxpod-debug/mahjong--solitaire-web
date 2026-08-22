import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';
import { DIFFICULTIES, Difficulty } from './BoardLayout';
import { boardStateHash, isFreeTile } from './GameRules';
import type { CertifiedShuffleResult, SearchAction, SearchResult, TileState } from './GameRules';

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
  private hinting = false;
  private requestId = 0;

  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart()); this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle()); this.ui.onUndo(() => this.restoreSafe());
    this.ui.onDifficulty((difficulty) => this.changeDifficulty(difficulty));
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.checkProgress();
  }

  select(tile: Tile): void {
    if (this.flipping || this.stuck) return;
    this.cancelHint();
    if (!this.board.isFree(tile)) { tile.flash('blocked'); this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile.faceDown) { this.recordHistory(); void this.revealFaceDown(tile); return; }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
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
    if (this.hints === 0 || this.stuck || this.hinting || this.board.activeTiles.length === 0) return;
    this.invalidateSearch(); this.clearHint(); this.selected?.setSelected(false); this.selected = null;
    const revision = ++this.revision, requestId = ++this.requestId, states = this.board.states();
    const hash = boardStateHash(states); const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.hinting = true; this.ui.setHinting(true, this.board.difficulty, this.hints, this.shuffles);
    this.checkingTimer = window.setTimeout(() => { if (revision === this.revision) this.ui.showMessage('THINKING...'); }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (revision !== this.revision) return; worker.terminate(); this.worker = undefined;
      this.finishHint(revision, requestId, hash, { status: 'UNKNOWN', solvable: false, canRemovePair: false, visitedStates: 0, cycleStates: 0, maxDepth: 0, removalPairs: 0, revealMoves: 0, actions: [], stateHash: hash });
    }, 5000);
    worker.onmessage = ({ data }: MessageEvent<{ revision: number; requestId: number; result: SearchResult }>) => {
      if (data.revision !== revision || data.requestId !== requestId || revision !== this.revision) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined; this.finishHint(revision, requestId, hash, data.result);
    };
    worker.onerror = () => { if (revision === this.revision) this.finishHint(revision, requestId, hash, undefined); };
    worker.postMessage({ kind: 'analyze', revision, requestId, tiles: states, nodeLimit: 1_000_000 });
  }

  private finishHint(revision: number, requestId: number, hash: string, result?: SearchResult): void {
    if (revision !== this.revision || requestId !== this.requestId) return;
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer); this.hinting = false;
    this.ui.setHinting(false, this.board.difficulty, this.hints, this.shuffles);
    const live = this.board.states();
    if (!result || result.status !== 'SOLVABLE' || result.stateHash !== hash || boardStateHash(live) !== hash || !result.actions[0]) {
      this.ui.showMessage(result?.status === 'UNSOLVABLE' ? 'この盤面から安全な手はありません' : '安全な手を確認できませんでした', true); return;
    }
    const action = result.actions[0]; if (!this.isLiveLegal(action, live)) { this.ui.showMessage('安全な手を確認できませんでした', true); return; }
    if (this.hints !== null) this.hints--; this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
    if (action.kind === 'pair') { this.board.tiles[action.tileIds[0]].flash('hint'); this.board.tiles[action.tileIds[1]].flash('hint'); this.ui.showMessage('安全なペアをハイライトしました'); }
    else { this.board.tiles[action.tileId].flash('hint'); this.ui.showMessage('安全にめくれる裏向き牌をハイライトしました'); }
  }

  private isLiveLegal(action: SearchAction, states: TileState[]): boolean {
    if (action.kind === 'reveal') { const tile = states[action.tileId]; return Boolean(tile?.faceDown && isFreeTile(tile, states)); }
    const [a, b] = action.tileIds.map((id) => states[id]);
    return Boolean(a && b && !a.faceDown && !b.faceDown && a.type === b.type && isFreeTile(a, states) && isFreeTile(b, states));
  }

  private clearHint(): void { this.board.tiles.forEach((tile) => tile.clearFeedback()); }
  private cancelHint(): void { if (this.hinting) this.invalidateSearch(); this.clearHint(); }

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
    this.revision++; this.worker?.terminate(); this.worker = undefined;
    this.clearHint();
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    if (this.hinting) { this.hinting = false; this.ui.setHinting(false, this.board.difficulty, this.hints, this.shuffles); }
    if (this.shuffling) { this.shuffling = false; this.ui.setShuffling(false, this.board.difficulty, this.hints, this.shuffles); }
  }
}
