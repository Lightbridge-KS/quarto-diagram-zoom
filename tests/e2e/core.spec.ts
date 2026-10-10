// The host-agnostic core on a plain HTML page: attaching, the viewer, and its input model.
import { expect, test } from "@playwright/test";
import {
  CORE, centreOf, closeWithEscape, dialog, duplicateIds, enlargeButton, nextFrame, openViewer,
  viewport, zoomOf,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto(CORE);
});

test("attaches to top-level SVGs and skips opted-out and nested ones", async ({ page }) => {
  for (const svg of ["#wide", "#small", "#outer"]) await expect(enlargeButton(page, svg)).toHaveCount(1);
  for (const svg of ["#skipped", "#nested"]) await expect(enlargeButton(page, svg)).toHaveCount(0);
  await expect(enlargeButton(page, "#wide")).toHaveAttribute("aria-label", "Enlarge diagram: Wide test diagram");
  await expect(enlargeButton(page, "#small")).toHaveAttribute("aria-label", "Enlarge diagram");
});

test("opens fitted, titled, and focused, holding the host's height", async ({ page }) => {
  const hostHeight = await page.locator("#wide-host").evaluate((host) => host.getBoundingClientRect().height);
  await openViewer(page, "#wide");
  await expect(page.locator(".dz-title")).toHaveText("Wide test diagram");
  await expect(dialog(page)).toHaveAttribute("aria-label", "Wide test diagram");
  await expect(viewport(page).locator("svg#wide")).toHaveCount(1);
  await expect(viewport(page)).toBeFocused();
  const zoom = await zoomOf(page);
  expect(zoom).toBeGreaterThan(0.1);
  expect(zoom).toBeLessThan(1); // 2000 units wide never fits at 100%
  const svgBox = await viewport(page).locator("svg").boundingBox();
  const viewBox = await viewport(page).boundingBox();
  expect(svgBox!.width).toBeLessThanOrEqual(viewBox!.width);
  const held = await page.locator("#wide-host").evaluate((host) => host.style.minHeight);
  expect(Number.parseFloat(held)).toBeCloseTo(hostHeight, 0);
});

test("buttons and keys step, fit, and announce the zoom", async ({ page }) => {
  await openViewer(page, "#wide");
  const fitted = await zoomOf(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await zoomOf(page)).toBeCloseTo(fitted * 1.25, 1);
  await expect(page.locator(".dz-sr")).toHaveText((await page.locator(".dz-zoom").textContent()) ?? "");
  await viewport(page).focus();
  await page.keyboard.press("+");
  expect(await zoomOf(page)).toBeCloseTo(fitted * 1.25 * 1.25, 1);
  await page.keyboard.press("-");
  expect(await zoomOf(page)).toBeCloseTo(fitted * 1.25, 1);
  await page.keyboard.press("0");
  expect(await zoomOf(page)).toBeCloseTo(fitted, 2);
  await page.getByRole("button", { name: "Zoom out" }).click();
  expect(await zoomOf(page)).toBeCloseTo(fitted / 1.25, 1);
  await page.getByRole("button", { name: "Fit" }).click();
  expect(await zoomOf(page)).toBeCloseTo(fitted, 2);
});

test("Escape restores the SVG, its attributes, and focus, with no new duplicate IDs", async ({ page }) => {
  const before = await page.locator("#wide").evaluate((svg) => ({
    style: svg.getAttribute("style"), width: svg.getAttribute("width"), height: svg.getAttribute("height"),
  }));
  const duplicatesBefore = await duplicateIds(page);
  await openViewer(page, "#wide");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await closeWithEscape(page);
  const after = await page.locator("#wide").evaluate((svg) => ({
    style: svg.getAttribute("style"), width: svg.getAttribute("width"), height: svg.getAttribute("height"),
    host: svg.parentElement?.id, next: svg.nextElementSibling?.className,
  }));
  expect(after).toEqual({ ...before, host: "wide-host", next: "dz-open" });
  await expect(enlargeButton(page, "#wide")).toBeFocused();
  await expect(page.locator("#wide-host")).toHaveJSProperty("style.minHeight", "");
  expect(await duplicateIds(page)).toEqual(duplicatesBefore);
});

test("Close button and backdrop close; onClose fires", async ({ page, isMobile }) => {
  await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>("#small")!;
    (window as unknown as { dzClosed: number }).dzClosed = 0;
    window.DiagramZoom!.enlarge(svg, { onClose: () => { (window as unknown as { dzClosed: number }).dzClosed++; } });
  });
  await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { dzClosed: number }).dzClosed)).toBe(1);

  test.skip(isMobile, "the dialog fills a phone screen; there is no backdrop to click");
  await openViewer(page, "#small");
  await page.mouse.click(3, 3);
  await expect(dialog(page)).toHaveCount(0);
});

test("Tab stays inside the dialog", async ({ page }) => {
  await openViewer(page, "#wide");
  await expect(viewport(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(viewport(page)).toBeFocused();
});

test.describe("pointer input", () => {
  test.skip(({ isMobile }) => isMobile, "mouse wheel and drag are desktop input");

  test("wheel zooms at the cursor without scrolling the page", async ({ page }) => {
    await openViewer(page, "#wide");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const target = page.locator(".dz-viewport #target");
    const point = await centreOf(target);
    const pageY = await page.evaluate(() => scrollY);
    const zoom = await zoomOf(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -200);
    await nextFrame(page);
    await nextFrame(page);
    expect(await zoomOf(page)).toBeGreaterThan(zoom * 1.2);
    const after = await centreOf(target);
    expect(Math.abs(after.x - point.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - point.y)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => scrollY)).toBe(pageY);
    await page.mouse.wheel(0, 400);
    await nextFrame(page);
    await nextFrame(page);
    expect(await zoomOf(page)).toBeLessThan(zoom);
  });

  test("line-mode wheel (Firefox mouse) zooms by a sane step", async ({ page }) => {
    await openViewer(page, "#wide");
    const zoom = await zoomOf(page);
    const point = await centreOf(viewport(page));
    await viewport(page).evaluate((node, { x, y }) => {
      node.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -3, deltaMode: 1, clientX: x, clientY: y, bubbles: true, cancelable: true,
      }));
    }, point);
    await nextFrame(page);
    await nextFrame(page);
    expect(await zoomOf(page) / zoom).toBeCloseTo(2 ** 0.15, 1);
  });

  test("drag pans; a plain click still follows a link; a drag over a link does not", async ({ page }) => {
    await openViewer(page, "#wide");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    const left = await viewport(page).evaluate((node) => node.scrollLeft);
    const box = (await viewport(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 8 });
    await page.mouse.up();
    const panned = await viewport(page).evaluate((node) => node.scrollLeft);
    expect(panned - left).toBeGreaterThan(box.width * 0.3);

    await page.getByRole("button", { name: "Fit" }).click();
    const link = page.locator(".dz-viewport #link rect");
    const start = await centreOf(link);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => location.hash)).toBe("");
    await link.click();
    expect(await page.evaluate(() => location.hash)).toBe("#linked");
  });
});

test("the Enlarge button stays visible on touch-only devices", async ({ page, isMobile }) => {
  test.skip(!isMobile, "hover-capable devices reveal the button on hover");
  expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
  const opacity = await enlargeButton(page, "#wide").evaluate((node) => Number(getComputedStyle(node).opacity));
  expect(opacity).toBeGreaterThan(0.5);
});
