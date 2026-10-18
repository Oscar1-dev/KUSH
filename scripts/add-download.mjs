// Publishes a file as a protected download for an existing product.
//   node scripts/add-download.mjs <product-slug> <version> <path-to-file> [--apply]
// The file is copied into .local/downloads under a random name (never a
// public path) and recorded with its SHA-256. Owners of the product then see
// it on the website; downloads use short-lived signed links.
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { configuration, databaseClient } from "./runtime.mjs";

const [slug, version, source] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!slug || !version || !source) throw new Error("Usage: add-download.mjs <product-slug> <version> <file> [--apply]");
const discord = JSON.parse(await readFile(new URL("../.local/discord.json", import.meta.url), "utf8"));
const info = await stat(source);
const sha256 = createHash("sha256").update(await readFile(source)).digest("hex");
const filename = path.basename(source).replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
const client = databaseClient(await configuration());
await client.connect();
try {
  const product = (
    await client.query("SELECT id,name,status FROM products WHERE tenant_id=$1 AND slug=$2", [discord.supportTenantId, slug])
  ).rows[0];
  if (!product) throw new Error(`No product "${slug}"`);
  console.table([{ product: product.name, status: product.status, version, filename, bytes: info.size, sha256 }]);
  if (!process.argv.includes("--apply")) {
    console.log("Dry run. Re-run with --apply to publish.");
  } else {
    const key = randomUUID();
    const dir = process.env.KUSH_DOWNLOADS_DIR ?? path.resolve(".local", "downloads");
    await mkdir(dir, { recursive: true });
    await copyFile(source, path.join(dir, key));
    await client.query(
      `INSERT INTO product_files(tenant_id,product_id,version,filename,size_bytes,sha256,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [discord.supportTenantId, product.id, version, filename, info.size, sha256, key],
    );
    console.log("Published.");
  }
} finally {
  await client.end();
}
