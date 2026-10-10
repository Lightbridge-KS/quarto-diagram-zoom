# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Added

- `diagram-zoom` filter: an Enlarge button on every Mermaid (`mermaid-format: js` and `svg`)
  and Graphviz diagram in HTML documents, websites, and books.
- A modal viewer: wheel and trackpad-pinch zoom at the pointer, two-finger pinch and drag to
  pan on touch screens, `+` / `−` / `0` keys, Fit, and Close or `Esc` to return the diagram to
  the page.
- Theming from the page's Bootstrap variables, including Quarto's light/dark toggle, with
  `--dz-*` custom properties to override.
- `.no-zoom` class to leave a diagram without a button.
- A host-agnostic core (`DiagramZoom.enlarge`, `attach`, `observe`) usable on any HTML page.

[Unreleased]: https://github.com/Lightbridge-KS/quarto-diagram-zoom/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Lightbridge-KS/quarto-diagram-zoom/releases/tag/v0.1.0
