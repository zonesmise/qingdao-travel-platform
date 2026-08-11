import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SUPPLIER_SKU_MEDIA } from "../lib/yupoo-sku-media.ts";

const OUTPUT_ROOT = path.resolve("public/catalog/supplier");
const CONCURRENCY = 16;

function assetKey(sku) {
  return sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function alreadyValid(filePath) {
  try {
    const file = await stat(filePath);
    if (file.size < 1_000) return false;
    const metadata = await sharp(filePath).metadata();
    return metadata.format === "webp" && Number(metadata.width) > 0 && Number(metadata.height) > 0;
  } catch {
    return false;
  }
}

async function fetchSource(url, albumUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
          referer: albumUrl,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) throw new Error(`unexpected ${contentType || "content type"}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

const jobs = Object.entries(SUPPLIER_SKU_MEDIA).flatMap(([sku, supplier]) =>
  supplier.mediaUrls.map((url, index) => ({
    sku,
    supplier,
    url,
    index,
    filePath: path.join(OUTPUT_ROOT, assetKey(sku), `${String(index + 1).padStart(2, "0")}.webp`),
  })),
);

let cursor = 0;
let completed = 0;
const failures = [];

async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor];
    cursor += 1;
    try {
      if (!(await alreadyValid(job.filePath))) {
        const source = await fetchSource(job.url, job.supplier.albumUrl);
        await mkdir(path.dirname(job.filePath), { recursive: true });
        await sharp(source, { failOn: "error" })
          .rotate()
          .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .webp({ quality: 82, effort: 4 })
          .toFile(job.filePath);
      }
      completed += 1;
      if (completed % 50 === 0 || completed === jobs.length) {
        process.stdout.write(`Prepared ${completed}/${jobs.length} photos\n`);
      }
    } catch (error) {
      failures.push({ sku: job.sku, url: job.url, error: String(error) });
      process.stderr.write(`Failed ${job.sku} photo ${job.index + 1}: ${String(error)}\n`);
    }
  }
}

await mkdir(OUTPUT_ROOT, { recursive: true });
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

if (failures.length) {
  process.stderr.write(`${failures.length} photo downloads failed. Re-run the script to retry.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`All ${jobs.length} supplier photos are stored locally.\n`);
}
