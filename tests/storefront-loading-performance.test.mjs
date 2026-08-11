import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public storefront reads avoid seed/import work and per-product review queries", async () => {
  const dataSource = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
  const catalogQuerySource = await readFile(new URL("../lib/catalog-query.ts", import.meta.url), "utf8");
  const storeSource = await readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  const publicCatalogBody = dataSource.split("export async function getPublicCatalog(")[1].split("export async function getPublicChannel")[0];
  const storeGetBody = storeSource.split("export async function GET(request: Request)")[1].split("export async function POST(request: Request)")[0];

  assert.doesNotMatch(publicCatalogBody, /ensureSeedData\s*\(/);
  assert.doesNotMatch(storeGetBody, /ensureSeedData\s*\(/);
  assert.match(catalogQuerySource, /GROUP BY product_id/);
  assert.doesNotMatch(publicCatalogBody, /SELECT p\.\*/);
  assert.match(publicCatalogBody, /PRODUCT_CATALOG_INDEX_COLUMNS/);
  assert.match(publicCatalogBody, /fullProductsByIds/);
  assert.match(pageSource, /getPublicCatalog\(\)/);
  assert.match(pageSource, /skipCatalog: true/);
});

test("product images default to deferred decoding and loading", async () => {
  const source = await readFile(new URL("../components/SafeProductImage.tsx", import.meta.url), "utf8");
  assert.match(source, /loading=\{props\.loading \?\? "lazy"\}/);
  assert.match(source, /decoding=\{props\.decoding \?\? "async"\}/);
});

test("public channel pages do not load the full mall catalog before rendering", async () => {
  const dataSource = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
  const channelPage = await readFile(new URL("../app/channel/[slug]/page.tsx", import.meta.url), "utf8");
  const storeSource = await readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
  const publicChannelBody = dataSource.split("export async function getPublicChannel")[1].split("export async function getPublicProductChannelContext")[0];

  assert.doesNotMatch(channelPage, /getPublicCatalog/);
  assert.match(channelPage, /skipCatalog: true/);
  assert.match(channelPage, /guestChannelShell/);
  assert.doesNotMatch(publicChannelBody, /SELECT p\.\*/);
  assert.match(publicChannelBody, /PRODUCT_CATALOG_INDEX_COLUMNS/);
  assert.match(publicChannelBody, /fullProductsByIds/);
  assert.match(publicChannelBody, /const channelProducts = allChannelCandidates\.filter/);
  assert.match(publicChannelBody, /options\.trackView !== false/);
  assert.match(storeSource, /options\.skipCatalog/);
});

test("catalog navigation requests only the requested page and does not inflate channel views", async () => {
  const route = await readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8");
  const storefront = await readFile(new URL("../components/Storefront.tsx", import.meta.url), "utf8");

  assert.match(route, /includeHomeProducts: false/);
  assert.match(route, /trackView: false/);
  assert.match(route, /stale-while-revalidate=60/);
  assert.match(storefront, /\/api\/catalog/);
  assert.match(storefront, /payload\.catalog\?\.items/);
  assert.match(storefront, /catalog\?\.total/);
});
