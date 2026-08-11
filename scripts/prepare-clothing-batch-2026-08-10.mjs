import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["M811", "239786436", ["06ea4d3297/big.jpeg", "57fd265a2d/big.png", "f9a0abe5ef/big.jpeg", "abe08f6157/big.jpeg", "fc54d65f09/big.jpeg", "ea92db8e70/big.jpeg", "cb3c07128a/big.jpeg", "c1893713a5/big.jpeg"]],
  ["M809", "239786695", ["1d749f95c8/big.jpeg", "b0cb1fc743/big.jpeg", "f295520fca/big.jpeg", "56730a921d/big.jpeg", "84408e7c0a/big.jpeg", "32e77e770e/big.jpeg", "9a45d863a1/big.jpeg"]],
  ["M131", "239786928", ["78346de9bb/big.jpeg", "710003d111/big.jpeg", "d2073264bf/big.jpeg"]],
  ["M366", "239787565", ["47fe48c9f9/big.jpeg", "25a85e5473/big.jpeg", "b0b99cb19f/big.jpeg", "99149f58d4/big.jpeg", "ff02c54424/big.jpeg", "e794315af2/big.jpeg", "c23833ca67/big.jpeg", "f3ae44b4f1/big.jpeg"]],
  ["M316", "239787777", ["2192c73e23/big.jpeg", "c7de6e0bcb/big.jpeg", "772ae145f8/big.jpeg", "3891aa32a5/big.jpeg", "fc3eda2c8b/big.jpeg", "5208539443/big.jpeg", "3e29746609/big.jpeg", "782c640a44/big.jpeg", "34b5d27eb5/big.jpeg", "a7716c5d77/big.jpeg"]],
  ["M350", "239788750", ["d8b197a3a8/big.jpeg", "87c92bf029/big.jpeg", "26d520b7d7/big.jpeg", "877a41249e/big.jpeg", "139122acda/big.jpeg"]],
  ["M344", "239788945", ["ffb25d86d4/big.jpeg", "cbade9f949/big.jpeg", "db62b80284/big.jpeg", "aedc9dc835/big.jpeg", "e350736811/big.jpeg"]],
  ["M325", "239789309", ["16e30800b7/big.jpeg", "c3b0ecf937/big.jpeg", "e6a0962f07/big.jpeg", "739c9d95f7/big.jpeg", "a9ae440d35/big.jpeg", "4c5cdcdc23/big.jpeg"]],
  ["M313", "239793159", ["ea744b1795/big.jpeg", "9bd91a6699/big.jpeg", "6685064162/big.jpeg", "5964652fa9/big.jpeg", "8735aa74f5/big.jpeg", "a21ea9d895/big.jpeg"]],
  ["M314", "239793613", ["58f3673411/big.jpeg", "92cebbe56d/big.jpeg", "11df7e95ad/big.jpeg", "8cec1f6da5/big.jpeg", "521e105726/big.jpeg"]],
];

for (const [sku, albumId, photos] of products) {
  const outputDir = path.resolve("public", "catalog", "clothing", sku);
  await mkdir(outputDir, { recursive: true });
  for (const [index, photo] of photos.entries()) {
    const sourceUrl = `https://photo.yupoo.com/sky678/${photo}`;
    const response = await fetch(sourceUrl, {
      headers: {
        referer: `https://sky678.x.yupoo.com/albums/${albumId}?uid=1`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
      },
    });
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
