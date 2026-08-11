import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const styleNumber = "1030555";
const referer = "https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000239";
const photos = Array.from(
  { length: 6 },
  (_, index) => `https://keenkorea.hgodo.com/th/${styleNumber}_${String(index).padStart(2, "0")}.jpg`,
);

const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
};

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { ...headers, referer },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

const outputDir = path.resolve("public", "catalog", "shoes", styleNumber);
await mkdir(outputDir, { recursive: true });

for (const [index, sourceUrl] of photos.entries()) {
  const response = await fetchWithRetry(sourceUrl);
  const input = Buffer.from(await response.arrayBuffer());
  const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
  await sharp(input, { failOn: "error" })
    .rotate()
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(output);
}

const prepared = (await readdir(outputDir)).filter((name) => name.endsWith(".webp"));
if (prepared.length !== photos.length) {
  throw new Error(`${styleNumber}: expected ${photos.length} photos, found ${prepared.length}`);
}
process.stdout.write(`${styleNumber}: ${prepared.length} official photos prepared\n`);
