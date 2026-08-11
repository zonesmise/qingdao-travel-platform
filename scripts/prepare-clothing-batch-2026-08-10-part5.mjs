import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["OF102", "239883390"],
  ["OF103", "239883635"],
  ["OF104", "239884082"],
  ["OF105", "239884236"],
  ["OF01", "239884447"],
  ["OF02", "239884536"],
  ["OF05", "239884809"],
  ["OF07", "239884926"],
  ["OF08", "239884988"],
  ["OF09", "239885054"],
];

const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
};

for (const [sku, albumId] of products) {
  const albumUrl = `https://sky678.x.yupoo.com/albums/${albumId}?uid=1`;
  const albumResponse = await fetch(albumUrl, { headers });
  if (!albumResponse.ok) throw new Error(`${sku} album: HTTP ${albumResponse.status}`);
  const html = await albumResponse.text();
  const matches = html.match(/(?:https?:)?\/\/photo\.yupoo\.com\/sky678\/[a-z0-9]+\/(?:big|small)\.[a-z]+/gi) ?? [];
  const photos = [...new Set(matches.map((url) => `${url.startsWith("//") ? "https:" : ""}${url}`.replace("/small.", "/big.")))].slice(0, 12);
  if (photos.length === 0) throw new Error(`${sku}: no photos found`);

  const outputDir = path.resolve("public", "catalog", "clothing", sku);
  await mkdir(outputDir, { recursive: true });
  for (const [index, sourceUrl] of photos.entries()) {
    const response = await fetch(sourceUrl, { headers: { ...headers, referer: albumUrl } });
    if (!response.ok) throw new Error(`${sku} photo ${index + 1}: HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" })
      .rotate()
      .resize(1200, 1200, { fit: "contain", background: "#ffffff", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 84, effort: 4 })
      .toFile(output);
  }
  process.stdout.write(`${sku}: ${photos.length} photos prepared\n`);
}
