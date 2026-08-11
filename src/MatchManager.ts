import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';

export class MatchManager {
  private selected: Tile | null = null;
  private moves = 0;
  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {
    this.ui.onRestart(() => this.restart());
    this.ui.onHint(() => this.hint());
    this.ui.onShuffle(() => this.shuffle());
    this.ui.reset(this.board.activeTiles.length);
  }

  select(tile: Tile): void {
    if (!this.board.isFree(tile)) { tile.flash('blocked'); this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
      this.selected.setSelected(false);
      this.board.remove(this.selected); this.board.remove(tile); this.selected = null;
      this.moves++; this.ui.updateMoves(this.moves);
      const count = this.board.activeTiles.length; this.ui.updateRemaining(count);
      if (count === 0) this.ui.showClear(this.moves);
      else if (!this.board.hasAvailablePair()) this.ui.showNoMoves();
      else this.ui.showMessage('マッチ！ 次のペアを探しましょう');
      return;
    }
    this.selected.setSelected(false); this.selected = null;
    this.ui.showMessage('絵柄が違います', true);
  }

  restart(): void {
    this.selected?.setSelected(false);
    this.selected = null;
    this.board.reset();
    this.moves = 0;
    this.ui.reset(this.board.activeTiles.length);
  }

  private hint(): void {
    const pair = this.board.getHint();
    if (!pair) { this.ui.showNoMoves(); return; }
    pair[0].flash('hint'); pair[1].flash('hint');
    this.ui.showMessage('取れるペアをハイライトしました');
  }

  private shuffle(): void {
    this.selected?.setSelected(false); this.selected = null;
    this.board.shuffle();
    this.ui.hideResult();
    this.ui.showMessage('残り牌の絵柄をシャッフルしました');
  }
}
