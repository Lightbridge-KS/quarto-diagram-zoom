// Touch and Safari gesture input. Real finger input is driven through Chromium's CDP (it
// produces genuine touch Pointer Events); Safari's gesture events are synthesized, since no
// automation can drive a physical trackpad — the iOS Simulator live gate covers real pinches.
import { expect, test, type Page } from "@playwright/test";
import { CORE, nextFrame, openViewer, viewport, zoomOf } from "./helpers";

/** Where (x, y) falls on the open SVG, as fractions of its box. */
const fractionAt = (page: Page, point: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const box = document.querySelector(".dz-viewport svg")!.getBoundingClientRect();
    return { fx: (x - box.left) / box.width, fy: (y - box.top) / box.height };
  }, point);

async function viewportCentre(page: Page) {
  const box = (await viewport(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("touch (Chromium CDP)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !isMobile, "needs Chromium with touch");

  test("two-finger pinch zooms at the midpoint and never zooms the page", async ({ page }) => {
    await page.goto(CORE);
    await openViewer(page, "#wide");
    const cdp = await page.context().newCDPSession(page);
    const mid = await viewportCentre(page);
    const zoom = await zoomOf(page);
    const before = await fractionAt(page, mid);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", spread: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [
          { x: mid.x - spread, y: mid.y, id: 1 },
          { x: mid.x + spread, y: mid.y, id: 2 },
        ],
      });
    await touch("touchStart", 40);
    for (let spread = 45; spread <= 80; spread += 5) await touch("touchMove", spread);
    await touch("touchEnd", 0);
    await nextFrame(page);
    expect(await zoomOf(page) / zoom).toBeCloseTo(2, 1);
    const after = await fractionAt(page, mid);
    expect(after.fx).toBeCloseTo(before.fx, 2);
    expect(after.fy).toBeCloseTo(before.fy, 2);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });

  test("one finger pans", async ({ page }) => {
    await page.goto(CORE);
    await openViewer(page, "#wide");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    const cdp = await page.context().newCDPSession(page);
    const mid = await viewportCentre(page);
    const left = await viewport(page).evaluate((node) => node.scrollLeft);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mid.x + 100, y: mid.y, id: 1 }] });
    for (let dx = 80; dx >= -100; dx -= 20) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mid.x + dx, y: mid.y, id: 1 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const panned = await viewport(page).evaluate((node) => node.scrollLeft);
    expect(panned - left).toBeGreaterThan(150);
  });
});

test.describe("Safari gesture events", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "gesture events are WebKit-only");

  test("pinch scale is applied from the gesture start; ctrl+wheel is ignored meanwhile", async ({ page }) => {
    await page.goto(CORE);
    await openViewer(page, "#wide");
    const zoom = await zoomOf(page);
    const mid = await viewportCentre(page);
    const prevented = await page.evaluate(({ x, y }) => {
      const target = document.querySelector(".dz-viewport")!;
      const fire = (type: string, scale: number) => {
        const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { scale, clientX: x, clientY: y });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return [fire("gesturestart", 1), fire("gesturechange", 1.5), fire("gesturechange", 2)];
    }, mid);
    expect(prevented).toEqual([true, true, true]); // the page itself must not zoom
    await nextFrame(page);
    await nextFrame(page);
    expect(await zoomOf(page) / zoom).toBeCloseTo(2, 1);

    const during = await zoomOf(page);
    await viewport(page).evaluate((node, { x, y }) => {
      node.dispatchEvent(new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      node.dispatchEvent(Object.assign(new Event("gestureend", { bubbles: true, cancelable: true }), { scale: 2, clientX: x, clientY: y }));
    }, mid);
    await nextFrame(page);
    await nextFrame(page);
    expect(await zoomOf(page)).toBe(during);
  });
});
