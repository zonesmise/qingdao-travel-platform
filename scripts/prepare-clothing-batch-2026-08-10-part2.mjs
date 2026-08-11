import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  ["M320", "239793787", ["15773c421d/big.jpeg", "677c224ddc/big.jpeg", "6716e3b102/big.jpeg", "012ea05813/big.jpeg", "c39adf410a/big.jpeg"]],
  ["M317", "239793937", ["607eba3a0d/big.jpeg", "d64ab08c1b/big.jpeg", "6691736eb5/big.jpeg", "b4e53c3769/big.jpeg", "acd41f7efc/big.jpeg", "39f827a3aa/big.jpeg"]],
  ["M307", "239795201", ["cc25d9a09d/big.jpeg", "23af46b6a5/big.jpeg", "d3a978660f/big.jpeg", "8e6d640f39/big.jpeg", "28bc765a81/big.jpeg", "b79d81fd49/big.jpeg", "4a5db1f51a/big.jpeg", "699ce0c337/big.jpeg", "c27d519124/big.jpeg", "56636e628f/big.jpeg"]],
  ["M305", "239795461", ["9bb649c1c1/big.jpeg", "1c912d4fc4/big.jpeg", "95c33c3263/big.jpeg", "bc4bf30260/big.jpeg", "04d7c07961/big.jpeg", "45f6f35344/big.jpeg", "6b52f14dd4/big.jpeg", "b6fe93f472/big.jpeg", "10da9b63d1/big.jpeg", "36b581ddf0/big.jpeg", "1b4259fd13/big.jpeg", "9036287e52/big.jpeg"]],
  ["M303", "239795726", ["98e41fd9a2/big.jpeg", "5205b7cdbe/big.jpeg", "7d3e541905/big.jpeg", "4507c792ad/big.jpeg", "c16468e219/big.jpeg"]],
  ["M300", "239796672", ["3dcd0e0eb5/big.jpeg", "bc3f7bba2c/big.jpeg", "c7169d4abb/big.jpeg", "a7c16f3a4f/big.jpeg", "5b9afd949c/big.jpeg", "fc09a43392/big.jpeg", "7f6f345ce4/big.jpeg", "f2140e6a1c/big.jpeg", "1b8f4d6e0a/big.jpeg", "f4260b6c61/big.jpeg", "3205448f9c/big.jpeg"]],
  ["M296", "239796891", ["b6106d7699/big.jpeg", "41aab12229/big.jpeg", "c15e34a526/big.jpeg", "d4c68d2401/big.jpeg", "306ba73018/big.jpeg", "84381a1da2/big.jpeg", "768ee8cde0/big.jpeg", "5d74ff5fed/big.jpeg", "f05ac3f478/big.jpeg", "ac689f975c/big.jpeg", "2fa051a380/big.jpeg"]],
  ["M291", "239797127", ["4d7c9161e6/big.jpeg", "5dcec359e2/big.jpeg", "239231c56b/big.jpeg", "760cf75881/big.jpeg", "5556d1f261/big.jpeg", "d746a5c306/big.jpeg", "64afa668da/big.jpeg", "618bb6da48/big.jpeg", "7f4334397f/big.jpeg", "9d128b5189/big.jpeg", "44b4e19f44/big.jpeg", "7e769b6a1d/big.jpeg"]],
  ["M289", "239797429", ["006920d336/big.jpeg", "e9fb7c8eb3/big.jpeg", "fcdd5a1a20/big.jpeg", "49212335fc/big.jpeg", "9c06bdf2c3/big.jpeg", "ab8f163742/big.jpeg", "948be05b0d/big.jpeg", "a7654b1fdf/big.jpeg", "a0c809d287/big.jpeg", "4434537aa2/big.jpeg"]],
  ["M288", "239797529", ["f071432038/big.jpeg", "e7605da430/big.jpeg", "ac09baf858/big.jpeg", "a618fd75d1/big.jpeg", "c1d1610f9f/big.jpeg", "f1490870cf/big.jpeg", "f4e0c75718/big.jpeg", "23f244e6cc/big.jpeg", "90cd239193/big.jpeg"]],
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
