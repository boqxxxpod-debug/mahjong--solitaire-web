import { expect, test } from '@playwright/test';

test('board matches animate without blocking a consecutive removal', async ({ page }) => {
  await page.goto('/?seed=match-animation');
  const result = await page.evaluate(async () => {
    const game = (window as any).__mahjongGameTest;
    const removeHintPair = () => {
      const action = game.board.getHint(game.board.analyzeProgress());
      if (action?.kind !== 'pair') throw new Error('Expected a removable pair');
      game.matches.select(action.tiles[0]); game.matches.select(action.tiles[1]);
      return action.tiles;
    };
    const first = removeHintPair();
    const immediate = first.map((tile: any) => ({ removed: tile.removed, visible: tile.mesh.visible }));
    const second = removeHintPair();
    await new Promise((resolve) => setTimeout(resolve, 330));
    return { immediate, hidden: [...first, ...second].every((tile: any) => !tile.mesh.visible), remaining: game.board.activeTiles.length };
  });
  expect(result.immediate).toEqual([{ removed: true, visible: true }, { removed: true, visible: true }]);
  expect(result.hidden).toBe(true);
  expect(result.remaining).toBe(40);
});

test('tray matches show two short-lived removal tiles at smartphone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=tray-match-animation');
  await page.locator('#mode-menu').click(); await page.locator('[data-rule="tray"]').click();
  const count = await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    const first = game.board.activeTiles.find((tile: any) => !tile.faceDown && game.board.isFree(tile));
    const second = game.board.activeTiles.find((tile: any) => tile !== first && tile.type === first.type && !tile.faceDown && game.board.isFree(tile));
    if (!first || !second) throw new Error('Expected a free matching pair');
    game.matches.select(first); game.matches.select(second);
    return document.querySelectorAll('.tray-match-tile').length;
  });
  expect(count).toBe(2);
  await expect(page.locator('.tray-match-tile')).toHaveCount(0, { timeout: 700 });
  await expect(page.locator('#tray')).toBeInViewport();
});
