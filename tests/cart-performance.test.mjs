import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const storefrontPath = new URL("../components/Storefront.tsx", import.meta.url);
const storeRoutePath = new URL("../app/api/store/route.ts", import.meta.url);
const detailPath = new URL("../components/ProductDetailExperience.tsx", import.meta.url);
const adminRoutePath = new URL("../app/api/admin/route.ts", import.meta.url);
const adminDashboardPath = new URL("../components/AdminDashboard.tsx", import.meta.url);
const liveAssistantPath = new URL("../components/LiveAssistant.tsx", import.meta.url);

test("장바구니 추가 중에는 선택한 상품 버튼만 비활성화한다", async () => {
  const source = await readFile(storefrontPath, "utf8");
  assert.match(source, /cartBusyProductIds\.has\(Number\(product\.id\)\)/);
  assert.match(source, /setCartBusyProductIds\(\(current\) => new Set\(current\)\.add\(cartProductId\)\)/);
  assert.match(source, /cartBusyProductIds\.has\(Number\(product\.id\)\) \? "담는 중…"/);
});

test("장바구니 추가 응답은 쇼핑몰 전체 자료 대신 변경된 항목만 반환한다", async () => {
  const route = await readFile(storeRoutePath, "utf8");
  const addStart = route.indexOf('if (payload.action === "cart.add")');
  const updateStart = route.indexOf('} else if (payload.action === "cart.update")');
  const addBlock = route.slice(addStart, updateStart);
  assert.match(addBlock, /partial: "cart\.add"/);
  assert.match(addBlock, /cartItem:/);
  assert.doesNotMatch(addBlock, /getStorePayload\(/);
});

test("상품 상세의 바로구매는 부분 응답의 장바구니 항목을 사용한다", async () => {
  const source = await readFile(detailPath, "utf8");
  assert.match(source, /payload\.partial === "cart\.add"\s*\? payload\.cartItem/);
  assert.match(source, /setCartCount\(Number\(payload\.cartCount \|\| 0\)\)/);
});

test("방송 보조창은 관리자 전체 자료가 아닌 방송 전용 상태만 조회한다", async () => {
  const source = await readFile(liveAssistantPath, "utf8");
  assert.match(source, /`\/api\/live-state/);
  assert.match(source, /\/api\/store\?scope=live-assistant/);
  assert.doesNotMatch(source, /fetch\("\/api\/admin", \{ cache: "no-store" \}\)/);
});

test("관리자 변경 응답은 작업 기능 범위만 다시 조회하고 병합한다", async () => {
  const route = await readFile(adminRoutePath, "utf8");
  const dashboard = await readFile(adminDashboardPath, "utf8");
  assert.match(route, /getAdminPayload\(admin, permission\)/);
  assert.match(route, /const need = \(\.\.\.values: string\[\]\) => !scope \|\| values\.includes\(scope\)/);
  assert.match(dashboard, /fieldsByScope/);
  assert.match(dashboard, /next\.settings = \{ \.\.\.current\.settings, \.\.\.\(payload\.settings \|\| \{\}\) \}/);
});
