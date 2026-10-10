# diagram-zoom — Agent Instructions

A Quarto filter extension: every Mermaid and Graphviz diagram in HTML output gets an Enlarge
button that opens a modal viewer with zoom and pan. MIT, public. Plain JS + CSS + a few lines
of Lua — no build step, no runtime dependencies.

**State:** `docs/progress/v0.1.md` (milestones, Confirmed contracts — read before changing how
diagrams are found or when a Quarto upgrade breaks attaching).

## Architecture invariants

- **Shipped = `_extensions/diagram-zoom/` only.** `quarto add` copies nothing else; everything
  outside it is dev tooling.
- **Core vs glue.** `diagram-zoom.js` is the host-agnostic core: no Quarto selectors, no
  auto-run, no network, no timers. Other renderers vendor this exact file, so it must work on a
  plain HTML page. Quarto knowledge lives only in `diagram-zoom-quarto.js` (which SVGs to
  target, when Mermaid is done) and `diagram-zoom.lua` (when to add the dependency).
- **Move, never clone, the SVG.** Cloning duplicates marker IDs and Mermaid's `#id`-scoped
  styles. The viewer moves the SVG into the dialog and back to a comment anchor.
- **Never wrap the SVG.** Quarto's Mermaid `postProcess` walks the SVG's parents; the button is
  appended to the existing parent instead.
- **Theming through `--dz-*` only, read at the use site** with Bootstrap fallbacks
  (`var(--dz-bg, var(--bs-body-bg, Canvas))`). The core CSS never defines `--dz-*`, so a host
  maps them on `:root`.
- **Vector only.** `<img>` diagrams are out of scope (Quarto's `lightbox` covers images).

## Commands

Task runner is `package.json` (pnpm):

```sh
pnpm install           # dev deps (Playwright, TypeScript)
pnpm run check         # tsc --noEmit (strict checkJs) + version consistency
pnpm run fixtures      # install the extension into tests/fixtures/* and render them
pnpm test              # Playwright, all projects
pnpm run gate          # check + fixtures + test — run before every commit
```

`pnpm exec playwright install` once per machine for the browsers.

## Conventions

- `// @ts-check` + JSDoc types in the shipped JS; `tsc` strict; no `any`.
- Conventional Commits, committed directly to `main` (early phase); CI must be green, and
  `main` must stay releasable — `quarto add Lightbridge-KS/quarto-diagram-zoom` installs `main`.
- Shared records (commits, issues, PRs, CHANGELOG) are impersonal and public: no private
  hostnames, paths, or names.

## Releases

Version SSOT: `version:` in `_extensions/diagram-zoom/_extension.yml`. The Lua dependency
version and the JS banner must match (`pnpm run check` enforces it).

1. Move `## [Unreleased]` entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`; bump the
   three version strings.
2. `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z` — the tag is the release act.
3. `release.yml` guards tag == manifest, runs the gate, and drafts the GitHub release with the
   CHANGELOG section. A maintainer reviews and publishes the draft.
