// Quarto integration: which rendered diagrams get a button, theming, embedded resources,
// books and websites, and the formats the filter must leave alone. Run `pnpm run fixtures` first.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DOC, closeWithEscape, dialog, enlargeButton, openViewer, viewport } from "./helpers";

const fixture = (path: string) => readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8");

test.describe("standalone document", () => {
  test("Mermaid and Graphviz get buttons; opted-out ones do not", async ({ page }) => {
    await page.goto(DOC("basic"));
    await expect(enlargeButton(page, "svg#fig-flow-mermaid")).toHaveCount(1);
    await expect(enlargeButton(page, "svg.mermaid-js:not(#fig-flow-mermaid)")).toHaveCount(1); // sequence
    await expect(page.locator(".no-zoom .dz-open")).toHaveCount(0);
    await expect(page.locator(".no-zoom svg.mermaid-js")).toHaveCount(1); // rendered, just skipped
    await expect(page.locator(":has(> svg > g.graph) > .dz-open")).toHaveCount(2); // incl. hidden tab
    await expect(page.locator(".dz-open")).toHaveCount(4);
    await expect(page.locator("pre.mermaid-js")).toHaveCount(0);
  });

  test("a diagram opens and closes back into its figure", async ({ page }) => {
    await page.goto(DOC("basic"));
    await openViewer(page, "svg#fig-flow-mermaid");
    await expect(page.locator(".dz-title")).toHaveText(/Flow under test\./);
    await expect(viewport(page).locator("svg#fig-flow-mermaid")).toHaveCount(1);
    await closeWithEscape(page);
    await expect(page.locator("#fig-flow svg#fig-flow-mermaid")).toHaveCount(1);
  });

  test("a Graphviz diagram in a hidden tab opens at a usable size", async ({ page }) => {
    await page.goto(DOC("basic"));
    const hidden = page.locator(".tab-pane:not(.active) :has(> svg > g.graph) > .dz-open");
    await expect(hidden).toHaveCount(1);
    await hidden.evaluate((button: HTMLElement) => button.click()); // its tab is not shown
    await expect(dialog(page)).toBeVisible();
    const box = await viewport(page).locator("svg").boundingBox();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(10);
  });

  test("cross-reference hover previews carry no live button", async ({ page, isMobile }) => {
    test.skip(isMobile, "hover previews need a mouse");
    await page.goto(DOC("basic"));
    await expect(enlargeButton(page, "svg#fig-flow-mermaid")).toHaveCount(1);
    await page.locator("a.quarto-xref").first().hover();
    const preview = page.locator(".tippy-box");
    await expect(preview).toBeVisible();
    // Quarto clones the whole figure, button included; the clone must stay hidden.
    await expect(preview.locator(".dz-open")).toHaveCount(1);
    await expect(preview.locator(".dz-open")).toBeHidden();
  });

  test("diagrams in hidden containers do not stop the others from getting buttons", async ({ page }) => {
    await page.goto(DOC("hidden"));
    const first = page.locator("svg.mermaid-js").first();
    await expect(first).toBeAttached();
    await expect(page.locator(":has(> svg.mermaid-js) > .dz-open").first()).toBeAttached();
    // Quarto may fail to lay out a Mermaid diagram that is hidden at load; every one it did
    // render still gets a button once its render loop settles or gives up.
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll("svg.mermaid-js")]
        .filter((svg) => !svg.closest("pre"))
        .every((svg) => svg.parentElement?.querySelector(":scope > .dz-open")),
    )).toBe(true);
  });

  test("mermaid-format: svg diagrams get a button; png images do not", async ({ page }) => {
    await page.goto(DOC("svg-format"));
    await expect(enlargeButton(page, 'svg[id^="mermaid-figure-"]')).toHaveCount(1);
    await page.goto(DOC("png-format"));
    await expect(page.locator("img[src*='mermaid-figure']")).toHaveCount(1);
    await page.waitForLoadState("load");
    await expect(page.locator(".dz-open")).toHaveCount(0);
  });

  test("the viewer follows Quarto's light/dark toggle", async ({ page }) => {
    await page.goto(DOC("dark"));
    const colours = async () => {
      await openViewer(page, "svg.mermaid-js");
      const result = await dialog(page).evaluate((node) => ({
        dialog: getComputedStyle(node).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      }));
      await closeWithEscape(page);
      return result;
    };
    const light = await colours();
    expect(light.dialog).toBe(light.body);
    await page.evaluate(() => (window as unknown as { quartoToggleColorScheme: () => void }).quartoToggleColorScheme());
    await expect(page.locator("body")).toHaveClass(/quarto-dark/);
    const dark = await colours();
    expect(dark.dialog).toBe(dark.body);
    expect(dark.dialog).not.toBe(light.dialog);
  });

  test("embed-resources: true produces a working single file", async ({ page }) => {
    const html = fixture("doc/embed.html");
    expect(html).not.toMatch(/<script[^>]+src="[^"]*diagram-zoom/);
    expect(html).toContain("window.DiagramZoom = ");
    await page.goto(DOC("embed"));
    await expect(page.locator(".dz-open")).toHaveCount(2);
    await openViewer(page, "svg.mermaid-js");
    await closeWithEscape(page);
  });
});

test.describe("projects", () => {
  test("book: every chapter carries the dependency; a chapter diagram opens", async ({ page }) => {
    for (const chapter of ["index", "mermaid", "graphviz"]) {
      expect(fixture(`book/_book/${chapter}.html`)).toContain("diagram-zoom.js");
    }
    await page.goto("/tests/fixtures/book/_book/mermaid.html");
    await expect(page.locator(".dz-open")).toHaveCount(1);
    await openViewer(page, "svg#fig-book-flow-mermaid");
    await expect(page.locator(".dz-title")).toHaveText(/A chapter flowchart\./);
    await closeWithEscape(page);
    await page.goto("/tests/fixtures/book/_book/graphviz.html");
    await expect(page.locator(".dz-open")).toHaveCount(1);
  });

  test("website: every page carries the dependency; diagrams open", async ({ page }) => {
    for (const name of ["index", "diagrams"]) expect(fixture(`website/_site/${name}.html`)).toContain("diagram-zoom.js");
    await page.goto("/tests/fixtures/website/_site/diagrams.html");
    await expect(page.locator(".dz-open")).toHaveCount(2);
    await openViewer(page, "svg.mermaid-js");
    await closeWithEscape(page);
  });
});

test.describe("formats left alone", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "file checks, one project is enough");

  test("Reveal.js slides get no dependency", () => {
    expect(fixture("doc/slides.html")).not.toContain("diagram-zoom");
  });

  test("DOCX renders with the filter enabled", () => {
    expect(readFileSync(new URL("../fixtures/doc/docx.docx", import.meta.url)).length).toBeGreaterThan(1000);
  });
});
