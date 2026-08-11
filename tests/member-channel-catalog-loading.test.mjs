import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const studio = await readFile(new URL("components/MemberChannelStudio.tsx", root), "utf8");
const storeApi = await readFile(new URL("app/api/store/route.ts", root), "utf8");
const dashboard = await readFile(new URL("components/AdminDashboard.tsx", root), "utf8");

test("member catalog loads the complete lightweight product index only on demand", () => {
  assert.match(studio, /workspaceTab !== "catalog"/);
  assert.match(studio, /\/api\/store\?scope=channel-catalog/);
  assert.match(studio, /catalogProducts[\s\S]{0,80}<ChannelManager/);
  assert.match(storeApi, /scope"\) === "channel-catalog"/);
  assert.match(storeApi, /WHERE p\.status = 'active'/);
  assert.match(storeApi, /partial: "channel-catalog"/);
});

test("both channel managers count only customer-visible active products", () => {
  assert.match(dashboard, /const availableProducts = products\.filter\(\(product\) => product\.status === "active"\)/);
  assert.match(dashboard, /inferChannelBrandRuleCategory\(entry, channelCategoryRows, availableProducts/);
  assert.match(dashboard, /return availableProducts\.filter/);
});

test("catalog scope is authenticated and returns only compact management fields", () => {
  assert.match(storeApi, /if \(!nativeSession\) return jsonError\("로그인이 필요합니다\.", 401\)/);
  assert.match(storeApi, /SELECT p\.id, p\.name, p\.category, p\.brand, p\.product_code, p\.style_number,/);
  assert.doesNotMatch(
    storeApi.match(/if \(url\.searchParams\.get\("scope"\) === "channel-catalog"\)[\s\S]*?return storeResponse\([\s\S]*?\n    \}/)?.[0] || "",
    /p\.description|p\.details|p\.variants_json/,
  );
});
