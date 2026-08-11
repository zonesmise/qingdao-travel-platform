import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const rewards = readFileSync(new URL("../lib/rewards.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");

test("reward balances are separated from refundable charge points", () => {
  assert.match(data, /charge_points INTEGER DEFAULT 0/);
  assert.match(data, /reward_points INTEGER DEFAULT 0/);
  assert.match(data, /pending_reward_points INTEGER DEFAULT 0/);
  assert.match(store, /reward_points = reward_points - \?/);
  assert.match(storefront, /현금환급·양도 불가/);
});

test("referrals keep the original policy and wait through the return window", () => {
  assert.match(rewards, /policy_json/);
  assert.match(rewards, /holdDays \* 86400000/);
  assert.match(rewards, /referral_monthly_cap/);
  assert.match(rewards, /revokeReferralOrderRewards/);
});

test("member and admin surfaces use the existing panel and table systems", () => {
  assert.match(storefront, /MY REWARD CENTER/);
  assert.match(storefront, /추천회원 진행상태/);
  assert.match(admin, /추천 보상조건/);
  assert.match(admin, /의심 추천 검토/);
});
