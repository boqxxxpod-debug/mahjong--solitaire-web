import { expect, test } from '@playwright/test';

test('tour selector is accessible, locked, and fits a 390x844 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?seed=tour-selector');
  await page.getByRole('button', { name: /CLASSIC/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a game' })).toBeVisible();
  await expect(page.getByRole('button', { name: /1. Gate. Unlocked/ })).toBeEnabled();
  for (const name of ['Bridge', 'Tower', 'Turtle', 'Pyramid', 'Fortress', 'Pagoda', 'Spiral', 'Dragon', 'Great Wall']) {
    await expect(page.getByRole('button', { name: new RegExp(`${name}.*Locked`) })).toBeDisabled();
  }
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })); expect(overflow.width).toBe(overflow.viewport);
  await page.screenshot({ path: 'screenshots/tour-selector-390x844.png', fullPage: true });
});

for (const [stage, hints, shuffles, count] of [
  ['gate', '∞', '∞', '24'], ['tower', '5', '4', '28'], ['bridge', '4', '3', '32'],
  ['turtle', '4', '3', '36'], ['pyramid', '3', '2', '40'], ['fortress', '3', '2', '44'],
  ['pagoda', '2', '1', '50'], ['spiral', '2', '1', '56'], ['dragon', '1', '0', '62'],
  ['great-wall', '0', '0', '68'],
] as const) {
  test(`${stage} direct seed is reproducible, fitted, and uses stage limits`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/?mode=tour&stage=${stage}&seed=repeatable`);
    const first = await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash()); await page.reload();
    expect(await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash())).toBe(first);
    await expect(page.locator('#hint')).toHaveText(`HINT ${hints}`); await expect(page.locator('[data-shuffle]').first()).toHaveText(`SHUFFLE ${shuffles}`);
    await expect(page.locator('#remaining')).toHaveText(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `screenshots/tour-${stage}-390x844.png`, fullPage: true });
  });
}

test('restart and new deal preserve geometry while replaying/changing the deal', async ({ page }) => {
  await page.goto('/?mode=tour&stage=gate&seed=lifecycle');
  const initial = await page.evaluate(() => { const b = (window as any).__mahjongGameTest.board; return { hash: b.stateHash(), geometry: b.states().map(({ x, y, z }: any) => [x, y, z]) }; });
  const result = await page.evaluate(async () => { const g = (window as any).__mahjongGameTest; const action = g.board.getHint(g.board.analyzeProgress()); if (action.kind === 'pair') { g.matches.select(action.tiles[0]); g.matches.select(action.tiles[1]); } await new Promise((r) => setTimeout(r, 50)); g.matches.restart(); const restart = g.board.stateHash(); g.matches.newStageDeal(); return { restart, hash: g.board.stateHash(), geometry: g.board.states().map(({ x, y, z }: any) => [x, y, z]) }; });
  expect(result.restart).toBe(initial.hash); expect(result.hash).not.toBe(initial.hash); expect(result.geometry).toEqual(initial.geometry);
});

test('ordered mission status explains violations and follows undo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=tour&stage=spiral&seed=ordered-mission');
  await expect.poll(() => page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    return Boolean(game) && game.matches.worker === undefined;
  })).toBe(true);
  const message = page.locator('#message');
  await expect(message).toContainText('MISSION 🔵 1/3');

  await page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    game.board.restore(game.board.states().map((tile: any) => ({ ...tile, removed: tile.missionOrder === undefined })));
    const violet = game.board.tiles.find((tile: any) => tile.missionOrder === 2);
    if (!violet || !game.board.isMissionLocked(violet)) throw new Error('Expected violet to remain mission-locked');
    game.matches.select(violet);
  });
  await expect(message).toContainText('順番が違います');
  await expect(message).toContainText('🔵 1/3を先に完了してください');

  await page.evaluate(() => {
    const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
    const blue = game.board.tiles.filter((tile: any) => tile.missionOrder === 1);
    if (blue.length !== 2 || blue.some((tile: any) => !game.board.isFree(tile))) throw new Error('Expected a free blue mission pair');
    game.matches.select(blue[0]); game.matches.select(blue[1]);
  });
  await expect(message).toContainText('MISSION 🟣 2/3');
  await page.evaluate(() => (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest.matches.undo());
  await expect(message).toContainText('MISSION 🔵 1/3');
});

test('every tour level keeps the same projected tile scale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const widths: number[] = [];
  for (const stage of ['gate', 'tower', 'bridge', 'turtle', 'pyramid', 'fortress', 'pagoda', 'spiral', 'dragon', 'great-wall']) {
    await page.goto(`/?mode=tour&stage=${stage}&seed=constant-scale`);
    widths.push(await page.evaluate(() => {
      const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
      const center = game.board.getCameraBounds().getCenter();
      const left = center.clone(); left.x -= 1.25;
      const right = center.clone(); right.x += 1.25;
      left.project(game.camera); right.project(game.camera);
      return (right.x - left.x) * innerWidth / 2;
    }));
  }
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.25);
});

test('invalid tour URL falls back safely to Classic', async ({ page }) => {
  await page.goto('/?mode=tour&stage=not-a-stage&seed=safe'); await expect(page.getByRole('button', { name: /CLASSIC/ })).toBeVisible(); await expect(page.locator('#remaining')).toHaveText('44');
});
