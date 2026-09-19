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

for (const [stage, undos, hints, shuffles, count] of [
  ['gate', '∞', '∞', '∞', '24'], ['tower', '5', '5', '4', '28'], ['bridge', '4', '4', '3', '32'],
  ['turtle', '4', '4', '3', '36'], ['pyramid', '3', '3', '2', '40'], ['fortress', '3', '3', '2', '44'],
  ['pagoda', '2', '2', '1', '50'], ['spiral', '2', '2', '1', '56'], ['dragon', '1', '1', '0', '62'],
  ['great-wall', '0', '0', '0', '68'],
] as const) {
  test(`${stage} direct seed is reproducible, fitted, and uses stage limits`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/?mode=tour&stage=${stage}&seed=repeatable`);
    const first = await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash()); await page.reload();
    expect(await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash())).toBe(first);
    await expect(page.locator('#undo')).toHaveText(`UNDO ${undos}`); await expect(page.locator('#hint')).toHaveText(`HINT ${hints}`); await expect(page.locator('[data-shuffle]').first()).toHaveText(`SHUFFLE ${shuffles}`);
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

test('UNDO and HINT budgets consume independently, persist, block at zero, and reset', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mahjong-solitaire.play-rule.v1', 'pair');
    localStorage.setItem('mahjong-solitaire.tour-progress.v1.pair', JSON.stringify({
      unlocked: ['gate', 'tower', 'bridge', 'turtle', 'pyramid', 'fortress', 'pagoda', 'spiral', 'dragon'],
      completed: ['gate', 'tower', 'bridge', 'turtle', 'pyramid', 'fortress', 'pagoda', 'spiral'],
    }));
  });
  await page.goto('/?mode=tour&stage=dragon&seed=limited-rescue');
  const undo = page.locator('#undo'); const hint = page.locator('#hint');
  await expect(undo).toHaveText('UNDO 1'); await expect(undo).toBeDisabled();
  await expect(hint).toHaveText('HINT 1');
  await page.evaluate(() => (window as any).__mahjongGameTest.matches.undo());
  await expect(undo).toHaveText('UNDO 1');
  const initialHash = await page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash());

  await hint.click();
  await expect.poll(() => hint.textContent(), { timeout: 5000 }).toBe('HINT 0');
  await expect.poll(() => page.evaluate(() => (window as any).__mahjongGameTest.matches.hintTargetIds.size), { timeout: 5000 }).toBeGreaterThan(0);
  const applied = await page.evaluate(async () => {
    const game = (window as any).__mahjongGameTest;
    const targetIds = [...game.matches.hintTargetIds] as number[];
    targetIds.forEach((id) => game.matches.select(game.board.tiles[id]));
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { hash: game.board.stateHash(), history: game.matches.history.length };
  });
  expect(applied.hash).not.toBe(initialHash); expect(applied.history).toBeGreaterThan(0);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash())).toBe(initialHash);
  await expect(undo).toHaveText('UNDO 0'); await expect(undo).toBeDisabled();
  await expect(hint).toHaveText('HINT 0');
  await page.goto('/');
  await expect(undo).toHaveText('UNDO 0'); await expect(undo).toBeDisabled();
  await expect(hint).toHaveText('HINT 0');

  const blocked = await page.evaluate(async () => {
    const game = (window as any).__mahjongGameTest;
    const free = game.board.activeTiles.filter((tile: any) => game.board.isFree(tile));
    const faceDown = free.find((tile: any) => tile.faceDown);
    if (faceDown) game.matches.select(faceDown);
    else {
      const first = free.find((tile: any, index: number) => free.slice(index + 1).some((other: any) => other.type === tile.type));
      const second = first && free.find((tile: any) => tile !== first && tile.type === first.type);
      if (!first || !second) throw new Error('Expected an available action');
      game.matches.select(first); game.matches.select(second);
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    const beforeUndo = game.board.stateHash(); const history = game.matches.history.length;
    game.matches.undo();
    return { beforeUndo, afterUndo: game.board.stateHash(), history, afterHistory: game.matches.history.length };
  });
  expect(blocked.afterUndo).toBe(blocked.beforeUndo); expect(blocked.afterHistory).toBe(blocked.history);

  await page.evaluate(() => (window as any).__mahjongGameTest.matches.restart());
  await expect(undo).toHaveText('UNDO 1'); await expect(undo).toBeDisabled();
  await expect(hint).toHaveText('HINT 1');
});

test('Tour tray moves use the same UNDO budget', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mahjong-solitaire.play-rule.v1', 'tray');
    localStorage.setItem('mahjong-solitaire.tour-progress.v1.tray', JSON.stringify({
      unlocked: ['gate', 'tower', 'bridge', 'turtle', 'pyramid', 'fortress', 'pagoda', 'spiral', 'dragon'],
      completed: ['gate', 'tower', 'bridge', 'turtle', 'pyramid', 'fortress', 'pagoda', 'spiral'],
    }));
  });
  await page.goto('/?mode=tour&stage=dragon&seed=limited-tray-undo');
  const initialHash = await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    const tile = game.board.activeTiles.find((candidate: any) => game.board.isFree(candidate));
    if (!tile) throw new Error('Expected a free tray action');
    const hash = game.board.stateHash(); game.matches.select(tile); return hash;
  });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const undo = page.locator('#undo'); await expect(undo).toHaveText('UNDO 1'); await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mahjongGameTest.board.stateHash())).toBe(initialHash);
  await expect(undo).toHaveText('UNDO 0'); await expect(undo).toBeDisabled();
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
