import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';
import { DIFFICULTIES, Difficulty } from './BoardLayout';

export class MatchManager {
  private selected: Tile | null = null;
  private revealedFaceDownTile: Tile | null = null;
  private flipping = false;
  private moves = 0;
  private hints: number | null = 3;
  private shuffles: number | null = 2;
  private stuck = false;
  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart());
    this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle());
    this.ui.onDifficulty((difficulty) => this.changeDifficulty(difficulty));
    this.resetLimits(); this.ui.reset(this.board.activeTiles.length);
  }

  select(tile: Tile): void {
    if (this.flipping || this.stuck) return;
    if (!this.board.isFree(tile)) { tile.flash('blocked'); this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile.faceDown) {
      void this.revealFaceDown(tile);
      return;
    }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
      const first = this.selected;
      this.selected.setSelected(false);
      this.board.remove(this.selected); this.board.remove(tile); this.selected = null;
      if (this.revealedFaceDownTile === first || this.revealedFaceDownTile === tile) this.revealedFaceDownTile = null;
      this.moves++; this.ui.updateMoves(this.moves);
      const count = this.board.activeTiles.length; this.ui.updateRemaining(count);
      if (count === 0) this.ui.showClear(this.moves);
      else if (!this.board.hasAvailableAction()) this.showNoMoves();
      else this.ui.showMessage('マッチ！ 次のペアを探しましょう');
      return;
    }
    this.selected.setSelected(false); this.selected = null;
    this.ui.showMessage('絵柄が違います', true);
  }

  restart(): void {
    this.selected?.setSelected(false);
    this.selected = null;
    this.revealedFaceDownTile = null; this.flipping = false;
    this.stuck = false;
    this.board.restart();
    this.moves = 0;
    this.resetLimits();
    this.ui.reset(this.board.activeTiles.length);
  }

  private changeDifficulty(difficulty: Difficulty): void {
    this.board.newDeal(difficulty);
    // Fit and render the completed board before publishing its new count in UI.
    window.dispatchEvent(new Event('resize'));
    this.selected = null; this.revealedFaceDownTile = null; this.flipping = false; this.stuck = false; this.moves = 0; this.resetLimits();
    this.ui.reset(this.board.activeTiles.length);
  }

  private resetLimits(): void {
    const config = DIFFICULTIES[this.board.difficulty];
    this.hints = config.hints; this.shuffles = config.shuffles;
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
  }

  private hint(): void {
    if (this.hints === 0) return;
    const action = this.board.getHint();
    if (!action) { this.showNoMoves(); return; }
    if (this.hints !== null) this.hints--;
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
    if (action.kind === 'pair') {
      action.tiles[0].flash('hint'); action.tiles[1].flash('hint');
      this.ui.showMessage('取れるペアをハイライトしました');
    } else {
      action.tile.flash('hint');
      this.ui.showMessage('めくれる裏向き牌をハイライトしました');
    }
  }

  private shuffle(): void {
    if (this.shuffles === 0) return;
    this.selected?.setSelected(false); this.selected = null;
    this.board.shuffle();
    this.stuck = false;
    if (this.shuffles !== null) this.shuffles--;
    this.ui.updateDifficulty(this.board.difficulty, this.hints, this.shuffles);
    this.ui.hideResult();
    this.ui.showMessage('残り牌の絵柄をシャッフルしました');
  }

  private async revealFaceDown(tile: Tile): Promise<void> {
    this.flipping = true;
    const previousTiles = this.board.activeTiles.filter((candidate) =>
      candidate !== tile && candidate.originallyFaceDown && !candidate.faceDown);

    // Keep the explicit pointer for normal tracking, while the scan repairs any
    // stale reference and enforces the invariant across the whole board.
    this.selected?.setSelected(false); this.selected = null;

    // Update both logical states before animation starts, so even rapid input can
    // never observe two originally hidden tiles as face-up.
    const animations: Array<Promise<void>> = [];
    for (const previous of previousTiles) animations.push(previous.flipTo(true));
    animations.push(tile.flipTo(false));
    this.revealedFaceDownTile = tile;
    this.ui.showMessage('裏向き牌を表にしました');
    await Promise.all(animations);
    this.flipping = false;
    if (!this.board.hasAvailableAction()) this.showNoMoves();
  }

  private showNoMoves(): void {
    this.stuck = true;
    this.ui.showNoMoves(this.shuffles !== 0);
  }
}
