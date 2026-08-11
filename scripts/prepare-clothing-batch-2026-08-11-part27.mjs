import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["2009", "248129292"], ["137871", "248138471"], ["137872", "248138575"],
  ["FFF7", "248146924"], ["M-ESCAUT", "248148428"], ["M-HUPPE", "248150473"],
  ["M-A", "248150843"], ["M-1616", "248151765"], ["137805", "248153704"],
  ["106943", "248226139"], ["LJ-106935", "248226357"], ["LJ-106798", "248226757"],
  ["LJ-106947", "248238963"], ["339061", "248404928"], ["B04", "249066347"],
  ["AA676", "249066896"], ["26291", "249067342"], ["113398", "249068050"],
];

const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36" };
async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
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
  if (existing.length >= photos.length) { process.stdout.write(`${sku}: ${existing.length} photos already prepared\n`); continue; }
  for (const [index, sourceUrl] of photos.entries()) {
    const response = await fetchWithRetry(sourceUrl, { headers: { ...headers, referer: albumUrl } });
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" }).rotate().resize(900, 900, { fit: "inside", withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toFile(output);
  }
  process.stdout.write(`${sku}: ${photos.length} photos prepared\n`);
}
