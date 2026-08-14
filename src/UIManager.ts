export class UIManager {
  private readonly undoButton = document.querySelector<HTMLButtonElement>('#undo')!;
  private readonly tray = document.querySelector<HTMLElement>('#tray')!;
  private readonly traySlots = document.querySelector<HTMLElement>('#tray-slots')!;
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
  private readonly modeMenu = document.querySelector<HTMLButtonElement>('#mode-menu')!;
  private readonly modeSheet = document.querySelector<HTMLElement>('#mode-sheet')!;
  private readonly stageList = document.querySelector<HTMLElement>('#stage-list')!;
  private readonly replayButton = document.querySelector<HTMLButtonElement>('#replay-deal')!;
  private readonly newDealButton = document.querySelector<HTMLButtonElement>('#new-deal')!;
  private readonly nextStageButton = document.querySelector<HTMLButtonElement>('#next-stage')!;
  private readonly resultRestart = document.querySelector<HTMLButtonElement>('#result-restart')!;
  private startedAt = 0;
  private elapsed = 0;
  private timer?: number;
  private shuffling = false;

  updateRemaining(count: number): void { this.remaining.textContent = String(count); }
  showMessage(text: string, error = false): void { this.message.textContent = text; this.message.classList.toggle('error', error); }
  onRestart(handler: () => void): void { this.restartButtons.forEach((button) => button.addEventListener('click', handler)); }
  onHint(handler: () => void): void { this.hintButton.addEventListener('click', handler); }
  onShuffle(handler: () => void): void { this.shuffleButtons.forEach((button) => button.addEventListener('click', handler)); }
  onUndo(handler: () => void): void { this.resultUndo.addEventListener('click', handler); this.undoButton.addEventListener('click', handler); }
  onPlayRule(handler: (rule: 'pair' | 'tray') => void): void {
    document.querySelectorAll<HTMLButtonElement>('[data-rule]').forEach((button) => button.addEventListener('click', () => handler(button.dataset.rule as 'pair' | 'tray')));
  }
  renderPlayRule(rule: 'pair' | 'tray', trayTypes: readonly string[] = []): void {
    document.querySelectorAll<HTMLButtonElement>('[data-rule]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.rule === rule)));
    this.tray.hidden = rule !== 'tray';
    this.traySlots.replaceChildren(...Array.from({ length: 5 }, (_, index) => { const slot = document.createElement('span');
      slot.className = 'tray-slot'; slot.textContent = trayTypes[index] ? trayTypes[index].replace(/[-_]/g, ' ') : ''; slot.toggleAttribute('data-filled', Boolean(trayTypes[index])); return slot; }));
  }
  setUndoEnabled(enabled: boolean): void { this.undoButton.disabled = !enabled; }
  onDifficulty(handler: (difficulty: 'easy' | 'normal' | 'hard') => void): void {
    this.difficultyButtons.forEach((button) => button.addEventListener('click', () => handler(button.dataset.difficulty as 'easy' | 'normal' | 'hard')));
  }
  onModeMenu(handler: () => void): void { this.modeMenu.addEventListener('click', handler); document.querySelector('#close-mode')!.addEventListener('click', () => this.hideModeSheet()); }
  onClassic(handler: () => void): void { document.querySelector('#choose-classic')!.addEventListener('click', handler); }
  onStage(handler: (stage: 'gate' | 'tower' | 'bridge' | 'dragon') => void): void {
    this.stageList.addEventListener('click', (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-stage]'); if (button && !button.disabled) handler(button.dataset.stage as 'gate' | 'tower' | 'bridge' | 'dragon'); });
  }
  onReplay(handler: () => void): void { this.replayButton.addEventListener('click', handler); }
  onNewDeal(handler: () => void): void { this.newDealButton.addEventListener('click', handler); }
  onNextStage(handler: () => void): void { this.nextStageButton.addEventListener('click', handler); }
  showModeSheet(): void { this.modeSheet.inert = false; this.modeSheet.setAttribute('aria-hidden', 'false'); window.setTimeout(() => this.modeSheet.querySelector<HTMLButtonElement>('button')?.focus(), 0); }
  hideModeSheet(): void { this.modeSheet.inert = true; this.modeSheet.setAttribute('aria-hidden', 'true'); this.modeMenu.focus(); }
  renderMode(mode: 'classic' | 'tour', stages: readonly { id: string; label: string; description: string; unlocked: boolean; completed: boolean; prerequisite?: string }[], currentStage?: string): void {
    this.modeMenu.textContent = mode === 'classic' ? 'CLASSIC ▾' : 'TOUR ▾';
    document.querySelector<HTMLElement>('.difficulty-picker')!.hidden = mode === 'tour';
    this.stageList.replaceChildren(...stages.map((stage, index) => { const button = document.createElement('button'); button.className = 'stage-button'; button.dataset.stage = stage.id; button.disabled = !stage.unlocked; button.setAttribute('aria-pressed', String(mode === 'tour' && currentStage === stage.id)); button.setAttribute('aria-label', `${index + 1}. ${stage.label}. ${stage.completed ? 'Completed' : stage.unlocked ? 'Unlocked' : `Locked. Clear ${stage.prerequisite}`}`); button.innerHTML = `<b>${index + 1}. ${stage.label}${stage.completed ? ' ✓' : ''}</b><small>${stage.unlocked ? stage.description : `LOCKED · Clear ${stage.prerequisite}`}</small>`; return button; }));
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
  updateTourLimits(label: string, hints: number | null, shuffles: number | null): void {
    this.difficulty.textContent = label.toUpperCase(); this.hintButton.disabled = hints === 0;
    this.hintButton.textContent = `HINT ${hints === null ? '∞' : hints}`;
    this.shuffleButtons.forEach((button) => { button.toggleAttribute('disabled', shuffles === 0 || this.shuffling); button.textContent = this.shuffling ? 'SHUFFLING...' : `SHUFFLE ${shuffles === null ? '∞' : shuffles}`; });
  }
  setShuffling(active: boolean, difficulty: 'easy' | 'normal' | 'hard', hints: number | null, shuffles: number | null): void {
    this.shuffling = active; this.updateDifficulty(difficulty, hints, shuffles);
  }
  updateMoves(count: number): void { this.moves.textContent = String(count); }
  showClear(moves: number): void {
    this.stopTimer();
    this.resultRestart.hidden = false; this.replayButton.hidden = true; this.newDealButton.hidden = true; this.nextStageButton.hidden = true;
    this.resultShuffle.hidden = true; this.resultUndo.hidden = true;
    this.showResult('CLEAR', `クリアタイム ${this.formatTime(this.elapsed)} ・ ${moves}手`);
  }
  showTourClear(moves: number, hasNext: boolean): void {
    this.showClear(moves); this.resultRestart.hidden = true; this.replayButton.hidden = false; this.newDealButton.hidden = false; this.nextStageButton.hidden = !hasNext;
  }
  showNoMoves(canShuffle: boolean): void {
    this.showStuck(canShuffle, false);
  }
  showStuck(canShuffle: boolean, canUndo = true): void {
    this.resultRestart.hidden = false; this.replayButton.hidden = true; this.newDealButton.hidden = true; this.nextStageButton.hidden = true;
    this.resultShuffle.hidden = !canShuffle; this.resultUndo.hidden = !canUndo;
    this.showResult('STUCK', 'この盤面からクリアできません。安全な手まで戻るか、救済操作を選んでください');
  }
  reset(count: number): void {
    this.resultRestart.hidden = false; this.replayButton.hidden = true; this.newDealButton.hidden = true; this.nextStageButton.hidden = true;
    this.startTimer(0); this.updateMoves(0);
    this.updateRemaining(count);
    this.hideResult();
    this.showMessage('同じ牌を2枚選んでください');
  }
  restore(count: number, moves: number, elapsedMs: number): void {
    this.startTimer(elapsedMs); this.updateMoves(moves); this.updateRemaining(count);
    this.hideResult(); this.showMessage('保存したゲームを復元しました');
  }
  elapsedTime(): number { return this.elapsed + (this.timer === undefined ? 0 : performance.now() - this.startedAt); }
  private startTimer(elapsedMs: number): void {
    this.stopTimer(); this.elapsed = elapsedMs; this.startedAt = performance.now();
    this.timer = window.setInterval(() => this.tick(), 250); this.tick(); this.updateMoves(0);
  }
  hideResult(): void {
    this.result.classList.remove('show');
    this.result.setAttribute('aria-hidden', 'true');
    this.result.inert = true;
  }
  private tick(): void { this.time.textContent = this.formatTime(this.elapsedTime()); }
  private stopTimer(): void {
    if (this.timer !== undefined) { this.elapsed += performance.now() - this.startedAt; window.clearInterval(this.timer); }
    this.timer = undefined;
  }
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
