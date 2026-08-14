import { expect, test } from '@playwright/test';

test('tray rule switches independently, survives reload, prevents duplicate taps, and undo restores a match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.locator('#mode-menu').click(); await page.locator('[data-rule="tray"]').click();
  const tray = page.locator('#tray'); await expect(tray).toBeVisible();
  await expect(page.locator('#tray-slots .tray-slot')).toHaveCount(5);

  const pair = await page.evaluate(() => {
    const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
    const free = game.board.tiles.filter((tile: any) => !tile.faceDown && game.board.isFree(tile));
    for (const first of free) { const second = free.find((tile: any) => tile.id !== first.id && tile.type === first.type); if (second) return [first.id, second.id]; }
    return [];
  });
  expect(pair).toHaveLength(2);
  await page.evaluate(([first, second]) => {
    const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
    game.matches.select(game.board.tiles[first]); game.matches.select(game.board.tiles[first]); game.matches.select(game.board.tiles[second]);
  }, pair);
  await expect(page.locator('#moves')).toHaveText('2');
  await expect(page.locator('#tray-slots .tray-slot[data-filled]')).toHaveCount(0);
  await page.locator('#undo').click(); await expect(page.locator('#moves')).toHaveText('1');
  await expect(page.locator('#tray-slots .tray-slot[data-filled]')).toHaveCount(1);
  await page.reload(); await expect(tray).toBeVisible(); await expect(page.locator('#moves')).toHaveText('1');
  await expect(page.locator('#tray-slots .tray-slot[data-filled]')).toHaveCount(1);
  await expect(tray).toBeInViewport();
});

test('tray fits landscape smartphone without overlapping the HUD', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto('/');
  await page.locator('#mode-menu').click(); await page.locator('[data-rule="tray"]').click();
  const tray = page.locator('#tray'), hud = page.locator('.hud');
  const [trayBox, hudBox] = await Promise.all([tray.boundingBox(), hud.boundingBox()]);
  expect(trayBox).not.toBeNull(); expect(hudBox).not.toBeNull();
  expect(trayBox!.y).toBeGreaterThanOrEqual(hudBox!.y + hudBox!.height);
  await expect(tray).toBeInViewport();
});
