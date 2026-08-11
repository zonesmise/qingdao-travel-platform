import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");

test("mobile administrator menus use a visible horizontal rail", () => {
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.admin-sidebar nav \{[^}]*flex-direction: row;[^}]*overflow-x: auto;[^}]*overflow-y: hidden;/);
  assert.match(css, /\.admin-shell \{ display: block; padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(css, /\.admin-sidebar nav button \{[^}]*flex:0 0 76px;/);
});

test("the top notification opens the pending order list", () => {
  assert.match(dashboard, /className="notification"[\s\S]*?openSection\("orders"\);[\s\S]*?setQuery\(data\.summary\.pendingOrders > 0 \? "__pending__" : ""\);/);
  assert.match(dashboard, /\["결제확인대기", "접수", "취소요청"\]/);
  assert.match(dashboard, /data\.summary\.pendingOrders > 0 && <b>\{data\.summary\.pendingOrders\}<\/b>/);
  assert.match(dashboard, /신규 주문 \$\{data\.summary\.pendingOrders\}건 보기/);
});
