import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

for (const [difficulty, count] of [['EASY', '36'], ['NORMAL', '44'], ['HARD', '60']] as const) {
  test(`${difficulty} fills the 390x844 play area with large tiles`, async ({ page }) => {
    await page.goto(`/?seed=${difficulty.toLowerCase()}-mobile-layout`);
    await page.getByRole('button', { name: difficulty }).click();
    await expect(page.locator('#remaining')).toHaveText(count);
    await page.waitForTimeout(500);
    const tileBounds = await page.evaluate(() => {
      const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
      const tile = game.board.tiles.reduce((top: any, candidate: any) =>
        candidate.logical.z > top.logical.z ? candidate : top);
      tile.mesh.geometry.computeBoundingBox();
      const { min, max } = tile.mesh.geometry.boundingBox;
      const points = [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => {
        const projected = tile.mesh.localToWorld(min.clone().set(x, y, z)).project(game.camera);
        return { x: (projected.x + 1) * 195, y: (1 - projected.y) * 422 };
      })));
      const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
      return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    });
    expect(tileBounds.width).toBeGreaterThan(60);
    expect(tileBounds.height).toBeGreaterThan(60);
    await page.screenshot({ path: `screenshots/${difficulty.toLowerCase()}-390x844.png`, fullPage: true });
  });
}

test('Hard renders a 60-tile board at a smartphone viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=hard-mobile-check');
  await page.getByRole('button', { name: 'HARD' }).click();

  await expect(page.locator('#difficulty')).toHaveText('HARD');
  await expect(page.locator('#remaining')).toHaveText('60');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);

  const diagnostics = await page.evaluate(() => (window as Window & {
    __mahjongBoardDiagnostics?: Record<string, number | string>;
  }).__mahjongBoardDiagnostics);
  expect(diagnostics).toMatchObject({
    difficulty: 'hard', layoutCount: 60, tileDefinitionCount: 60,
    boardTileCount: 60, tileMeshCount: 60,
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
    await expect(page.locator('#remaining')).toHaveText('60');
    const diagnostics = await page.evaluate(() => (window as Window & {
      __mahjongBoardDiagnostics?: { tileMeshCount: number; boardTileCount: number };
    }).__mahjongBoardDiagnostics);
    expect(diagnostics).toMatchObject({ tileMeshCount: 60, boardTileCount: 60 });
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

test('only one originally face-down tile stays revealed during rapid taps', async ({ page }) => {
  await page.goto('/?seed=normal-visible-backs');
  await page.getByRole('button', { name: 'NORMAL' }).click();
  const result = await page.evaluate(async () => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    const initialFaceDownIds = game.board.tiles.filter((tile: any) => tile.faceDown).map((tile: any) => tile.id);
    // Keep three independently FREE hidden tiles available so A -> B -> C can
    // be asserted without depending on a particular generated face assignment.
    const freeTiles = game.board.tiles.filter((tile: any) => game.board.isFree(tile));
    freeTiles.slice(0, 3).forEach((tile: any) => {
      tile.setFaceDown(true);
      // These stand in for deal-time hidden tiles in this deterministic setup.
      Object.defineProperty(tile, 'originallyFaceDown', { value: true });
    });
    const originalFaceDownIds = game.board.tiles.filter((tile: any) => tile.faceDown).map((tile: any) => tile.id);
    const freeHidden = () => game.board.tiles.filter((tile: any) => tile.faceDown && game.board.isFree(tile));
    const [first] = freeHidden();
    game.matches.select(first);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const second = freeHidden().find((tile: any) => tile !== first);
    game.matches.select(second);
    // A third tap during the animation must be ignored by the input lock.
    const thirdDuringFlip = freeHidden().find((tile: any) => tile !== second);
    if (thirdDuringFlip) game.matches.select(thirdDuringFlip);
    const duringFlip = originalFaceDownIds.filter((id: number) => !game.board.tiles[id].faceDown);
    const displayMatchesStateDuringFlip = game.board.tiles.every((tile: any) =>
      tile.faceDown === tile.isDisplayingFaceDown || tile.mesh.rotation.y !== 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const firstReturnedFaceDown = first.faceDown;

    const third = freeHidden().find((tile: any) => tile !== first && tile !== second);
    if (third) game.matches.select(third);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const afterThird = originalFaceDownIds.filter((id: number) => !game.board.tiles[id].faceDown);
    const ordinaryFaceUpTilesStayedFaceUp = game.board.tiles
      .filter((tile: any) => !tile.originallyFaceDown && !tile.removed)
      .every((tile: any) => !tile.faceDown);
    game.matches.restart();
    return {
      firstReturnedFaceDown,
      duringFlip,
      displayMatchesStateDuringFlip,
      afterThird,
      ordinaryFaceUpTilesStayedFaceUp,
      restartedHiddenIds: game.board.tiles.filter((tile: any) => tile.faceDown).map((tile: any) => tile.id),
      initialFaceDownIds,
    };
  });
  expect(result.firstReturnedFaceDown).toBe(true);
  expect(result.duringFlip).toHaveLength(1);
  expect(result.displayMatchesStateDuringFlip).toBe(true);
  expect(result.afterThird).toHaveLength(1);
  expect(result.ordinaryFaceUpTilesStayedFaceUp).toBe(true);
  expect(result.restartedHiddenIds).toEqual(result.initialFaceDownIds);
});
