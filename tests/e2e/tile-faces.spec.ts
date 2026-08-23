import { expect, test } from '@playwright/test';

test('the largest level uses the complete 34-face mahjong set without texture distortion', async ({ page }) => {
  await page.goto('/?mode=tour&stage=great-wall&seed=authentic-faces');
  const result = await page.evaluate(() => {
    const game = (window as typeof window & { __mahjongGameTest: any }).__mahjongGameTest;
    const types = game.board.tiles.map((tile: any) => tile.type);
    const aspectRatios = game.board.tiles.map((tile: any) => {
      const image = tile.mesh.material[2].map.image as HTMLCanvasElement;
      return image.width / image.height;
    });
    const depthByFootprint = new Map<string, Set<number>>();
    game.board.tiles.forEach((tile: any) => {
      const key = `${tile.logical.x}:${tile.logical.y}`;
      const values = depthByFootprint.get(key) ?? new Set<number>();
      values.add(tile.mesh.position.z); depthByFootprint.set(key, values);
    });
    return {
      uniqueTypes: [...new Set(types)].sort(),
      aspectRatios,
      maxDepthValuesPerFootprint: Math.max(...[...depthByFootprint.values()].map((values) => values.size)),
    };
  });

  expect(result.uniqueTypes).toHaveLength(34);
  expect(result.uniqueTypes).toEqual(expect.arrayContaining([
    'characters-1', 'characters-9', 'dots-1', 'dots-9', 'bamboo-1', 'bamboo-9',
    'wind-east', 'wind-south', 'wind-west', 'wind-north', 'dragon-red', 'dragon-green', 'dragon-white',
  ]));
  expect(result.aspectRatios.every((ratio: number) => Math.abs(ratio - 250 / 320) < 0.0001)).toBe(true);
  expect(result.maxDepthValuesPerFootprint).toBe(1);
});
