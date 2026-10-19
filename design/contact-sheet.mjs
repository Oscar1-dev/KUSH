// Tiles rendered showcase PNGs into one preview image for quick review.
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const sharp = require(resolve(import.meta.dirname, "../node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp"));
const dir = resolve(import.meta.dirname, "../public/showcase");
const pick = process.argv.slice(3);
const files = readdirSync(dir).filter((f) => f.endsWith(".png") && !f.includes("portrait") && (!pick.length || pick.some((p) => f.startsWith(p))));
const W = 800, H = 500, cols = 2;
const tiles = await Promise.all(files.map((f) => sharp(join(dir, f)).resize(W, H).toBuffer()));
const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
  .png().toFile(process.argv[2]);
console.log(files.join(" "));
