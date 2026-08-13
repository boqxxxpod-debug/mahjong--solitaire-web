import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';
import { DIFFICULTIES, Difficulty } from './BoardLayout';
import type { AvailableAction, CertifiedShuffleResult, SearchResult, TileState } from './GameRules';
import { clearSavedGame, loadSavedGame, saveGame, SAVE_SCHEMA_VERSION, type SavedGame } from './GamePersistence';

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
  private hintRequestId = 0;
  private hintTargetIds = new Set<number>();
  private hintConsumedStateHash?: string;
  private hintVisitedStateHashes = new Set<string>();
  private storageWarningShown = false;

  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart()); this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle()); this.ui.onUndo(() => this.restoreSafe());
    this.ui.onDifficulty((difficulty) => this.changeDifficulty(difficulty));
    if (!this.restoreSaved()) { this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.persist(); }
    this.checkProgress();
    window.addEventListener('pagehide', () => { if (!this.flipping && !this.shuffling) this.persist(); });
  }

  select(tile: Tile): void {
    if (this.flipping || this.stuck) return;
    if (this.hinting) this.cancelHintRequest();
    const wasHintTarget = this.hintTargetIds.has(tile.id);
    this.board.clearHintDisplay();
    if (this.hintTargetIds.size && !wasHintTarget) {
      this.board.discardHintPlan(); this.hintTargetIds.clear(); this.hintVisitedStateHashes.clear();
    }

    if (!this.board.isFree(tile)) { tile.flash('blocked'); this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile.faceDown) {
      if (!(wasHintTarget && this.hintTargetIds.size === 1)) this.board.discardHintPlan();
      this.hintTargetIds.clear(); this.recordHistory(); void this.revealFaceDown(tile); return;
    }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
      const followedHint = this.hintTargetIds.size === 2 && this.hintTargetIds.has(this.selected.id) && this.hintTargetIds.has(tile.id);
      if (!followedHint) { this.board.discardHintPlan(); this.hintVisitedStateHashes.clear(); }
      this.hintTargetIds.clear(); this.recordHistory();
      const first = this.selected; this.selected.setSelected(false);
      this.board.remove(this.selected); this.board.remove(tile); this.selected = null;
      if (this.revealedFaceDownTile === first || this.revealedFaceDownTile === tile) this.revealedFaceDownTile = null;
      this.moves++; this.ui.updateMoves(this.moves);
      const count = this.board.activeTiles.length; this.ui.updateRemaining(count);
      if (count === 0) { this.discardHint(true); this.invalidateSearch(); clearSavedGame(); this.ui.showClear(this.moves); }
      else { this.ui.showMessage('マッチ！ クリア可能性を確認しています'); this.persist(); this.checkProgress(); }
      return;
    }
    this.board.discardHintPlan(); this.hintTargetIds.clear(); this.hintVisitedStateHashes.clear();
    this.selected.setSelected(false); this.selected = null; this.ui.showMessage('絵柄が違います', true);
  }

  restart(): void {
    this.discardHint(true); this.invalidateSearch(); this.selected?.setSelected(false); this.selected = null;
    this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.board.restart(); this.moves = 0; this.history = []; this.safe = undefined;
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.persist(); this.checkProgress();
  }

  private changeDifficulty(difficulty: Difficulty): void {
    this.discardHint(true); this.invalidateSearch(); this.board.newDeal(difficulty); window.dispatchEvent(new Event('resize'));
    this.selected = null; this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.moves = 0; this.history = []; this.safe = undefined; this.resetLimits();
    this.ui.reset(this.board.activeTiles.length); this.persist(); this.checkProgress();
  }

  private resetLimits(): void {
    const config = DIFFICULTIES[this.board.difficulty]; this.hints = config.hints; this.shuffles = config.shuffles;
    this.hintConsumedStateHash = undefined; this.hintVisitedStateHashes.clear();
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
  }

  private hint(): void {
    if (this.hints === 0 || this.stuck || this.flipping || this.shuffling || this.hinting || this.board.activeTiles.length === 0) return;
    this.selected?.setSelected(false); this.selected = null;
    this.board.clearHintDisplay(); this.hintTargetIds.clear();

    // HINT owns the solver while it is running. Stop an older progress check,
    // then identify this request by revision, request ID, and board hash.
    this.worker?.terminate(); this.worker = undefined;
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    const revision = ++this.revision;
    const requestId = ++this.hintRequestId;
    const stateHash = this.board.stateHash();
    const candidate = this.snapshot();

    const cached = this.board.getHint();
    if (cached) {
      this.safe = candidate; this.stuck = false; this.displayHint(cached, stateHash); return;
    }

    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.hinting = true;
    this.checkingTimer = window.setTimeout(() => {
      if (requestId === this.hintRequestId && revision === this.revision && this.hinting) this.ui.showMessage('THINKING...');
    }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (requestId !== this.hintRequestId || revision !== this.revision) return;
      worker.terminate(); this.worker = undefined; this.hinting = false;
      this.ui.showMessage('安全な手を確認できませんでした。回数は消費していません', true);
    }, 5000);
    worker.onmessage = ({ data }: MessageEvent<{ kind: 'hint'; revision: number; requestId: number; result: SearchResult }>) => {
      if (data.kind !== 'hint' || data.requestId !== requestId || requestId !== this.hintRequestId || data.revision !== revision || revision !== this.revision) return;
      window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
      worker.terminate(); this.worker = undefined; this.hinting = false;
      if (this.board.stateHash() !== stateHash) return;
      if (data.result.status === 'SOLVABLE' && data.result.stateHash === stateHash) {
        const action = this.board.getHint(data.result);
        if (action) {
          this.safe = candidate; this.stuck = false;
          if (this.displayHint(action, stateHash)) return;
        }
      }
      if (data.result.status === 'UNSOLVABLE') {
        this.board.discardHintPlan(); this.stuck = true; this.ui.showStuck(this.shuffles !== 0, Boolean(this.safe)); return;
      }
      this.ui.showMessage('安全な手を確認できませんでした。回数は消費していません', true);
    };
    worker.onerror = () => {
      if (requestId !== this.hintRequestId || revision !== this.revision) return;
      window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
      worker.terminate(); this.worker = undefined; this.hinting = false;
      this.ui.showMessage('HINTの探索に失敗しました。回数は消費していません', true);
    };
    worker.postMessage({
      kind: 'hint', revision, requestId, tiles: candidate.tiles, nodeLimit: 1_000_000,
      avoidStateHashes: [...this.hintVisitedStateHashes],
    });
  }

  private displayHint(action: AvailableAction<Tile>, stateHash: string): boolean {
    if (this.board.stateHash() !== stateHash || this.stuck) return false;
    this.board.clearHintDisplay(); this.hintTargetIds.clear();
    if (action.kind === 'pair') {
      const [first, second] = action.tiles;
      if (first.removed || second.removed || first.faceDown || second.faceDown || first.type !== second.type || !this.board.isFree(first) || !this.board.isFree(second)) return false;
      first.flash('hint'); second.flash('hint'); this.hintTargetIds.add(first.id); this.hintTargetIds.add(second.id);
      this.ui.showMessage('安全なペアをハイライトしました');
    } else {
      if (action.tile.removed || !action.tile.faceDown || !this.board.isFree(action.tile)) return false;
      action.tile.flash('hint'); this.hintTargetIds.add(action.tile.id);
      this.ui.showMessage('安全にめくれる裏向き牌をハイライトしました');
    }
    this.hintVisitedStateHashes.add(stateHash);
    if (this.hintConsumedStateHash !== stateHash) {
      if (this.hints !== null) this.hints--;
      this.hintConsumedStateHash = stateHash;
      this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
      this.persist();
    }
    return true;
  }

  private cancelHintRequest(): void {
    if (!this.hinting) return;
    this.hintRequestId++; this.revision++; this.worker?.terminate(); this.worker = undefined; this.hinting = false;
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
  }

  private discardHint(discardPlan: boolean): void {
    this.cancelHintRequest(); this.board.clearHintDisplay(); this.hintTargetIds.clear();
    if (discardPlan) { this.board.discardHintPlan(); this.hintVisitedStateHashes.clear(); }
  }

  private shuffle(): void {
    if (this.shuffles === 0 || this.shuffling) return;
    this.discardHint(true); this.invalidateSearch();
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
    this.ui.hideResult(); this.ui.showMessage('安全な配置へシャッフルしました'); this.persist(); this.checkProgress();
  }

  private async revealFaceDown(tile: Tile): Promise<void> {
    this.flipping = true;
    const previousTiles = this.board.activeTiles.filter((candidate) => candidate !== tile && candidate.originallyFaceDown && !candidate.faceDown);
    this.selected?.setSelected(false); this.selected = null;
    const animations = previousTiles.map((previous) => previous.flipTo(true)); animations.push(tile.flipTo(false));
    this.revealedFaceDownTile = tile; this.ui.showMessage('裏向き牌を表にしました');
    await Promise.all(animations); this.flipping = false; this.persist(); this.checkProgress();
  }

  private recordHistory(): void { this.history.push({ tiles: this.board.states(), moves: this.moves }); }
  private snapshot(): Snapshot {
    return { tiles: this.board.states(), moves: this.moves, history: this.history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves })) };
  }

  private restoreSafe(): void {
    if (!this.safe) return;
    this.discardHint(true); this.invalidateSearch(); this.board.restore(this.safe.tiles); this.moves = this.safe.moves;
    this.history = this.safe.history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves }));
    this.selected = null; this.revealedFaceDownTile = this.board.tiles.find((tile) => tile.originallyFaceDown && !tile.faceDown && !tile.removed) ?? null;
    this.stuck = false; this.ui.updateMoves(this.moves); this.ui.updateRemaining(this.board.activeTiles.length);
    this.ui.hideResult(); this.ui.showMessage('最後に確認できた安全な盤面へ戻りました'); this.persist(); this.checkProgress();
  }

  private checkProgress(): void {
    const revision = ++this.revision; this.worker?.terminate();
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    const candidate = this.snapshot();
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }); this.worker = worker;
    this.checkingTimer = window.setTimeout(() => { if (revision === this.revision && !this.hintTargetIds.size) this.ui.showMessage('CHECKING...'); }, 120);
    this.searchTimer = window.setTimeout(() => {
      if (revision !== this.revision) return; worker.terminate(); this.worker = undefined;
      this.applySearchResult(revision, candidate, { status: 'UNKNOWN', solvable: false, canRemovePair: false, visitedStates: 0, cycleStates: 0, maxDepth: 0, removalPairs: 0, revealMoves: 0 });
    }, 3000);
    worker.onmessage = ({ data }: MessageEvent<{ revision: number; result: SearchResult }>) => {
      if (data.revision !== this.revision || data.revision !== revision) return;
      window.clearTimeout(this.searchTimer); worker.terminate(); this.worker = undefined; this.applySearchResult(revision, candidate, data.result);
    };
    worker.postMessage({ kind: 'analyze', revision, tiles: candidate.tiles, nodeLimit: 1_000_000 });
  }

  private applySearchResult(revision: number, candidate: Snapshot, result: SearchResult): void {
    if (revision !== this.revision) return; window.clearTimeout(this.checkingTimer);
    if (result.status === 'SOLVABLE') {
      this.safe = candidate; this.stuck = false; this.ui.hideResult();
      this.persist();
      if (!this.hintTargetIds.size) this.ui.showMessage('同じ牌を2枚選んでください');
    } else if (result.status === 'UNSOLVABLE') {
      this.discardHint(true); this.stuck = true; this.ui.showStuck(this.shuffles !== 0, Boolean(this.safe));
    } else if (result.status === 'UNKNOWN' && !this.hintTargetIds.size) {
      this.ui.showMessage('探索上限のため判定を保留しました');
    }
  }

  private invalidateSearch(): void {
    if (this.hinting) this.hintRequestId++;
    this.hinting = false; this.revision++; this.worker?.terminate(); this.worker = undefined;
    window.clearTimeout(this.checkingTimer); window.clearTimeout(this.searchTimer);
    if (this.shuffling) { this.shuffling = false; this.ui.setShuffling(false, this.board.difficulty, this.hints, this.shuffles); }
  }

  private restoreSaved(): boolean {
    const loaded = loadSavedGame();
    if (!loaded.game) {
      if (loaded.discarded) queueMicrotask(() => this.ui.showMessage('保存データを復元できなかったため新しいゲームを開始しました', true));
      return false;
    }
    try {
      const game = loaded.game;
      this.board.newDeal(game.difficulty); this.board.restoreInitialDeal(game.initialTiles); this.board.restore(game.tiles);
      this.moves = game.moves; this.hints = game.hints; this.shuffles = game.shuffles;
      this.history = this.cloneHistory(game.history);
      this.safe = game.safe ? { tiles: game.safe.tiles.map((tile) => ({ ...tile })), moves: game.safe.moves, history: this.cloneHistory(game.safe.history) } : undefined;
      this.selected = null; this.revealedFaceDownTile = this.board.tiles.find((tile) => tile.originallyFaceDown && !tile.faceDown && !tile.removed) ?? null;
      this.stuck = false; this.board.discardHintPlan(); this.hintTargetIds.clear(); this.hintVisitedStateHashes.clear(); this.hintConsumedStateHash = undefined;
      this.ui.restore(this.board.activeTiles.length, this.moves, game.elapsedMs); this.ui.updateDifficulty(game.difficulty, this.hints, this.shuffles);
      return true;
    } catch {
      clearSavedGame(); this.board.newDeal();
      queueMicrotask(() => this.ui.showMessage('保存データを復元できなかったため新しいゲームを開始しました', true));
      return false;
    }
  }

  private cloneHistory(history: readonly { tiles: TileState[]; moves: number }[]): Array<{ tiles: TileState[]; moves: number }> {
    return history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves }));
  }

  private persist(): void {
    if (this.flipping || this.shuffling || this.board.activeTiles.length === 0) return;
    const game: SavedGame = {
      version: SAVE_SCHEMA_VERSION, savedAt: Date.now(), difficulty: this.board.difficulty,
      tiles: this.board.states(), initialTiles: this.board.initialStates(), moves: this.moves,
      hints: this.hints, shuffles: this.shuffles, history: this.cloneHistory(this.history),
      safe: this.safe ? { tiles: this.safe.tiles.map((tile) => ({ ...tile })), moves: this.safe.moves, history: this.cloneHistory(this.safe.history) } : null,
      elapsedMs: this.ui.elapsedTime(),
    };
    if (!saveGame(game) && !this.storageWarningShown) {
      this.storageWarningShown = true; this.ui.showMessage('ゲームを保存できませんでした。プレイは続けられます', true);
    }
  }
}
