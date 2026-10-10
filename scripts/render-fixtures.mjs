// Install the extension into each fixture the way users do (`quarto add <dir>`), then render.
// Mermaid's svg/png formats need a Chrome at render time: Playwright's Chromium via QUARTO_CHROMIUM.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = `${root}tests/fixtures/`;
const env = { ...process.env, QUARTO_CHROMIUM: process.env.QUARTO_CHROMIUM ?? chromium.executablePath() };

/** @param {string[]} args @param {string} cwd */
const quarto = (args, cwd) => {
  console.log(`$ quarto ${args.join(" ")}   (${cwd.replace(root, "")})`);
  execFileSync("quarto", args, { cwd, env, stdio: "inherit" });
};

for (const project of ["doc", "book", "website"]) {
  quarto(["add", root, "--no-prompt", "--quiet"], `${fixtures}${project}`);
}
// Standalone documents: each declares its own format.
const docs = readdirSync(`${fixtures}doc`).filter((name) => name.endsWith(".qmd")).sort();
for (const name of docs) quarto(["render", name, "--quiet"], `${fixtures}doc`);
quarto(["render", "--quiet"], `${fixtures}book`);
quarto(["render", "--quiet"], `${fixtures}website`);
