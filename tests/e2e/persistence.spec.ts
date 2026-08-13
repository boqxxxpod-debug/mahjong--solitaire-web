import { expect, test } from '@playwright/test';

for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  test(`${difficulty} restores its complete committed state and original deal`, async ({ page }) => {
    await page.goto(`/?seed=persist-${difficulty}`);
    const before = await page.evaluate(async (selectedDifficulty) => {
      const game = (window as any).__mahjongGameTest;
      if (game.board.difficulty !== selectedDifficulty) game.matches.changeDifficulty(selectedDifficulty);
      const initialHash = game.board.stateHash();
      const result = game.board.analyzeProgress();
      const action = game.board.getHint(result);
      if (!action) throw new Error('Expected a solver-certified action');
      if (action.kind === 'pair') { game.matches.select(action.tiles[0]); game.matches.select(action.tiles[1]); }
      else game.matches.select(action.tile);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        hash: game.board.stateHash(), initialHash, difficulty: game.board.difficulty,
        moves: game.matches.moves, hints: game.matches.hints, shuffles: game.matches.shuffles,
        history: JSON.stringify(game.matches.history), safe: JSON.stringify(game.matches.safe),
      };
    }, difficulty);
    await page.reload();
    const after = await page.evaluate(() => {
      const game = (window as any).__mahjongGameTest;
      return {
        hash: game.board.stateHash(), difficulty: game.board.difficulty,
        moves: game.matches.moves, hints: game.matches.hints, shuffles: game.matches.shuffles,
        history: JSON.stringify(game.matches.history), safe: JSON.stringify(game.matches.safe),
      };
    });
    const { initialHash: _initialHash, ...expectedAfter } = before;
    expect(after).toEqual(expectedAfter);
    const restarted = await page.evaluate(() => {
      const game = (window as any).__mahjongGameTest; game.matches.restart(); return game.board.stateHash();
    });
    expect(restarted).toBe(before.initialHash);
  });
}

test('bad saves fall back and storage exceptions do not prevent play at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('mahjong-solitaire.game.v1', '{broken'));
  await page.goto('/?seed=bad-save');
  await expect(page.locator('#remaining')).toHaveText('44');
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    game.matches.restart();
    Storage.prototype.setItem = original;
  });
  await expect(page.locator('#moves')).toHaveText('0');
  await page.screenshot({ path: 'screenshots/persistence-390x844.png', fullPage: true });
});
