import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["142439", "242917548"],
  ["154947", "242950648"],
  ["D349-A60", "243039494"],
  ["hqcp001", "243097460"],
  ["gucci002", "243097979"],
  ["MYZ9887", "243098187"],
  ["K302", "243104937"],
  ["K181", "243106825"],
  ["687457", "243577039"],
  ["171657", "243781352"],
  ["0625N", "243781554"],
  ["06DY-D", "243781703"],
  ["06TT-D", "243783470"],
  ["175616", "243783872"],
  ["175610", "243784083"],
  ["113189", "244487887"],
  ["DD151", "244564604"],
  ["113144", "244567815"],
  ["K297", "244568835"],
  ["316", "244569252"],
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
  for (const [index, sourceUrl] of photos.entries()) {
    const response = await fetch(sourceUrl, { headers: { ...headers, referer: albumUrl } });
    if (!response.ok) throw new Error(`${sku} photo ${index + 1}: HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" }).rotate().resize(1200, 1200, { fit: "contain", background: "#ffffff", withoutEnlargement: true }).flatten({ background: "#ffffff" }).webp({ quality: 84, effort: 4 }).toFile(output);
  }
  process.stdout.write(`${sku}: ${photos.length} photos prepared\n`);
}
