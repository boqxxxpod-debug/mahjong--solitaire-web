import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('Hard renders a 96-tile board at a smartphone viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=hard-mobile-check');
  await page.getByRole('button', { name: 'HARD' }).click();

  await expect(page.locator('#difficulty')).toHaveText('HARD');
  await expect(page.locator('#remaining')).toHaveText('96');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);

  const canvasImage = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  let tileColoredPixels = 0;
  for (let index = 0; index < canvasImage.data.length; index += 4) {
    if (canvasImage.data[index] > 80 && canvasImage.data[index + 1] > 60) tileColoredPixels++;
  }
  expect(tileColoredPixels).toBeGreaterThan(1_000);

  await page.screenshot({ path: 'screenshots/hard-390x844.png', fullPage: true });
});
