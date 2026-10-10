// Version consistency: _extension.yml (SSOT) == Lua dependency version == JS/CSS banners.
// Usage: node scripts/check-version.mjs [--tag vX.Y.Z]   (the release workflow passes the tag)
import { readFileSync } from "node:fs";

const dir = new URL("../_extensions/diagram-zoom/", import.meta.url);
/** @param {string} name */
const read = (name) => readFileSync(new URL(name, dir), "utf8");
/** @param {string} name @param {RegExp} pattern */
const grab = (name, pattern) => read(name).match(pattern)?.[1] ?? `<missing in ${name}>`;

const manifest = grab("_extension.yml", /^version:\s*["']?([^"'\s]+)/m);
const found = {
  "diagram-zoom.lua": grab("diagram-zoom.lua", /^local VERSION = "([^"]+)"/m),
  "diagram-zoom.js": grab("diagram-zoom.js", /^\/\*! diagram-zoom (\S+) /),
  "diagram-zoom.css": grab("diagram-zoom.css", /^\/\*! diagram-zoom (\S+) /),
};
const problems = Object.entries(found)
  .filter(([, version]) => version !== manifest)
  .map(([file, version]) => `${file} has ${version}`);

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1] ?? "";
  if (tag !== `v${manifest}`) problems.push(`tag ${tag || "<none>"} != v${manifest}`);
}

if (problems.length) {
  console.error(`version mismatch against _extension.yml (${manifest}):\n  ${problems.join("\n  ")}`);
  console.error("Fix: set the same version in every file listed (see AGENTS.md › Releases).");
  process.exit(1);
}
console.log(`version ${manifest} consistent${tagIndex !== -1 ? " with tag" : ""}`);
