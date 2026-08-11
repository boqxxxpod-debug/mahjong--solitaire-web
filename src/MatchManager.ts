import { BoardManager } from './BoardManager';
import { Tile } from './Tile';
import { UIManager } from './UIManager';

export class MatchManager {
  private selected: Tile | null = null;
  constructor(private readonly board: BoardManager, private readonly ui: UIManager) {}

  select(tile: Tile): void {
    if (!this.board.isFree(tile)) { this.ui.showMessage('この牌はまだ取得できません', true); return; }
    if (tile === this.selected) { tile.setSelected(false); this.selected = null; this.ui.showMessage('同じ牌を2枚選んでください'); return; }
    if (!this.selected) { tile.setSelected(true); this.selected = tile; this.ui.showMessage('同じ絵柄の牌を選んでください'); return; }
    if (this.selected.type === tile.type) {
      this.board.remove(this.selected); this.board.remove(tile); this.selected = null;
      const count = this.board.activeTiles.length; this.ui.updateRemaining(count);
      if (count === 0) this.ui.showClear(); else this.ui.showMessage('マッチ！ 次のペアを探しましょう');
      return;
    }
    this.selected.setSelected(false); tile.setSelected(true); this.selected = tile;
    this.ui.showMessage('絵柄が違います', true);
  }
}
