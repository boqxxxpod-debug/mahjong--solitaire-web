export class UIManager {
  private readonly message = document.querySelector<HTMLElement>('#message')!;
  private readonly remaining = document.querySelector<HTMLElement>('#remaining')!;
  private readonly clear = document.querySelector<HTMLElement>('#clear')!;

  updateRemaining(count: number): void { this.remaining.textContent = String(count); }
  showMessage(text: string, error = false): void { this.message.textContent = text; this.message.classList.toggle('error', error); }
  showClear(): void {
    this.clear.hidden = false;
    this.clear.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this.clear.classList.add('show'));
    this.message.textContent = '';
  }
}
