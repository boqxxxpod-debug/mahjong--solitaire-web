const overlay = document.querySelector<HTMLElement>('#debug-overlay');

function stringify(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return typeof reason === 'string' ? reason : JSON.stringify(reason);
}

export function showFatalError(context: string, reason: unknown): void {
  const detail = stringify(reason);
  console.error(`[${context}]`, reason);
  if (!overlay) return;
  overlay.hidden = false;
  overlay.textContent = `3D描画エラー\n${context}: ${detail}`;
}

export function installGlobalErrorOverlay(): void {
  window.addEventListener('error', (event) => {
    showFatalError('JavaScript', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    showFatalError('Promise', event.reason);
  });
}
