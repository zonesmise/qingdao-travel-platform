import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("public", "catalog");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) files.push(fullPath);
  }
  return files;
}

const files = await walk(root);
let before = 0;
let after = 0;
let optimized = 0;

for (const [index, file] of files.entries()) {
  const originalSize = (await stat(file)).size;
  before += originalSize;
  const input = await readFile(file);
  const output = await sharp(input, { failOn: "error" })
    .rotate()
    .resize(720, 720, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 64, effort: 5 })
    .toBuffer();

  if (output.length < originalSize) {
    const temporary = `${file}.optimized`;
    await writeFile(temporary, output);
    await rename(temporary, file);
    after += output.length;
    optimized += 1;
  } else {
    after += originalSize;
  }

  if ((index + 1) % 250 === 0 || index + 1 === files.length) {
    process.stdout.write(`${index + 1}/${files.length} images checked\n`);
  }
}

process.stdout.write(`optimized ${optimized} images: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB\n`);
