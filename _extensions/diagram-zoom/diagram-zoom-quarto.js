// @ts-check
// Quarto glue: which SVGs are diagrams, and when Quarto's Mermaid render has settled.
// Loaded after <body> (afterBody dependency), so DiagramZoom is defined.
(() => {
  "use strict";
  /** @param {SVGSVGElement} svg */
  const isDiagram = (svg) =>
    svg.classList.contains("mermaid-js") // mermaid-format: js (HTML default)
    || svg.id.startsWith("mermaid-figure-") // mermaid-format: svg
    || svg.querySelector(":scope > g.graph") !== null; // Graphviz

  // Quarto renders Mermaid one diagram at a time on window load, then sizes every SVG
  // (mermaid-init.js postProcess) only after the last one. Wait until no transient
  // <pre class="mermaid-js"> is left — or until the render loop throws (a diagram that fails,
  // e.g. one inside a hidden tab), which surfaces as an unhandled rejection and stops the loop.
  let mermaidGaveUp = false;
  const mermaidSettled = () => mermaidGaveUp || !document.querySelector("pre.mermaid-js");

  /** @param {SVGSVGElement} svg */
  const match = (svg) =>
    isDiagram(svg)
    && !svg.closest("pre, .tippy-box, .html-widget")
    && (!svg.classList.contains("mermaid-js") || mermaidSettled());

  const handle = window.DiagramZoom?.observe(document, { match });
  window.addEventListener("unhandledrejection", () => {
    mermaidGaveUp = true;
    handle?.scan();
  });
})();
