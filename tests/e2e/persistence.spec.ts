import { expect, test } from '@playwright/test';

for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  test(`${difficulty} restores its complete committed state and original deal`, async ({ page }) => {
    await page.goto(`/?seed=persist-${difficulty}`);
    const before = await page.evaluate(async (selectedDifficulty) => {
      const game = (window as any).__mahjongGameTest;
      if (game.board.difficulty !== selectedDifficulty) game.matches.changeDifficulty(selectedDifficulty);
      const initialHash = game.board.stateHash();
      const result = game.board.analyzeProgress();
      const action = game.board.getHint(result);
      if (!action) throw new Error('Expected a solver-certified action');
      if (action.kind === 'pair') { game.matches.select(action.tiles[0]); game.matches.select(action.tiles[1]); }
      else game.matches.select(action.tile);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        hash: game.board.stateHash(), initialHash, difficulty: game.board.difficulty,
        moves: game.matches.moves, hints: game.matches.hints, shuffles: game.matches.shuffles,
        history: JSON.stringify(game.matches.history), safe: JSON.stringify(game.matches.safe),
      };
    }, difficulty);
    await page.reload();
    const after = await page.evaluate(() => {
      const game = (window as any).__mahjongGameTest;
      return {
        hash: game.board.stateHash(), difficulty: game.board.difficulty,
        moves: game.matches.moves, hints: game.matches.hints, shuffles: game.matches.shuffles,
        history: JSON.stringify(game.matches.history), safe: JSON.stringify(game.matches.safe),
      };
    });
    const { initialHash: _initialHash, ...expectedAfter } = before;
    expect(after).toEqual(expectedAfter);
    const restarted = await page.evaluate(() => {
      const game = (window as any).__mahjongGameTest; game.matches.restart(); return game.board.stateHash();
    });
    expect(restarted).toBe(before.initialHash);
  });
}

test('Tour restores a saved initial deal from before pair-choice face remapping', async ({ page }) => {
  await page.goto('/?mode=tour&stage=pyramid&seed=legacy-pair-choice');
  const legacyTypes = await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    const initial = game.board.initialStates();
    const counts = new Map<string, number>();
    initial.forEach((tile: any) => counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1));
    const repeatedFace = [...counts].find(([, count]) => count === 4)?.[0];
    if (!repeatedFace) throw new Error('Expected the four-tile pair-choice face');
    const challengeIds = initial.filter((tile: any) => tile.type === repeatedFace).map((tile: any) => tile.id);
    const catalog = [
      'characters-1', 'dots-1', 'bamboo-1', 'wind-east', 'characters-2', 'dots-2', 'bamboo-2', 'wind-south',
      'characters-3', 'dots-3', 'bamboo-3', 'wind-west', 'characters-4', 'dots-4', 'bamboo-4', 'wind-north',
      'characters-5', 'dots-5', 'bamboo-5', 'dragon-red', 'characters-6', 'dots-6', 'bamboo-6', 'dragon-green',
      'characters-7', 'dots-7', 'bamboo-7', 'dragon-white', 'characters-8', 'dots-8', 'bamboo-8',
      'characters-9', 'dots-9', 'bamboo-9',
    ];
    const legacyFace = catalog.find((face) => !counts.has(face));
    if (!legacyFace) throw new Error('Expected an unused legacy face');
    const restoreLegacyFace = (tile: any) => ({ ...tile, type: challengeIds.slice(2).includes(tile.id) ? legacyFace : tile.type });
    const initialTiles = initial.map(restoreLegacyFace);
    const tiles = game.board.states().map(restoreLegacyFace);
    localStorage.setItem('mahjong-solitaire.game.v1', JSON.stringify({
      version: 3, savedAt: Date.now(), mode: 'tour', stageId: 'pyramid',
      unlockedStages: ['gate', 'tower', 'bridge', 'turtle', 'pyramid'], completedStages: ['gate', 'tower', 'bridge', 'turtle'],
      tiles, initialTiles, moves: 0, playRule: 'pair', tray: [], hints: 3, shuffles: 2, history: [], safe: null, elapsedMs: 1234,
    }));
    return initialTiles.map((tile: any) => tile.type);
  });

  await page.goto('/');
  const restored = await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    return { stageId: game.matches.stageId, types: game.board.states().map((tile: any) => tile.type) };
  });
  expect(restored).toEqual({ stageId: 'pyramid', types: legacyTypes });
  await expect(page.locator('#remaining')).toHaveText('40');
});

test('bad saves fall back and storage exceptions do not prevent play at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('mahjong-solitaire.game.v1', '{broken'));
  await page.goto('/?seed=bad-save');
  await expect(page.locator('#remaining')).toHaveText('44');
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    const game = (window as any).__mahjongGameTest;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    game.matches.restart();
    Storage.prototype.setItem = original;
  });
  await expect(page.locator('#moves')).toHaveText('0');
  await page.screenshot({ path: 'screenshots/persistence-390x844.png', fullPage: true });
});
