import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["A204", "247730967"], ["A205", "247731145"], ["A206", "247731418"],
  ["B101", "247731607"], ["B102", "247731835"], ["B103", "247731987"],
  ["B104", "247732135"], ["B105", "247732281"], ["B106", "247732421"],
  ["2106-3B", "247734281"], ["26305-3B", "247734432"], ["86202", "247734719"],
  ["K781", "247735588"], ["D34", "247735788"], ["D01", "247736567"],
  ["D75", "247737218"], ["D51", "247737487"], ["2256W", "247744586"],
  ["2252M", "247745197"], ["2051", "247746217"],
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
