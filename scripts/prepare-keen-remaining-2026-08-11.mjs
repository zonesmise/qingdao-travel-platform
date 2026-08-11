import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  {
    styleNumber: "1004347",
    referer: "https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000448",
    photos: [
      "https://keenkorea.hgodo.com/th/1004347_00.jpg",
      "https://keenkorea.hgodo.com/th/1004347_01.jpg",
      "https://keenkorea.hgodo.com/th/1004347_02.jpg",
      "https://keenkorea.hgodo.com/th/1004347_03.jpg",
      "https://keenkorea.hgodo.com/th/1004347_04.jpg",
    ],
  },
];

// 1004337의 검수 사진 3장은 공급사 상세 앨범에서 이미 준비되어 있습니다.
// 이 스크립트는 공식 사진이 공개된 1004347만 다시 받아 기존 파일을 안전하게 보완합니다.

const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
};

async function fetchWithRetry(url, referer, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { ...headers, referer },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

for (const product of products) {
  const outputDir = path.resolve("public", "catalog", "shoes", product.styleNumber);
  await mkdir(outputDir, { recursive: true });

  for (const [index, sourceUrl] of product.photos.entries()) {
    const response = await fetchWithRetry(sourceUrl, product.referer);
    const input = Buffer.from(await response.arrayBuffer());
    const output = path.join(outputDir, `${String(index + 1).padStart(2, "0")}.webp`);
    await sharp(input, { failOn: "error" })
      .rotate()
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(output);
  }

  const prepared = (await readdir(outputDir)).filter((name) => name.endsWith(".webp"));
  process.stdout.write(`${product.styleNumber}: ${prepared.length} photos prepared\n`);
}
