// Renders the concept showcase HTML files in design/concepts to PNGs in
// public/showcase, using headless Chrome. Run: node design/render.mjs [ids…]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "design", "concepts");
const out = join(root, "public", "showcase");
mkdirSync(out, { recursive: true });

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
if (!chrome) throw new Error("No Chrome or Edge found");

const only = process.argv.slice(2);
const files = readdirSync(src).filter((f) => f.endsWith(".html") && (!only.length || only.includes(f.replace(".html", ""))));
// A separate, throwaway profile so the user's own browser is never touched.
const profile = join(tmpdir(), "kush-render-profile");

for (const file of files) {
  const id = file.replace(".html", "");
  const portrait = id.endsWith("-portrait");
  const [w, h] = portrait ? [1080, 1920] : [1600, 1000];
  const target = join(out, `${id}.png`);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--force-device-scale-factor=1",
    `--window-size=${w},${h}`,
    "--virtual-time-budget=6000",
    `--screenshot=${target}`,
    pathToFileURL(join(src, file)).href,
  ], { stdio: "ignore" });
  console.log(`${id}.png  ${(statSync(target).size / 1024).toFixed(0)} KB`);
}
