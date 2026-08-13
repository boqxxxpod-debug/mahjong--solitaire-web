export class UIManager {
  private readonly message = document.querySelector<HTMLElement>('#message')!;
  private readonly remaining = document.querySelector<HTMLElement>('#remaining')!;
  private readonly result = document.querySelector<HTMLElement>('#result')!;
  private readonly resultTitle = document.querySelector<HTMLElement>('#result-title')!;
  private readonly resultDetail = document.querySelector<HTMLElement>('#result-detail')!;
  private readonly time = document.querySelector<HTMLElement>('#time')!;
  private readonly moves = document.querySelector<HTMLElement>('#moves')!;
  private readonly hintButton = document.querySelector<HTMLButtonElement>('#hint')!;
  private readonly shuffleButtons = document.querySelectorAll<HTMLButtonElement>('[data-shuffle]');
  private readonly resultShuffle = document.querySelector<HTMLElement>('#result-shuffle')!;
  private readonly resultUndo = document.querySelector<HTMLButtonElement>('#result-undo')!;
  private readonly restartButtons = document.querySelectorAll<HTMLButtonElement>('[data-restart]');
  private readonly difficultyButtons = document.querySelectorAll<HTMLButtonElement>('[data-difficulty]');
  private readonly difficulty = document.querySelector<HTMLElement>('#difficulty')!;
  private startedAt = 0;
  private elapsed = 0;
  private timer?: number;
  private shuffling = false;

  updateRemaining(count: number): void { this.remaining.textContent = String(count); }
  showMessage(text: string, error = false): void { this.message.textContent = text; this.message.classList.toggle('error', error); }
  onRestart(handler: () => void): void { this.restartButtons.forEach((button) => button.addEventListener('click', handler)); }
  onHint(handler: () => void): void { this.hintButton.addEventListener('click', handler); }
  onShuffle(handler: () => void): void { this.shuffleButtons.forEach((button) => button.addEventListener('click', handler)); }
  onUndo(handler: () => void): void { this.resultUndo.addEventListener('click', handler); }
  onDifficulty(handler: (difficulty: 'easy' | 'normal' | 'hard') => void): void {
    this.difficultyButtons.forEach((button) => button.addEventListener('click', () => handler(button.dataset.difficulty as 'easy' | 'normal' | 'hard')));
  }
  updateDifficulty(value: 'easy' | 'normal' | 'hard', hints: number | null, shuffles: number | null): void {
    const label = value.toUpperCase();
    this.difficulty.textContent = label;
    this.difficultyButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.difficulty === value)));
    this.hintButton.disabled = hints === 0;
    this.hintButton.textContent = `HINT ${hints === null ? '∞' : hints}`;
    this.shuffleButtons.forEach((button) => {
      button.toggleAttribute('disabled', shuffles === 0 || this.shuffling);
      button.textContent = this.shuffling ? 'SHUFFLING...' : `SHUFFLE ${shuffles === null ? '∞' : shuffles}`;
    });
  }
  setShuffling(active: boolean, difficulty: 'easy' | 'normal' | 'hard', hints: number | null, shuffles: number | null): void {
    this.shuffling = active; this.updateDifficulty(difficulty, hints, shuffles);
  }
  updateMoves(count: number): void { this.moves.textContent = String(count); }
  showClear(moves: number): void {
    this.stopTimer();
    this.resultShuffle.hidden = true; this.resultUndo.hidden = true;
    this.showResult('CLEAR', `クリアタイム ${this.formatTime(this.elapsed)} ・ ${moves}手`);
  }
  showNoMoves(canShuffle: boolean): void {
    this.showStuck(canShuffle, false);
  }
  showStuck(canShuffle: boolean, canUndo = true): void {
    this.resultShuffle.hidden = !canShuffle; this.resultUndo.hidden = !canUndo;
    this.showResult('STUCK', 'この盤面からクリアできません。安全な手まで戻るか、救済操作を選んでください');
  }
  reset(count: number): void {
    this.stopTimer(); this.elapsed = 0; this.startedAt = performance.now();
    this.timer = window.setInterval(() => this.tick(), 250); this.tick(); this.updateMoves(0);
    this.updateRemaining(count);
    this.hideResult();
    this.showMessage('同じ牌を2枚選んでください');
  }
  hideResult(): void {
    this.result.classList.remove('show');
    this.result.setAttribute('aria-hidden', 'true');
    this.result.inert = true;
  }
  private tick(): void { this.elapsed = performance.now() - this.startedAt; this.time.textContent = this.formatTime(this.elapsed); }
  private stopTimer(): void { if (this.timer !== undefined) window.clearInterval(this.timer); this.timer = undefined; }
  private formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  private showResult(title: string, detail: string): void {
    this.resultTitle.textContent = title; this.resultDetail.textContent = detail;
    this.result.inert = false;
    this.result.classList.add('show'); this.result.setAttribute('aria-hidden', 'false'); this.message.textContent = '';
    window.setTimeout(() => this.result.querySelector<HTMLButtonElement>('button:not([hidden])')?.focus(), 0);
  }
}
