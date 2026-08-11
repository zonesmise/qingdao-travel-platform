import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storeRoute = fs.readFileSync(
  new URL("../app/api/store/route.ts", import.meta.url),
  "utf8",
);
const storefront = fs.readFileSync(
  new URL("../components/Storefront.tsx", import.meta.url),
  "utf8",
);
const schema = fs.readFileSync(
  new URL("../db/schema.ts", import.meta.url),
  "utf8",
);
const data = fs.readFileSync(
  new URL("../lib/data.ts", import.meta.url),
  "utf8",
);

test("a dismissed popup stays closed for the same member and popup", () => {
  assert.match(storefront, /point-mall-popup-dismissed-v2:\$\{data\.member\.id\}:\$\{popup\.id\}:\$\{popupVersion\}/);
  assert.match(storefront, /window\.localStorage\.setItem\(key, "1"\)/);
  assert.match(storefront, /setPopupOpen\(window\.localStorage\.getItem\(key\) !== "1"\)/);
});

test("daily attendance is durable and can only be awarded once per Korean day", () => {
  assert.match(schema, /attendanceRecords/);
  assert.match(schema, /attendance_records_member_date_unique/);
  assert.match(data, /CREATE TABLE IF NOT EXISTS attendance_records/);
  assert.match(storeRoute, /timeZone: "Asia\/Seoul"/);
  assert.match(storeRoute, /payload\.action === "attendance\.check"/);
  assert.match(storeRoute, /SELECT \?, \?, '출석적립'.*FROM members WHERE id = \?/s);
});

test("earned review and attendance points share the member point ledger", () => {
  assert.match(storeRoute, /SELECT \?, \?, '후기적립'.*FROM members WHERE id = \?/s);
  assert.match(storeRoute, /SUM\(CASE WHEN amount > 0 THEN amount ELSE 0 END\)/);
  assert.match(storefront, /총 적립/);
  assert.match(storefront, /pointFilter === "earn"/);
});
