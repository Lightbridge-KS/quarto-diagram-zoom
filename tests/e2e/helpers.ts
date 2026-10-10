import { expect, type Locator, type Page } from "@playwright/test";

export const CORE = "/tests/core/index.html";
export const DOC = (name: string) => `/tests/fixtures/doc/${name}.html`;

/** The Enlarge button that belongs to the SVG matched by `svg` (it sits beside the SVG). */
export const enlargeButton = (page: Page, svg: string): Locator =>
  page.locator(`:has(> ${svg}) > .dz-open`);

export const dialog = (page: Page): Locator => page.locator("dialog.dz-dialog");
export const viewport = (page: Page): Locator => page.locator(".dz-viewport");

/** Open the viewer for `svg` with a real click and wait until it is up. */
export async function openViewer(page: Page, svg: string): Promise<void> {
  await enlargeButton(page, svg).click();
  await expect(dialog(page)).toBeVisible();
}

/** Exact zoom of the open SVG (rendered width / viewBox width); the toolbar shows it rounded. */
export const zoomOf = (page: Page): Promise<number> =>
  page.locator(".dz-viewport svg").evaluate((svg) =>
    svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width);

/** Wait one animation frame (continuous input is applied per frame). */
export const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** Centre of an element, in viewport coordinates. */
export async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** IDs used more than once on the page. */
export const duplicateIds = (page: Page) =>
  page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  });

/** Close with Escape and wait for the asynchronous close to finish restoring the SVG. */
export async function closeWithEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
