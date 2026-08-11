import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const memberAuth = readFileSync(new URL("../lib/member-auth.ts", import.meta.url), "utf8");
const memberRoute = readFileSync(new URL("../app/api/member-auth/route.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const rewards = readFileSync(new URL("../lib/rewards.ts", import.meta.url), "utf8");
const payments = readFileSync(new URL("../lib/payments.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("new members start at zero and must accept terms and privacy", () => {
  assert.doesNotMatch(memberAuth, /startingPoints = 50_000/);
  assert.doesNotMatch(data, /startingPoints = 50000/);
  assert.match(memberAuth, /VALUES \(\?, \?, 'member', 'active', 0, 0, 0/);
  assert.match(memberRoute, /termsAccepted: body\.termsAccepted === true/);
  assert.match(memberRoute, /privacyAccepted: body\.privacyAccepted === true/);
});

test("administrator grants go to spendable reward balance, never prepaid balance", () => {
  const pointAction = admin.slice(admin.indexOf('action === "member.point"'), admin.indexOf('action === "member.status"'));
  assert.match(pointAction, /reward_points = reward_points \+ \?/);
  assert.doesNotMatch(pointAction, /charge_points = charge_points \+ \?/);
});

test("prepaid endpoints are closed and stale sample prepaid data is removed", () => {
  assert.match(store, /finance\.create[\s\S]*jsonError\([^)]*, 410\)/s);
  assert.match(data, /prepaid_cleanup_version[\s\S]*'2'/s);
  assert.match(data, /UPDATE members SET points = MAX\(0, reward_points\), charge_points = 0/);
});

test("reward policies support off, zero amounts, idempotency, and expiration", () => {
  assert.match(rewards, /enabled: values\.referral_enabled !== "false"/);
  assert.match(rewards, /value === undefined \|\| value === null \|\| value === ""/);
  assert.match(rewards, /status = 'expired'/);
  assert.match(rewards, /if \(!Number\(claimed\.meta\.changes/);
});

test("orders guard duplicate submissions and concurrent balance reservations", () => {
  assert.match(store, /idempotencyKey/);
  assert.match(data, /orders_reward_reservation_guard/);
  assert.match(data, /orders_charge_reservation_guard/);
  assert.match(data, /products_stock_nonnegative/);
});

test("expiration and user cancellation restore stock, option stock, and coupons", () => {
  assert.match(payments, /variants_json/);
  assert.match(payments, /UPDATE coupons SET status = '보관'/);
  assert.match(store, /order\.cancel\.request/);
  assert.match(store, /variantRestores/);
});

test("V2 canonical metadata and local system fonts avoid V1 links and font asset 404s", () => {
  assert.match(layout, /reward-point-mall-v2\.qldrh1990\.chatgpt\.site/);
  assert.doesNotMatch(layout, /next\/font/);
  assert.doesNotMatch(layout, /member-point-mall\.qldrh1990/);
});
