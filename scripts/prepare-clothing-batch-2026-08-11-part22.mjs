import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["K604", "244569402"], ["K207", "244577291"], ["K315", "244747805"],
  ["191010", "244863095"], ["193286", "244863355"], ["2116-4B", "245089393"],
  ["D370-C30", "245089770"], ["D338-C70", "245090627"], ["86513-818", "245090754"],
  ["208347", "245090852"], ["25339-5B", "245179951"], ["205004", "245180337"],
  ["1685121-B45", "245180470"], ["214592", "245180578"], ["214735", "245180813"],
  ["FF762", "245181172"], ["206169", "245181731"], ["K131", "245278202"],
  ["K180", "245278424"], ["K169", "245279063"],
];

const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36" };

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
  const existing = (await readdir(outputDir)).filter((name) => name.endsWith(".webp"));
  if (existing.length >= photos.length) {
    process.stdout.write(`${sku}: ${existing.length} photos already prepared\n`);
    continue;
  }
  for (const [index, sourceUrl] of photos.entries()) {
    const response = await fetch(sourceUrl, { headers: { ...headers, referer: albumUrl } });
    if (!response.ok) throw new Error(`${sku} photo ${index + 1}: HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" }).rotate().resize(1200, 1200, { fit: "contain", background: "#ffffff", withoutEnlargement: true }).flatten({ background: "#ffffff" }).webp({ quality: 84, effort: 4 }).toFile(output);
  }
  process.stdout.write(`${sku}: ${photos.length} photos prepared\n`);
}
