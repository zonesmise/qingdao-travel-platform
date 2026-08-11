import { readFile, writeFile } from "node:fs/promises";

const SOURCE = "work/incoming/2차 미등록_품번_목록.txt";
const OUTPUT = "work/results/kickscrew-pending-2026-08-11.json";
const API = "https://reward-point-mall-v2.qldrh1990.chatgpt.site/api/catalog";

const normalize = (value) => String(value || "").trim().toUpperCase();
const validSku = (value) => /^[A-Z0-9][A-Z0-9._/-]{2,39}$/i.test(value);

const raw = await readFile(SOURCE, "utf8");
const source = [...new Set(raw
  .split(/\r?\n/)
  .map((line) => normalize(line.split(/\s+/)[0]))
  .filter(validSku))];

const registered = new Set();
let page = 1;
let total = Infinity;
while (registered.size < total) {
  const response = await fetch(`${API}?page=${page}&limit=48`);
  if (!response.ok) throw new Error(`Catalog page ${page}: ${response.status}`);
  const payload = await response.json();
  const catalog = payload?.catalog || {};
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  total = Number(catalog.total || 0);
  for (const item of items) {
    const sku = normalize(item.style_number);
    if (sku) registered.add(sku);
  }
  if (!items.length || page > Math.ceil(total / 48) + 1) break;
  page += 1;
}

const pending = source.filter((sku) => !registered.has(sku));
await writeFile(OUTPUT, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  rule: "KICKS CREW first search result detail page must contain exact style number; otherwise skip",
  sourceCount: source.length,
  registeredCount: registered.size,
  pendingCount: pending.length,
  pending,
  processed: [],
}, null, 2)}\n`);

console.log(JSON.stringify({ source: source.length, registered: registered.size, pending: pending.length, output: OUTPUT }));
