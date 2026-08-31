import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';
import { DIFFICULTIES, Difficulty } from './BoardLayout';
import { isTrayClear, isTrayGameOver, moveTileToTray, type AvailableAction, type CertifiedShuffleResult, type PlayRule, type SearchResult, type TileState } from './GameRules';
import { clearSavedGame, loadSavedGame, saveGame, SAVE_SCHEMA_VERSION, type SavedGame } from './GamePersistence';
import { DIORAMA_STAGE_ORDER, DIORAMA_STAGES, type DioramaStageId } from './DioramaStages';

interface HistoryEntry { tiles: TileState[]; moves: number; tray: TileState[] }
interface Snapshot extends HistoryEntry { history: HistoryEntry[] }

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
  private history: HistoryEntry[] = [];
  private playRule: PlayRule = 'pair';
  private tray: TileState[] = [];
  private processingTap = false;
  private checkingTimer?: number;
  private searchTimer?: number;
  private shuffling = false;
  private hinting = false;
  private hintRequestId = 0;
  private hintTargetIds = new Set<number>();
  private hintConsumedStateHash?: string;
  private hintVisitedStateHashes = new Set<string>();
  private storageWarningShown = false;
  private mode: 'classic' | 'tour' = 'classic';
  private stageId?: DioramaStageId;
  private unlocked = new Set<DioramaStageId>(['gate']);
  private completed = new Set<DioramaStageId>();
  private directPreview = false;

  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart()); this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle()); this.ui.onUndo(() => this.undo());
    this.ui.onPlayRule((rule) => this.changePlayRule(rule));
    this.ui.onDifficulty((difficulty) => this.changeDifficulty(difficulty));
    this.ui.onModeMenu(() => { this.renderMode(); this.ui.showModeSheet(); }); this.ui.onClassic(() => this.chooseClassic());
    this.ui.onStage((stage) => this.startStage(stage)); this.ui.onReplay(() => this.replayStage()); this.ui.onNewDeal(() => this.newStageDeal()); this.ui.onNextStage(() => this.nextStage());
    try { const remembered = localStorage.getItem('mahjong-solitaire.play-rule.v1'); if (remembered === 'tray') this.playRule = 'tray'; } catch { /* optional */ }
    this.loadProgression();
    const params = new URLSearchParams(location.search), requested = params.get('mode') === 'tour' ? params.get('stage') : null;
    const directStage = requested && DIORAMA_STAGE_ORDER.includes(requested as DioramaStageId) ? requested as DioramaStageId : undefined;
    if (directStage) { this.mode = 'tour'; this.stageId = directStage; this.directPreview = !this.unlocked.has(directStage); this.board.newDioramaDeal(directStage); this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.persist(); }
    else if (!this.restoreSaved()) { this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.persist(); }
    this.renderMode(); this.renderTray();
    this.checkProgress();
    window.addEventListener('pagehide', () => { if (!this.flipping && !this.shuffling) this.persist(); });
  }

  select(tile: Tile): void {
    if (this.flipping || this.stuck || this.processingTap) return;
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
    if (this.playRule === 'tray') { this.selectToTray(tile); return; }
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
      if (count === 0) { this.discardHint(true); this.invalidateSearch(); clearSavedGame(); if (this.mode === 'tour' && this.stageId) this.completeStage(); else this.ui.showClear(this.moves); }
      else { this.ui.showMessage('マッチ！ クリア可能性を確認しています'); this.persist(); this.checkProgress(); }
      return;
    }
    this.board.discardHintPlan(); this.hintTargetIds.clear(); this.hintVisitedStateHashes.clear();
    this.selected.setSelected(false); this.selected = null; this.ui.showMessage('絵柄が違います', true);
  }

  private selectToTray(tile: Tile): void {
    const states = this.board.states(); const matchedType = this.tray.some((held) => held.type === tile.type) ? tile.type : undefined;
    const capacity = this.currentTrayCapacity();
    const nextTray = moveTileToTray(states[tile.id], states, this.tray, capacity);
    if (!nextTray) { tile.flash('blocked'); this.ui.showMessage('トレイが満杯です。一致する牌を選んでください', true); return; }
    this.processingTap = true; this.recordHistory(); this.board.remove(tile); this.tray = nextTray.map((held) => ({ ...held }));
    this.moves++; this.ui.updateMoves(this.moves); this.ui.updateRemaining(this.board.activeTiles.length); this.renderTray();
    if (matchedType) this.ui.showTrayMatch(matchedType); this.processingTap = false;
    if (isTrayClear(this.board.states(), this.tray)) { this.discardHint(true); this.invalidateSearch(); clearSavedGame();
      if (this.mode === 'tour' && this.stageId) this.completeStage(); else this.ui.showClear(this.moves); return; }
    if (isTrayGameOver(this.board.states(), this.tray, capacity)) { this.stuck = true; this.persist(); this.ui.showStuck(this.shuffles !== 0, true); return; }
    this.ui.showMessage(this.tray.length < capacity ? '牌をトレイへ移しました' : '満杯：一致するFREE TILEで救済できます'); this.persist(); this.checkProgress();
  }

  private changePlayRule(rule: PlayRule): void {
    if (rule === this.playRule) return;
    if (this.moves > 0 && !window.confirm('現在のゲームを終了してプレイルールを切り替えますか？')) return;
    this.playRule = rule; try { localStorage.setItem('mahjong-solitaire.play-rule.v1', rule); } catch { /* optional */ }
    this.unlocked = new Set(['gate']); this.completed.clear(); this.loadProgression(); this.renderMode();
    this.ui.hideModeSheet(); this.restart(); window.dispatchEvent(new Event('resize'));
    if (rule === 'tray') { try { if (!localStorage.getItem('mahjong-solitaire.tray-intro.v1')) { this.ui.showMessage('FREE TILEを難易度別3〜5枠へ。同じ牌2枚で自動消去します'); localStorage.setItem('mahjong-solitaire.tray-intro.v1', '1'); } } catch { /* optional */ } }
  }

  private renderTray(): void { this.ui.renderPlayRule(this.playRule, this.tray.map((tile) => tile.type), this.currentTrayCapacity()); this.ui.setUndoEnabled(this.history.length > 0); }

  restart(): void {
    this.discardHint(true); this.invalidateSearch(); this.selected?.setSelected(false); this.selected = null;
    this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.board.restart(); this.moves = 0; this.tray = []; this.history = []; this.safe = undefined;
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.renderTray(); this.persist(); this.checkProgress();
  }

  private changeDifficulty(difficulty: Difficulty): void {
    this.mode = 'classic'; this.stageId = undefined; this.directPreview = false;
    this.discardHint(true); this.invalidateSearch(); this.board.newDeal(difficulty); window.dispatchEvent(new Event('resize'));
    this.selected = null; this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.moves = 0; this.tray = []; this.history = []; this.safe = undefined; this.resetLimits();
    this.ui.reset(this.board.activeTiles.length); this.renderTray(); this.persist(); this.checkProgress();
  }

  private resetLimits(): void {
    const config = this.mode === 'tour' && this.stageId ? DIORAMA_STAGES[this.stageId] : DIFFICULTIES[this.board.difficulty]; this.hints = config.hints; this.shuffles = config.shuffles;
    this.hintConsumedStateHash = undefined; this.hintVisitedStateHashes.clear();
    this.refreshControls();
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
    const stateHash = this.currentStateHash();
    const candidate = this.snapshot();

    const cached = this.playRule === 'pair' ? this.board.getHint() : null;
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
      if (this.currentStateHash() !== stateHash) return;
      if (data.result.status === 'SOLVABLE' && data.result.stateHash === stateHash) {
        const solverAction = data.result.actions[0];
        const action = this.playRule === 'tray' && solverAction?.kind === 'tray' ? { kind: 'reveal' as const, tile: this.board.tiles[solverAction.tileId] } : this.board.getHint(data.result);
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
      kind: 'hint', revision, requestId, tiles: candidate.tiles, playRule: this.playRule, tray: candidate.tray, nodeLimit: 1_000_000,
      trayCapacity: this.currentTrayCapacity(),
      avoidStateHashes: [...this.hintVisitedStateHashes],
    });
  }

  private displayHint(action: AvailableAction<Tile>, stateHash: string): boolean {
    if (this.currentStateHash() !== stateHash || this.stuck) return false;
    this.board.clearHintDisplay(); this.hintTargetIds.clear();
    if (action.kind === 'pair') {
      const [first, second] = action.tiles;
      if (first.removed || second.removed || first.faceDown || second.faceDown || first.type !== second.type || !this.board.isFree(first) || !this.board.isFree(second)) return false;
      first.flash('hint'); second.flash('hint'); this.hintTargetIds.add(first.id); this.hintTargetIds.add(second.id);
      this.ui.showMessage('安全なペアをハイライトしました');
    } else {
      if (action.tile.removed || (this.playRule === 'pair' && !action.tile.faceDown) || !this.board.isFree(action.tile)) return false;
      action.tile.flash('hint'); this.hintTargetIds.add(action.tile.id);
      this.ui.showMessage(this.playRule === 'tray' ? '安全にトレイへ移せる牌をハイライトしました' : '安全にめくれる裏向き牌をハイライトしました');
    }
    this.hintVisitedStateHashes.add(stateHash);
    if (this.hintConsumedStateHash !== stateHash) {
      if (this.hints !== null) this.hints--;
      this.hintConsumedStateHash = stateHash;
      this.refreshControls();
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
    this.shuffling = true; this.refreshControls();
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
    worker.postMessage({ kind: 'shuffle', revision, tiles: before.tiles, playRule: this.playRule, tray: before.tray, trayCapacity: this.currentTrayCapacity(), nodeLimit: 1_000_000, maxAttempts: 24,
      seed: (revision * 2654435761) >>> 0 });
  }

  private finishShuffle(revision: number, before: Snapshot, result: CertifiedShuffleResult): void {
    if (revision !== this.revision) return;
    window.clearTimeout(this.checkingTimer); this.shuffling = false;
    if (result.status !== 'SOLVABLE' || !result.tiles) {
      this.refreshControls();
      this.ui.showMessage('安全な配置を作れませんでした。もう一度お試しください', true); return;
    }
    // The only commit point: board, history and counter advance together after certification.
    this.selected?.setSelected(false); this.selected = null; this.revealedFaceDownTile = null;
    this.board.restore(result.tiles); this.history.push({ tiles: before.tiles, moves: before.moves, tray: before.tray });
    if (this.shuffles !== null) this.shuffles--; this.stuck = false;
    this.refreshControls();
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

  private recordHistory(): void { this.history.push({ tiles: this.board.states(), moves: this.moves, tray: this.tray.map((tile) => ({ ...tile })) }); this.renderTray(); }
  private snapshot(): Snapshot {
    return { tiles: this.board.states(), moves: this.moves, tray: this.tray.map((tile) => ({ ...tile })), history: this.cloneHistory(this.history) };
  }

  private undo(): void {
    const previous = this.history.pop(); if (!previous || this.flipping || this.shuffling) return;
    this.discardHint(true); this.invalidateSearch(); this.board.restore(previous.tiles); this.moves = previous.moves; this.tray = previous.tray.map((tile) => ({ ...tile }));
    this.selected = null; this.stuck = false; this.ui.updateMoves(this.moves); this.ui.updateRemaining(this.board.activeTiles.length); this.ui.hideResult(); this.renderTray(); this.persist(); this.checkProgress();
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
    worker.postMessage({ kind: 'analyze', revision, tiles: candidate.tiles, playRule: this.playRule, tray: candidate.tray, trayCapacity: this.currentTrayCapacity(), nodeLimit: 1_000_000 });
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
    if (this.shuffling) { this.shuffling = false; this.refreshControls(); }
  }

  private currentStateHash(): string { return this.playRule === 'pair' ? this.board.stateHash() : `${this.board.stateHash()}#${this.tray.map((tile) => `${tile.id}:${tile.type}`).sort().join(',')}`; }

  private currentTrayCapacity(): number {
    return this.mode === 'tour' && this.stageId
      ? DIORAMA_STAGES[this.stageId].trayCapacity
      : DIFFICULTIES[this.board.difficulty].trayCapacity;
  }

  private refreshControls(): void {
    this.ui.setShuffling(this.shuffling, this.board.difficulty, this.hints, this.shuffles);
    if (this.mode === 'tour' && this.stageId) this.ui.updateTourLimits(DIORAMA_STAGES[this.stageId].label, this.hints, this.shuffles);
  }

  private renderMode(): void {
    this.ui.renderMode(this.mode, DIORAMA_STAGE_ORDER.map((id, index) => ({ id, label: DIORAMA_STAGES[id].label,
      description: DIORAMA_STAGES[id].description, unlocked: this.unlocked.has(id) || (this.directPreview && this.stageId === id),
      completed: this.completed.has(id), prerequisite: index ? DIORAMA_STAGES[DIORAMA_STAGE_ORDER[index - 1]].label : undefined })), this.stageId);
  }

  private resetBoardState(): void {
    this.discardHint(true); this.invalidateSearch(); this.selected = null; this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false;
    this.moves = 0; this.tray = []; this.history = []; this.safe = undefined; this.resetLimits(); this.ui.reset(this.board.activeTiles.length); this.renderMode(); this.renderTray(); this.persist(); this.checkProgress();
    window.dispatchEvent(new Event('resize'));
  }

  private chooseClassic(): void {
    if (this.mode === 'classic') { this.ui.hideModeSheet(); return; }
    this.mode = 'classic'; this.stageId = undefined; this.directPreview = false; this.board.newDeal(this.board.difficulty); this.ui.hideModeSheet(); this.resetBoardState();
  }

  private startStage(stageId: DioramaStageId): void {
    if (!this.unlocked.has(stageId) && !(this.directPreview && this.stageId === stageId)) return;
    if (this.mode === 'tour' && this.stageId === stageId) { this.ui.hideModeSheet(); return; }
    this.mode = 'tour'; this.stageId = stageId; this.directPreview = false; this.board.newDioramaDeal(stageId); this.ui.hideModeSheet(); this.resetBoardState();
  }

  private replayStage(): void { if (!this.stageId) return; this.board.restart(); this.ui.hideResult(); this.resetBoardState(); }
  private newStageDeal(): void { if (!this.stageId) return; this.board.newDioramaDeal(this.stageId); this.ui.hideResult(); this.resetBoardState(); }
  private nextStage(): void { if (!this.stageId) return; const next = DIORAMA_STAGE_ORDER[DIORAMA_STAGE_ORDER.indexOf(this.stageId) + 1]; if (next && this.unlocked.has(next)) { this.board.newDioramaDeal(next); this.stageId = next; this.directPreview = false; this.ui.hideResult(); this.resetBoardState(); } }

  private completeStage(): void {
    const stage = this.stageId!; const index = DIORAMA_STAGE_ORDER.indexOf(stage);
    // A direct preview can only advance progression when its prerequisites were already genuinely completed.
    if (index === 0 || DIORAMA_STAGE_ORDER.slice(0, index).every((id) => this.completed.has(id))) {
      this.unlocked.add(stage); this.completed.add(stage); const next = DIORAMA_STAGE_ORDER[index + 1]; if (next) this.unlocked.add(next); this.directPreview = false; this.saveProgression();
    }
    this.renderMode(); this.ui.showTourClear(this.moves, Boolean(DIORAMA_STAGE_ORDER[index + 1] && this.unlocked.has(DIORAMA_STAGE_ORDER[index + 1])));
  }

  private loadProgression(): void {
    try { const raw = localStorage.getItem(`mahjong-solitaire.tour-progress.v1.${this.playRule}`) ??
      (this.playRule === 'pair' ? localStorage.getItem('mahjong-solitaire.tour-progress.v1') : null); if (!raw) return; const value = JSON.parse(raw) as { unlocked?: unknown; completed?: unknown };
      if (!Array.isArray(value.unlocked) || !Array.isArray(value.completed)) return;
      const unlocked = value.unlocked.filter((id): id is DioramaStageId => DIORAMA_STAGE_ORDER.includes(id as DioramaStageId));
      const completed = value.completed.filter((id): id is DioramaStageId => DIORAMA_STAGE_ORDER.includes(id as DioramaStageId));
      const valid = unlocked.includes('gate') && completed.every((id) => unlocked.includes(id) && DIORAMA_STAGE_ORDER.slice(0, DIORAMA_STAGE_ORDER.indexOf(id)).every((previous) => completed.includes(previous))) &&
        unlocked.every((id) => id === 'gate' || completed.includes(DIORAMA_STAGE_ORDER[DIORAMA_STAGE_ORDER.indexOf(id) - 1]));
      if (valid) { this.unlocked = new Set(unlocked); this.completed = new Set(completed); return; }

      // The original tour contained Gate → Tower → Bridge → Dragon. Retain
      // that completed prefix, then unlock the first newly inserted stage.
      const legacyIds = new Set(['gate', 'tower', 'bridge', 'dragon']);
      if (![...value.unlocked, ...value.completed].every((id) => typeof id === 'string' && legacyIds.has(id))) return;
      const legacyCompleted = new Set(value.completed);
      const migrated: DioramaStageId[] = [];
      for (const id of ['gate', 'tower', 'bridge'] as const) {
        if (!legacyCompleted.has(id)) break;
        migrated.push(id);
      }
      const next = DIORAMA_STAGE_ORDER[migrated.length];
      this.completed = new Set(migrated); this.unlocked = new Set([...migrated, ...(next ? [next] : [])]); this.saveProgression();
    } catch { /* storage is optional */ }
  }
  private saveProgression(): void { try { localStorage.setItem(`mahjong-solitaire.tour-progress.v1.${this.playRule}`, JSON.stringify({ unlocked: [...this.unlocked], completed: [...this.completed] })); } catch { /* gameplay remains available */ } }

  private restoreSaved(): boolean {
    const loaded = loadSavedGame();
    if (!loaded.game) {
      if (loaded.discarded) queueMicrotask(() => this.ui.showMessage('保存データを復元できなかったため新しいゲームを開始しました', true));
      return false;
    }
    try {
      const game = loaded.game;
      this.playRule = game.playRule; this.tray = game.tray.map((tile) => ({ ...tile }));
      if (game.mode === 'tour') { this.mode = 'tour'; this.stageId = game.stageId; this.unlocked = new Set(game.unlockedStages); this.completed = new Set(game.completedStages); this.board.restoreDioramaGeometry(game.stageId, game.initialTiles); }
      else { this.mode = 'classic'; this.stageId = undefined; this.board.newDeal(game.difficulty); }
      if (this.tray.length > this.currentTrayCapacity()) throw new Error('Saved tray exceeds this level capacity');
      this.board.restoreInitialDeal(game.initialTiles); this.board.restore(game.tiles);
      this.moves = game.moves; this.hints = game.hints; this.shuffles = game.shuffles;
      this.history = this.cloneHistory(game.history);
      this.safe = game.safe ? { tiles: game.safe.tiles.map((tile) => ({ ...tile })), moves: game.safe.moves, tray: game.safe.tray.map((tile) => ({ ...tile })), history: this.cloneHistory(game.safe.history) } : undefined;
      this.selected = null; this.revealedFaceDownTile = this.board.tiles.find((tile) => tile.originallyFaceDown && !tile.faceDown && !tile.removed) ?? null;
      this.stuck = false; this.board.discardHintPlan(); this.hintTargetIds.clear(); this.hintVisitedStateHashes.clear(); this.hintConsumedStateHash = undefined;
      this.ui.restore(this.board.activeTiles.length, this.moves, game.elapsedMs); this.refreshControls(); this.renderTray();
      return true;
    } catch {
      clearSavedGame(); this.board.newDeal();
      queueMicrotask(() => this.ui.showMessage('保存データを復元できなかったため新しいゲームを開始しました', true));
      return false;
    }
  }

  private cloneHistory(history: readonly HistoryEntry[]): HistoryEntry[] {
    return history.map((entry) => ({ tiles: entry.tiles.map((tile) => ({ ...tile })), moves: entry.moves, tray: entry.tray.map((tile) => ({ ...tile })) }));
  }

  private persist(): void {
    if (this.flipping || this.shuffling || this.board.activeTiles.length === 0 || (this.mode === 'tour' && this.stageId && !this.unlocked.has(this.stageId))) return;
    const base = {
      version: SAVE_SCHEMA_VERSION, savedAt: Date.now(),
      tiles: this.board.states(), initialTiles: this.board.initialStates(), moves: this.moves, playRule: this.playRule, tray: this.tray.map((tile) => ({ ...tile })),
      hints: this.hints, shuffles: this.shuffles, history: this.cloneHistory(this.history),
      safe: this.safe ? { tiles: this.safe.tiles.map((tile) => ({ ...tile })), moves: this.safe.moves, tray: this.safe.tray.map((tile) => ({ ...tile })), history: this.cloneHistory(this.safe.history) } : null,
      elapsedMs: this.ui.elapsedTime(),
    };
    const game: SavedGame = this.mode === 'tour' && this.stageId ? { ...base, mode: 'tour', stageId: this.stageId, unlockedStages: [...this.unlocked], completedStages: [...this.completed] } : { ...base, mode: 'classic', difficulty: this.board.difficulty };
    if (!saveGame(game) && !this.storageWarningShown) {
      this.storageWarningShown = true; this.ui.showMessage('ゲームを保存できませんでした。プレイは続けられます', true);
    }
  }
}
