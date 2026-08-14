import { expect, test } from '@playwright/test';

test('tour selector is accessible, locked, and fits a 390x844 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?seed=tour-selector');
  await page.getByRole('button', { name: /CLASSIC/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a game' })).toBeVisible();
  await expect(page.getByRole('button', { name: /1. Gate. Unlocked/ })).toBeEnabled();
  for (const name of ['Tower', 'Bridge', 'Dragon']) await expect(page.getByRole('button', { name: new RegExp(`${name}.*Locked`) })).toBeDisabled();
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })); expect(overflow.width).toBe(overflow.viewport);
  await page.screenshot({ path: 'screenshots/tour-selector-390x844.png', fullPage: true });
});

for (const [stage, hints, shuffles] of [['gate', '∞', '∞'], ['tower', '3', '2'], ['bridge', '2', '1'], ['dragon', '1', '0']] as const) {
  test(`${stage} direct seed is reproducible, fitted, and uses stage limits`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/?mode=tour&stage=${stage}&seed=repeatable`);
    const first = await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash()); await page.reload();
    expect(await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash())).toBe(first);
    await expect(page.locator('#hint')).toHaveText(`HINT ${hints}`); await expect(page.locator('[data-shuffle]').first()).toHaveText(`SHUFFLE ${shuffles}`);
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

test('invalid tour URL falls back safely to Classic', async ({ page }) => {
  await page.goto('/?mode=tour&stage=not-a-stage&seed=safe'); await expect(page.getByRole('button', { name: /CLASSIC/ })).toBeVisible(); await expect(page.locator('#remaining')).toHaveText('44');
});
