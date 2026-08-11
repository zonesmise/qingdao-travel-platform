import path from "node:path";
import sharp from "sharp";

const skus = process.argv.slice(2);
if (!skus.length) throw new Error("Provide one or more clothing SKUs.");

const tile = 180;
const label = 30;
const columns = 12;
const rows = skus.length;
const composites = [];

for (const [row, sku] of skus.entries()) {
  for (let index = 1; index <= columns; index += 1) {
    const file = path.resolve("public", "catalog", "clothing", sku, `${String(index).padStart(2, "0")}.webp`);
    try {
      const image = await sharp(file).resize(tile, tile, { fit: "contain", background: "#ffffff" }).png().toBuffer();
      composites.push({ input: image, left: index * tile, top: row * (tile + label) + label });
    } catch {
      // An album may legitimately contain fewer than 12 verified photos.
    }
  }
  const svg = Buffer.from(`<svg width="${tile}" height="${tile + label}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="10" y="24" font-family="Arial" font-size="18" font-weight="700">${sku}</text></svg>`);
  composites.push({ input: svg, left: 0, top: row * (tile + label) });
}

await sharp({ create: { width: (columns + 1) * tile, height: rows * (tile + label), channels: 3, background: "#eef1f5" } })
  .composite(composites)
  .jpeg({ quality: 88 })
  .toFile(path.resolve("work", "incoming", "clothing-contact-sheet.jpg"));
