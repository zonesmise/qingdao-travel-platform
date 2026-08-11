import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["55036", "247988010"], ["801034", "247988236"], ["24066-A70", "247988454"],
  ["25196-B10", "247989024"], ["D406-B30", "247989168"], ["86545-818", "247989294"],
  ["86580-818", "247989420"], ["BB864-B70", "247989605"], ["K78", "247996595"],
  ["2516", "248119934"], ["C36", "248120546"], ["137788", "248120828"],
  ["137766", "248121937"], ["137765", "248122055"], ["137761", "248122543"],
  ["137633", "248123095"], ["137855", "248123668"], ["C86", "248124785"],
  ["137786", "248125246"], ["137780", "248129030"],
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
