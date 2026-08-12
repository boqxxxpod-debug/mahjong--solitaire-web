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

  const diagnostics = await page.evaluate(() => (window as Window & {
    __mahjongBoardDiagnostics?: Record<string, number | string>;
  }).__mahjongBoardDiagnostics);
  expect(diagnostics).toMatchObject({
    difficulty: 'hard', layoutCount: 96, tileDefinitionCount: 96,
    boardTileCount: 96, tileMeshCount: 96,
  });

  const canvasImage = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  let tileColoredPixels = 0;
  for (let index = 0; index < canvasImage.data.length; index += 4) {
    if (canvasImage.data[index] > 80 && canvasImage.data[index + 1] > 60) tileColoredPixels++;
  }
  expect(tileColoredPixels).toBeGreaterThan(1_000);

  await page.screenshot({ path: 'screenshots/hard-390x844.png', fullPage: true });
});

test('Hard remains visible through every difficulty transition', async ({ page }) => {
  await page.goto('/?seed=hard-transition-check');
  for (const sequence of [['EASY', 'HARD'], ['NORMAL', 'HARD'], ['HARD', 'EASY', 'HARD']]) {
    for (const difficulty of sequence) await page.getByRole('button', { name: difficulty }).click();
    await expect(page.locator('#remaining')).toHaveText('96');
    const diagnostics = await page.evaluate(() => (window as Window & {
      __mahjongBoardDiagnostics?: { tileMeshCount: number; boardTileCount: number };
    }).__mahjongBoardDiagnostics);
    expect(diagnostics).toMatchObject({ tileMeshCount: 96, boardTileCount: 96 });
  }
});

for (const [difficulty, minimum] of [['NORMAL', 2], ['HARD', 4]] as const) {
  test(`${difficulty} starts with visible face-down tiles at 390x844`, async ({ page }) => {
    await page.goto(`/?seed=${difficulty.toLowerCase()}-visible-backs`);
    await page.getByRole('button', { name: difficulty }).click();
    const diagnostics = await page.evaluate(() => (window as Window & {
      __mahjongBoardDiagnostics?: { visibleFaceDownCount: number; freeFaceDownCount: number };
    }).__mahjongBoardDiagnostics);
    expect(diagnostics?.visibleFaceDownCount).toBeGreaterThanOrEqual(minimum);
    expect(diagnostics?.freeFaceDownCount).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `screenshots/${difficulty.toLowerCase()}-face-down-390x844.png`, fullPage: true });
  });
}
