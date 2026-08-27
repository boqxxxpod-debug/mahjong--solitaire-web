import { expect, test } from '@playwright/test';

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 938, height: 771 },
];

for (const viewport of viewports) {
  test(`blocked-tile message stays clear of controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/?seed=status-message-${viewport.width}x${viewport.height}`);

    await page.evaluate(() => {
      const game = (window as Window & { __mahjongGameTest?: any }).__mahjongGameTest;
      const blockedTile = game.board.tiles.find((tile: any) => !game.board.isFree(tile));
      if (!blockedTile) throw new Error('Expected the deal to contain a blocked tile');
      game.matches.select(blockedTile);
    });

    const message = page.locator('#message');
    await expect(message).toHaveText('この牌はまだ取得できません');

    const layout = await page.evaluate(() => {
      const status = document.querySelector<HTMLElement>('#message')!;
      const statusBox = status.getBoundingClientRect();
      const buttonBoxes = [...document.querySelectorAll<HTMLElement>('.buttons button')]
        .map((button) => button.getBoundingClientRect());
      const overlaps = buttonBoxes.some((buttonBox) => !(
        statusBox.right <= buttonBox.left || statusBox.left >= buttonBox.right
        || statusBox.bottom <= buttonBox.top || statusBox.top >= buttonBox.bottom
      ));
      const style = getComputedStyle(status);
      return {
        statusBox: { left: statusBox.left, right: statusBox.right, top: statusBox.top, bottom: statusBox.bottom },
        controlsBottom: Math.max(...buttonBoxes.map((box) => box.bottom)),
        overlaps,
        fullyRendered: status.scrollWidth <= status.clientWidth && status.scrollHeight <= status.clientHeight,
        pointerEvents: style.pointerEvents,
        backgroundColor: style.backgroundColor,
      };
    });

    expect(layout.overlaps).toBe(false);
    expect(layout.fullyRendered).toBe(true);
    expect(layout.statusBox.left).toBeGreaterThanOrEqual(0);
    expect(layout.statusBox.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.pointerEvents).toBe('none');

    if (viewport.width < 700) {
      expect(layout.statusBox.top).toBeGreaterThanOrEqual(layout.controlsBottom);
      expect(layout.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    }

    await page.screenshot({ path: `screenshots/status-message-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}
