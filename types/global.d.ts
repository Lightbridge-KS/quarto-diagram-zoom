// The browser global defined by _extensions/diagram-zoom/diagram-zoom.js.
interface DiagramZoomApi {
  enlarge(
    svg: SVGSVGElement,
    options?: { opener?: HTMLElement | null; title?: string; onClose?: () => void },
  ): void;
  attach(svg: SVGSVGElement, options?: { title?: string }): HTMLButtonElement | null;
  observe(
    root?: Document | Element,
    options?: { match?: (svg: SVGSVGElement) => boolean },
  ): { scan(): void; disconnect(): void };
}

interface Window {
  DiagramZoom?: DiagramZoomApi;
}
