import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["2058", "247747026"], ["2227", "247747260"], ["13", "247748525"],
  ["5078", "247749024"], ["22", "247749396"], ["2282", "247750145"],
  ["2802M", "247766281"], ["2057MW", "247766305"], ["2801", "247767202"],
  ["2229", "247767345"], ["2800", "247767533"], ["2048", "247767924"],
  ["2227MB", "247768933"], ["2239L", "247769086"], ["5079", "247856228"],
  ["2228", "247857157"], ["2080M", "247857810"], ["2804M", "247857989"],
  ["BB877-B70", "247987431"], ["AA503", "247987810"],
];

const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36" };

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

for (const [sku, albumId] of products) {
  const albumUrl = `https://sky678.x.yupoo.com/albums/${albumId}?uid=1`;
  const albumResponse = await fetchWithRetry(albumUrl, { headers });
  const html = await albumResponse.text();
  const matches = html.match(/(?:https?:)?\/\/photo\.yupoo\.com\/sky678\/[a-z0-9]+\/(?:big|small)\.[a-z]+/gi) ?? [];
  const photos = [...new Set(matches.map((url) => `${url.startsWith("//") ? "https:" : ""}${url}`.replace("/small.", "/big.")))].slice(0, 12);
  if (photos.length === 0) throw new Error(`${sku}: no photos found`);
  const outputDir = path.resolve("public", "catalog", "clothing", sku);
  await mkdir(outputDir, { recursive: true });
  const existing = (await readdir(outputDir)).filter((name) => name.endsWith(".webp"));
  if (existing.length >= photos.length) {
    process.stdout.write(`${sku}: ${existing.length} photos already prepared\n`);
    continue;
  }
  for (const [index, sourceUrl] of photos.entries()) {
    const response = await fetchWithRetry(sourceUrl, { headers: { ...headers, referer: albumUrl } });
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" }).rotate().resize(900, 900, { fit: "inside", withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toFile(output);
  }
  process.stdout.write(`${sku}: ${photos.length} photos prepared\n`);
}
