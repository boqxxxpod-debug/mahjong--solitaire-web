export class UIManager {
  private readonly message = document.querySelector<HTMLElement>('#message')!;
  private readonly remaining = document.querySelector<HTMLElement>('#remaining')!;
  private readonly result = document.querySelector<HTMLElement>('#result')!;
  private readonly resultTitle = document.querySelector<HTMLElement>('#result-title')!;
  private readonly resultDetail = document.querySelector<HTMLElement>('#result-detail')!;
  private readonly restartButtons = document.querySelectorAll<HTMLButtonElement>('[data-restart]');

  updateRemaining(count: number): void { this.remaining.textContent = String(count); }
  showMessage(text: string, error = false): void { this.message.textContent = text; this.message.classList.toggle('error', error); }
  onRestart(handler: () => void): void { this.restartButtons.forEach((button) => button.addEventListener('click', handler)); }
  showClear(): void { this.showResult('CLEAR', '盤面をすべて片付けました'); }
  showNoMoves(): void { this.showResult('NO MORE MOVES', '選択できるペアがありません'); }
  reset(count: number): void {
    this.updateRemaining(count);
    this.result.classList.remove('show');
    this.result.setAttribute('aria-hidden', 'true');
    this.showMessage('同じ牌を2枚選んでください');
  }
  private showResult(title: string, detail: string): void {
    this.resultTitle.textContent = title; this.resultDetail.textContent = detail;
    this.result.classList.add('show'); this.result.setAttribute('aria-hidden', 'false'); this.message.textContent = '';
  }
}
