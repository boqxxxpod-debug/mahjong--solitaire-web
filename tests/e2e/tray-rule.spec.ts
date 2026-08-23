import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 938, height: 771 }]) {
  test(`tray keeps the projected board clear at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/?seed=tray-clearance-${viewport.width}x${viewport.height}`);
    await page.locator('#mode-menu').click(); await page.locator('[data-rule="tray"]').click();
    await expect(page.locator('#tray')).toBeVisible();

    const boardTrayGap = () => page.evaluate(() => {
      const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
      const bounds = game.board.getBounds();
      const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!.getBoundingClientRect();
      const tray = document.querySelector<HTMLElement>('#tray')!.getBoundingClientRect();
      const projectedBottom = [bounds.min.x, bounds.max.x].flatMap((x) =>
        [bounds.min.y, bounds.max.y].flatMap((y) =>
          [bounds.min.z, bounds.max.z].map((z) => {
            const point = bounds.min.clone().set(x, y, z).project(game.camera);
            return canvas.top + (1 - point.y) * canvas.height / 2;
          })))
        .reduce((bottom, y) => Math.max(bottom, y), -Infinity);
      return tray.top - projectedBottom;
    });
    await expect.poll(boardTrayGap).toBeGreaterThanOrEqual(10);

    if (viewport.width === 390) {
      await page.reload(); await expect(page.locator('#tray')).toBeVisible();
      await expect.poll(boardTrayGap).toBeGreaterThanOrEqual(10);
    }

    await page.screenshot({ path: `screenshots/tray-clearance-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

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
