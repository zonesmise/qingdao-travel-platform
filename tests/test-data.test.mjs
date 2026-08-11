import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(new URL("../lib/test-data.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");

test("test data covers realistic member and commerce stages", () => {
  assert.match(seed, /testMembers = \[/);
  assert.match(seed, /index < testMembers\.length/);
  assert.match(seed, /@reward-v2\.test/);
  for (const scenario of ["7일 연속 출석", "무통장입금 대기", "카카오톡 송금 대기", "배송중", "배송완료·후기 작성", "주문 취소", "반품완료", "추천 보상 지급 대기", "추천 보상 지급 완료", "의심 추천 검토"]) {
    assert.match(seed, new RegExp(scenario));
  }
  assert.match(seed, /attendance_records/);
  assert.match(seed, /finance_requests/);
  assert.match(seed, /reward_events/);
  assert.match(seed, /referral_flags/);
  assert.match(seed, /테스트 데이터: 공개 상품후기에서 숨김/);
});

test("test records are isolated and can be safely reset", () => {
  assert.match(data, /CREATE TABLE IF NOT EXISTS test_data_members/);
  assert.match(seed, /DELETE FROM members WHERE id IN \(SELECT member_id FROM test_data_members\)/);
  assert.match(seed, /DELETE FROM orders WHERE member_id IN \(SELECT member_id FROM test_data_members\)/);
  assert.match(seed, /DELETE FROM test_data_members/);
  assert.match(admin, /test_data\.seed/);
  assert.match(admin, /test_data\.reset/);
  assert.match(admin, /슈퍼바이저만 테스트 데이터를 관리/);
});

test("admin identifies scenarios and exposes reset controls", () => {
  assert.match(admin, /test_scenario/);
  assert.match(dashboard, /test-badge/);
  assert.match(dashboard, /테스트 데이터 다시 만들기/);
  assert.match(dashboard, /테스트 데이터 모두 삭제/);
  assert.match(dashboard, /test01@reward-v2\.test ~ test15@reward-v2\.test/);
});
