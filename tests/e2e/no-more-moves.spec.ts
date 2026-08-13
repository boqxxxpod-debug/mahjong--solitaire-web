import { expect, test } from '@playwright/test';

test('STUCK is prominent at 390x844 and RESTART clears it', async ({ page }) => {
  await page.goto('/?seed=no-more-moves-mobile');
  const removed = await page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    const action = game.board.getHint();
    if (!action || action.kind !== 'pair') throw new Error('Seed must expose a pair');
    game.matches.select(action.tiles[0]);
    game.board.states = () => [{ id: 0, type: 'a', x: 0, y: 0, z: 0, removed: false }, { id: 1, type: 'b', x: 2, y: 0, z: 0, removed: false }];
    game.matches.select(action.tiles[1]);
    return game.board.tiles.length - game.board.activeTiles.length;
  });

  expect(removed).toBe(2);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('STUCK')).toBeVisible();
  await expect(dialog.getByText('この盤面からクリアできません', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /RESTART|もう一度遊ぶ/ })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: /SHUFFLE/ })).toBeEnabled();
  await page.screenshot({ path: 'screenshots/no-more-moves-390x844.png', fullPage: true });

  await dialog.getByRole('button', { name: /RESTART|もう一度遊ぶ/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#remaining')).toHaveText('44');
  await expect(page.locator('#moves')).toHaveText('0');
});

test('difficulty changes and shuffle dismiss the dead-end dialog', async ({ page }) => {
  await page.goto('/?seed=no-more-moves-reset');
  await page.waitForTimeout(3500);
  const showDialog = async () => page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    game.matches['ui'].showStuck(true, true);
  });

  await showDialog();
  await page.getByRole('dialog').getByRole('button', { name: /SHUFFLE/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await showDialog();
  await page.getByRole('button', { name: 'EASY' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#remaining')).toHaveText('36');
});


test('stale solver results cannot affect a restarted board', async ({ page }) => {
  await page.goto('/?seed=revision-race');
  await page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    const staleRevision = game.matches['revision'];
    game.matches.restart();
    game.matches['applySearchResult'](staleRevision, game.matches['snapshot'](), { status: 'UNSOLVABLE' });
  });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#remaining')).toHaveText('44');
});
