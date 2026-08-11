import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  {
    styleNumber: "1027382",
    referer: "https://www.birkenstock.com/jp/boston-eva/boston-eva-eva-0-eva-u_1631.html",
    photos: [
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dwdc642a16/1027381/1027381.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dw30aa9af5/1027381/1027381_side.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dwd1163cb9/1027381/1027381_top.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dw2bb7fb48/1027381/1027381_sole.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dw6e2d9790/1027381/1027381_detail-1.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dwdd922ada/1027381/1027381_pair.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dw78d5e305/1027381/1027381_f_look_f.jpg?sw=1148&sh=1148&sm=fit&q=80",
      "https://www.birkenstock.com/dw/image/v2/BLTQ_PRD/on/demandware.static/-/Sites-master-catalog-apac/default/dwf3e2b9de/1027381/1027381_f_closeup_f.jpg?sw=1148&sh=1148&sm=fit&q=80",
    ],
  },
  {
    styleNumber: "1027386",
    referer: "https://www.birkenstock.com.tr/erkek-kahverengi-kapali-terlik-plaj-grubu-1027386/",
    photos: [
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154902/1aeb941a-443c-40f4-9ae1-7469e6d2c420_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154902/9432b95a-395e-4137-b1a8-f72330068787_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154902/f6341bc9-8695-46d8-a19a-3c901321258f_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154907/43e633c8-b158-4a17-9fab-30047da1c313_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154907/9238c277-9e7a-494e-9146-02d6a0689cae_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154907/beb3d50c-d62a-49a2-a520-5cc877c71930_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154908/b9d09c2a-a6b8-47e3-bf5d-a0b67703d611_size1024x1024_cropCenter.jpg",
      "https://23604e.cdn.akinoncloud.com/products/2024/05/14/154908/ccae8b7d-50ec-4e5a-9326-988b977ed531_size1024x1024_cropCenter.jpg",
    ],
  },
];

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
  if (prepared.length !== product.photos.length) {
    throw new Error(`${product.styleNumber}: expected ${product.photos.length}, got ${prepared.length}`);
  }
  process.stdout.write(`${product.styleNumber}: ${prepared.length} official photos prepared\n`);
}
