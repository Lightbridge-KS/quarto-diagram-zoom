/*! diagram-zoom 0.1.0 | MIT | https://github.com/Lightbridge-KS/quarto-diagram-zoom */
// @ts-check
// A zoom-and-pan viewer for inline SVG diagrams. Host-agnostic: no auto-run, no network,
// no timers. Hosts call attach()/observe() for an Enlarge button, or enlarge() directly.
(() => {
  "use strict";
  if (window.DiagramZoom) return; // idempotent when a page loads the file twice

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;
  const STEP = 1.25;
  const DRAG_SLOP = 4; // px of movement before a press becomes a pan (keeps link clicks working)
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Last input modality, so the canvas focus ring shows for keyboard users only (browsers
  // disagree on :focus-visible after programmatic focus). Passive bookkeeping, nothing else.
  let lastInput = "pointer";
  document.addEventListener("keydown", () => { lastInput = "keyboard"; }, true);
  document.addEventListener("pointerdown", () => { lastInput = "pointer"; }, true);

  /**
   * @template {keyof HTMLElementTagNameMap} K
   * @param {K} tag
   * @param {Record<string, string>} [attrs]
   * @param {...(Node | string)} children
   * @returns {HTMLElementTagNameMap[K]}
   */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  /**
   * @param {string} label
   * @param {() => void} action
   * @param {Record<string, string>} [attrs]
   */
  function button(label, action, attrs = {}) {
    const node = el("button", { type: "button", ...attrs }, label);
    node.addEventListener("click", action);
    return node;
  }

  /** Four outward corner arrows. */
  function enlargeIcon() {
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    icon.append(path);
    return icon;
  }

  /** @param {number} value */
  const clamp = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  /**
   * Wheel delta → zoom exponent (base 2). Reads deltaMode first: Firefox reports line mode
   * only to scripts that ask for it before deltaY.
   * @param {WheelEvent} event
   */
  function wheelExponent(event) {
    const mode = event.deltaMode;
    const unit = mode === 1 ? 0.05 : mode === 2 ? 1 : 0.002;
    const exponent = -event.deltaY * unit * (event.ctrlKey ? 10 : 1);
    return Math.max(-1, Math.min(1, exponent));
  }

  /**
   * Default dialog title: the figure caption, else "Diagram".
   * @param {SVGSVGElement} svg
   */
  function captionOf(svg) {
    return svg.closest("figure")?.querySelector("figcaption")?.textContent?.trim() || "Diagram";
  }

  /**
   * Open the viewer for one SVG. The SVG is moved (never cloned, so marker IDs and
   * id-scoped styles stay unique) into a modal dialog and moved back on close.
   * @param {SVGSVGElement} svg
   * @param {{ opener?: HTMLElement | null, title?: string, onClose?: () => void }} [options]
   */
  function enlarge(svg, { opener = null, title, onClose } = {}) {
    if (svg.closest(".dz-dialog")) return;
    const label = title || captionOf(svg);
    const host = svg.parentElement;
    const anchor = document.createComment("diagram-zoom");
    const saved = ["style", "width", "height"].map((name) => [name, svg.getAttribute(name)]);
    const box = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const naturalWidth = box && box.width > 0 ? box.width : rect.width || 900;
    const naturalHeight = box && box.height > 0 ? box.height : rect.height || 500;
    const hostMinHeight = host ? host.style.minHeight : "";
    // Hold the figure's height while its SVG is away, so the page behind does not reflow.
    if (host) host.style.minHeight = `${host.getBoundingClientRect().height}px`;

    const zoomText = el("span", { class: "dz-zoom", "aria-hidden": "true" });
    const announcer = el("output", { class: "dz-sr", "aria-live": "polite" });
    const viewport = el("div", {
      class: "dz-viewport",
      tabindex: "0",
      "aria-label": "Diagram canvas. Scroll or pinch to zoom, drag to pan; plus and minus zoom, zero fits.",
    });
    const dialog = el("dialog", { class: "dz-dialog", "aria-label": label });
    const toolbar = el(
      "div",
      { class: "dz-toolbar" },
      el("span", { class: "dz-title" }, label),
      button("−", () => step(1 / STEP), { "aria-label": "Zoom out" }),
      button("+", () => step(STEP), { "aria-label": "Zoom in" }),
      button("Fit", () => fit(true)),
      zoomText,
      announcer,
      button("Close", () => dialog.close()),
    );

    let zoom = 1;
    /** @type {{ value: number, x?: number, y?: number } | null} */
    let pending = null;
    let frame = 0;

    /**
     * Resize to `value`, keeping the content point under (x, y) in place (default: centre).
     * @param {number} value
     * @param {number} [x]
     * @param {number} [y]
     */
    function apply(value, x, y) {
      const before = svg.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      const px = x ?? view.left + view.width / 2;
      const py = y ?? view.top + view.height / 2;
      const fx = before.width ? (px - before.left) / before.width : 0.5;
      const fy = before.height ? (py - before.top) / before.height : 0.5;
      zoom = clamp(value);
      const width = naturalWidth * zoom;
      const height = naturalHeight * zoom;
      svg.style.maxWidth = "none";
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      const after = svg.getBoundingClientRect();
      viewport.scrollLeft += after.left + fx * after.width - px;
      viewport.scrollTop += after.top + fy * after.height - py;
      zoomText.textContent = `${Math.round(zoom * 100)}%`;
    }

    /** Continuous input (wheel, pinch) lands once per frame. */
    function schedule(/** @type {number} */ value, /** @type {number} */ x, /** @type {number} */ y) {
      pending = { value, x, y };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending) apply(pending.value, pending.x, pending.y);
          pending = null;
        });
      }
    }

    const announce = () => { announcer.textContent = `${Math.round(zoom * 100)}%`; };
    /** @param {number} factor */
    function step(factor) {
      apply((pending?.value ?? zoom) * factor);
      announce();
    }
    /** @param {boolean} [spoken] */
    function fit(spoken) {
      const scale = Math.min(
        1,
        (viewport.clientWidth - 16) / naturalWidth,
        (viewport.clientHeight - 16) / naturalHeight,
      );
      apply(scale);
      viewport.scrollTo(0, 0);
      if (spoken) announce();
    }

    // Wheel zooms, map-style; a horizontal-only wheel (shift+wheel, sideways swipe) pans natively.
    let gestureActive = false;
    viewport.addEventListener("wheel", (event) => {
      const exponent = wheelExponent(event);
      if (event.deltaY === 0) return;
      event.preventDefault();
      if (gestureActive) return; // Safari pinch already handled through gesture events
      schedule((pending?.value ?? zoom) * 2 ** exponent, event.clientX, event.clientY);
    }, { passive: false });

    // Pointer pan (mouse, pen, one finger) and two-finger pinch.
    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    /** @type {{ id: number, x: number, y: number, left: number, top: number, moved: boolean } | null} */
    let pan = null;
    /** @type {{ distance: number, zoom: number, fx: number, fy: number } | null} */
    let pinch = null;
    let suppressClick = false;

    const startPan = (/** @type {number} */ id, /** @type {{ x: number, y: number }} */ point, moved = false) => {
      pan = { id, x: point.x, y: point.y, left: viewport.scrollLeft, top: viewport.scrollTop, moved };
    };
    const twoPoints = () => [...pointers.values()].slice(0, 2);
    function startPinch() {
      const [a, b] = twoPoints();
      const rect = svg.getBoundingClientRect();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom,
        fx: rect.width ? (midX - rect.left) / rect.width : 0.5,
        fy: rect.height ? (midY - rect.top) / rect.height : 0.5,
      };
    }

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) startPan(event.pointerId, { x: event.clientX, y: event.clientY });
      else if (pointers.size === 2) { pan = null; startPinch(); }
    });
    viewport.addEventListener("pointermove", (event) => {
      const point = pointers.get(event.pointerId);
      if (!point) return;
      point.x = event.clientX;
      point.y = event.clientY;
      if (pinch && pointers.size >= 2) {
        const [a, b] = twoPoints();
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // Zoom with the finger spread and keep the pinched content under the moving midpoint.
        zoom = clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
        apply(zoom, midX, midY);
        const rect = svg.getBoundingClientRect();
        viewport.scrollLeft += rect.left + pinch.fx * rect.width - midX;
        viewport.scrollTop += rect.top + pinch.fy * rect.height - midY;
        suppressClick = true;
        return;
      }
      if (!pan || pan.id !== event.pointerId) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!pan.moved) {
        if (Math.hypot(dx, dy) < DRAG_SLOP) return;
        pan.moved = true;
        suppressClick = true;
        viewport.classList.add("dz-dragging");
        try { viewport.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      }
      viewport.scrollTo(pan.left - dx, pan.top - dy);
    });
    /** @param {PointerEvent} event */
    function release(event) {
      if (!pointers.delete(event.pointerId)) return;
      pinch = null;
      const rest = [...pointers.entries()];
      // One finger left after a pinch: re-baseline so the view does not jump.
      if (rest.length === 1) startPan(rest[0][0], rest[0][1], true);
      else if (rest.length === 0) {
        pan = null;
        viewport.classList.remove("dz-dragging");
      } else startPinch();
    }
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      viewport.addEventListener(type, (event) => release(/** @type {PointerEvent} */ (event)));
    }
    // A drag must not end as a click on a link inside the diagram.
    viewport.addEventListener("click", (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    viewport.addEventListener("pointerdown", () => { suppressClick = false; }, true);
    viewport.addEventListener("dragstart", (event) => event.preventDefault());

    // Safari trackpad pinch arrives as gesture events (scale is cumulative). On iOS the same
    // pinch also arrives as two touch pointers, which already zoom — so only block the page zoom.
    /** @typedef {Event & { scale: number, clientX: number, clientY: number }} GestureLike */
    let gestureStart = 1;
    /** @param {Event} event */
    function onGesture(event) {
      event.preventDefault();
      const gesture = /** @type {GestureLike} */ (event);
      if (event.type === "gestureend") { gestureActive = false; return; }
      if (pointers.size > 0 || !dialog.contains(/** @type {Node} */ (event.target))) return;
      if (event.type === "gesturestart") { gestureActive = true; gestureStart = zoom; return; }
      schedule(gestureStart * gesture.scale, gesture.clientX, gesture.clientY);
    }
    const gestureTypes = ["gesturestart", "gesturechange", "gestureend"];
    for (const type of gestureTypes) document.addEventListener(type, onGesture, { passive: false });

    viewport.addEventListener("keydown", (event) => {
      if (!["+", "=", "-", "_", "0"].includes(event.key) || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      if (event.key === "0") fit(true);
      else step(event.key === "-" || event.key === "_" ? 1 / STEP : STEP);
    });
    // The canvas focus ring is for keyboard users only (Safari shows it after a tap otherwise).
    if (lastInput === "keyboard") dialog.setAttribute("data-dz-keys", "");
    // Keep Tab inside the dialog.
    dialog.addEventListener("keydown", (event) => {
      dialog.setAttribute("data-dz-keys", "");
      if (event.key !== "Tab") return;
      const stops = [...dialog.querySelectorAll("button, [tabindex='0']")];
      const first = /** @type {HTMLElement} */ (stops[0]);
      const last = /** @type {HTMLElement} */ (stops[stops.length - 1]);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    // A click on the backdrop (outside the dialog box) closes it.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) dialog.close();
    });

    dialog.addEventListener("close", () => {
      if (frame) cancelAnimationFrame(frame);
      for (const type of gestureTypes) document.removeEventListener(type, onGesture);
      anchor.replaceWith(svg);
      for (const [name, value] of saved) {
        if (value === null) svg.removeAttribute(/** @type {string} */ (name));
        else svg.setAttribute(/** @type {string} */ (name), value);
      }
      if (host) host.style.minHeight = hostMinHeight;
      dialog.remove();
      opener?.focus();
      onClose?.();
    }, { once: true });

    svg.before(anchor);
    viewport.append(svg);
    dialog.append(toolbar, viewport);
    document.body.append(dialog);
    dialog.showModal();
    fit();
    viewport.focus();
  }

  /**
   * Add an Enlarge button to the SVG's parent (the SVG itself is never wrapped).
   * @param {SVGSVGElement} svg
   * @param {{ title?: string }} [options]
   * @returns {HTMLButtonElement | null}
   */
  function attach(svg, { title } = {}) {
    const host = svg.parentElement;
    if (!host || svg.hasAttribute("data-dz-attached")) return null;
    svg.setAttribute("data-dz-attached", "");
    host.classList.add("dz-host");
    const name = title || captionOf(svg);
    const label = name === "Diagram" ? "Enlarge diagram" : `Enlarge diagram: ${name}`;
    const control = el("button", {
      type: "button", class: "dz-open", "aria-label": label, title: "Enlarge diagram",
    });
    control.append(enlargeIcon());
    const open = () => enlarge(svg, { opener: control, title });
    control.addEventListener("click", open); // mouse and keyboard
    // Touch and pen open on pointerup (which never fires when the touch became a scroll):
    // iOS withholds the click when hovering changes the page — e.g. Quarto reveals a figure's
    // anchor link on :hover. When the tap's own click does follow (within iOS's ~350 ms
    // delay), swallow it so nothing fires twice; any later click passes untouched.
    control.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse") return;
      const tapped = event.timeStamp;
      const swallow = (/** @type {Event} */ late) => {
        document.removeEventListener("click", swallow, true);
        if (late.timeStamp - tapped < 700) { late.preventDefault(); late.stopPropagation(); }
      };
      document.addEventListener("click", swallow, true);
      open();
    });
    host.append(control);
    return control;
  }

  /**
   * True when an SVG may get a button: a top-level, non-decorative SVG that is not opted out,
   * not open in the viewer, and not part of the viewer's own UI (the button icon is an SVG).
   * @param {SVGSVGElement} svg
   */
  function eligible(svg) {
    return !svg.hasAttribute("data-dz-attached")
      && svg.getAttribute("aria-hidden") !== "true"
      && !svg.classList.contains("no-zoom")
      && !svg.parentElement?.closest("svg, .no-zoom, .dz-dialog, .dz-open");
  }

  /**
   * Attach buttons to every matching SVG under `root`, now and as the DOM changes.
   * Safe to call before DOMContentLoaded. `scan()` re-checks on demand, for when `match`
   * depends on state the DOM does not show (e.g. a renderer that gave up).
   * @param {Document | Element} [root]
   * @param {{ match?: (svg: SVGSVGElement) => boolean }} [options]
   * @returns {{ scan: () => void, disconnect: () => void }}
   */
  function observe(root = document, { match = () => true } = {}) {
    let queued = false;
    let stopped = false;
    /** @type {MutationObserver | null} */
    let observer = null;
    const scan = () => {
      queued = false;
      if (stopped) return;
      for (const svg of root.querySelectorAll("svg")) {
        if (eligible(svg) && match(svg)) attach(svg);
      }
    };
    const start = () => {
      if (stopped) return;
      scan();
      observer = new MutationObserver(() => {
        if (!queued) { queued = true; queueMicrotask(scan); }
      });
      observer.observe(root instanceof Document ? root.body : root, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    return {
      scan: () => { if (observer) scan(); },
      disconnect: () => { stopped = true; observer?.disconnect(); },
    };
  }

  window.DiagramZoom = { enlarge, attach, observe };
})();
