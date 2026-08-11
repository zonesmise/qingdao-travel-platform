import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");
const payments = readFileSync(new URL("../lib/payments.ts", import.meta.url), "utf8");

test("checkout supports points, bank transfer, KakaoTalk transfer, and mixed payment", () => {
  assert.match(store, /paymentMethod = isPointOnly \? "points" : pointUse > 0 \? "mixed" : "cash"/);
  assert.match(store, /cashPaymentChannel/);
  assert.match(store, /point_reservation_status/);
  assert.match(storefront, /무통장입금/);
  assert.match(storefront, /카카오톡 송금/);
  assert.match(storefront, /자동 결제가 아닙니다/);
  assert.match(storefront, /사용할 리워드/);
  assert.match(storefront, /리워드 \+ \$\{cashChannelLabel\}/);
  assert.doesNotMatch(storefront, /\["finance", "충전·환급"\]/);
  assert.doesNotMatch(storefront, /리워드 충전·환급 신청/);
});

test("cash checkout remains available without a prepaid top-up menu", () => {
  const guide = readFileSync(new URL("../app/guide/page.tsx", import.meta.url), "utf8");
  assert.match(guide, /미리 현금을 충전할 필요가 없습니다/);
  assert.match(guide, /리워드 사용 후 남은 금액/);
  assert.match(guide, /실제 결제한 현금/);
  assert.doesNotMatch(admin, /\["finance", "↕", "충전·환급"\]/);
});

test("reserved points are captured only after admin payment confirmation", () => {
  assert.match(admin, /order\.payment_confirm/);
  assert.match(admin, /payment_status = 'confirmed'/);
  assert.match(admin, /point_reservation_status = 'captured'/);
  assert.match(payments, /point_reservation_status = 'released'/);
  assert.match(payments, /awaiting_cash/);
});

test("product payment policy is configured inside the existing editor", () => {
  assert.match(editor, /리워드 사용 범위/);
  assert.match(editor, /리워드 최대 사용률/);
  assert.match(editor, /현금 결제 가능/);
  assert.match(editor, /1~99%/);
  assert.match(admin, /product\.bulk_payment_policy/);
  assert.match(admin, /pointUsageMode !== "full" \|\| pointMaxPercent !== 100/);
  assert.match(storefront, /리워드 사용 불가 · 현금 결제/);
});

test("server enforces product point policy for disabled, below-50, and full-use modes", () => {
  assert.match(admin, /pointUsageMode === "none"[\s\S]*?\? 0/);
  assert.match(admin, /Math\.max\(1, Math\.min\(99/);
  assert.match(store, /pointUse > maxPointUse/);
  assert.match(store, /cashAmount > 0 && !cashAllowed/);
});

test("purchase rewards use the configured cash-only basis and are reversed on returns", () => {
  assert.match(store, /reward_on_cash_only/);
  assert.match(store, /rewardEligibleAmount/);
  assert.match(store, /purchaseRewardPoints/);
  assert.match(admin, /creditPurchaseReward/);
  assert.match(admin, /구매적립회수/);
});

test("legacy total points are reconciled into spendable reward points", () => {
  const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0006_rare_magneto.sql", import.meta.url), "utf8");
  assert.match(data, /points > charge_points \+ reward_points/);
  assert.match(migration, /reward_points.*points.*charge_points/s);
});
