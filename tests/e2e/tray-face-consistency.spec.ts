import { expect, test } from '@playwright/test';

test('tray copies the exact artwork of the selected board tile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=tray-face-consistency');
  await page.locator('#mode-menu').click();
  await page.locator('[data-rule="tray"]').click();
  await expect(page.locator('#tray')).toBeVisible();

  const source = await page.evaluate(() => {
    const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
    const tile = game.board.tiles.find((candidate: any) => !candidate.faceDown && game.board.isFree(candidate));
    if (!tile) throw new Error('No free face-up tile found');
    const materials = tile.mesh.material as any[];
    const image = materials[2]?.map?.image as HTMLCanvasElement | undefined;
    if (!image || typeof image.toDataURL !== 'function') throw new Error('Board face canvas is unavailable');
    return { id: tile.id, type: tile.type, pixels: image.toDataURL() };
  });

  await page.evaluate((tileId) => {
    const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
    const tile = game.board.tiles.find((candidate: any) => candidate.id === tileId);
    if (!tile) throw new Error('Selected tile disappeared');
    game.matches.select(tile);
  }, source.id);

  const slot = page.locator('#tray-slots .tray-slot[data-filled]').first();
  await expect(slot).toHaveAttribute('data-type', source.type);
  const trayPixels = await slot.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(trayPixels).toBe(source.pixels);
});
