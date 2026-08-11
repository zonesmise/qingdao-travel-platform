import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Qingdao platform exposes separate travel, planner, guide, store, rewards, and account routes", async () => {
  const shell = await read("components/QingdaoShell.tsx");
  for (const route of ["travel", "planner", "guide", "store", "rewards", "my"]) {
    await read(`app/qingdao/${route}/page.tsx`);
  }
  for (const route of ["travel", "planner", "guide", "store", "rewards"]) {
    assert.match(shell, new RegExp(`/qingdao/${route}`));
  }
});

test("the public root opens the travel platform and shopping stays a menu", async () => {
  const [root, shell, styles] = await Promise.all([read("app/page.tsx"), read("components/QingdaoShell.tsx"), read("app/qingdao/qingdao.css")]);
  assert.match(root, /from "\.\/qingdao\/page"/);
  assert.match(shell, />쇼핑<\/a>/);
  assert.doesNotMatch(shell, /TRAVEL & REWARD/);
  assert.match(styles, /width:1200px/);
  assert.match(styles, /max-width:calc\(100vw - 24px\)/);
});

test("Qingdao shopping is an internal travel-platform page using real member data", async () => {
  const [storePage, data] = await Promise.all([read("app/qingdao/store/page.tsx"), read("lib/qingdao-data.ts")]);
  assert.match(storePage, /<QingdaoPage/);
  assert.match(storePage, /\/products\/\$\{product\.id\}/);
  assert.match(storePage, /장바구니/);
  assert.match(data, /getPublicCatalog/);
  assert.match(data, /getNativeMemberSessionFromHeaders/);
  assert.match(data, /getStorePayload/);
});

test("reference-led home stacks the complete travel service vertically", async () => {
  const home = await read("app/qingdao/page.tsx");
  assert.match(home, /칭다오, 당신만의/);
  assert.match(home, /완벽하게/);
  assert.match(home, /인기 관광지/);
  assert.match(home, /현지 인기 가이드/);
  assert.match(home, /여행자 스토어/);
  assert.match(home, /여행 후기 이벤트/);
  assert.match(home, /실시간 안전 알림/);
});

test("planner separates recommendations from direct editing and shares one result flow", async () => {
  const planner = await read("app/qingdao/planner/page.tsx");
  assert.match(planner, /추천받기/);
  assert.match(planner, /직접 만들기/);
  assert.match(planner, /AI 추천 일정 구성/);
  assert.match(planner, /내 일정에 추가/);
  assert.match(planner, /지도 확인/);
  assert.match(planner, /일정 저장 & 상담/);
  assert.match(planner, /draggable/);
  assert.match(planner, /선택한 \{checkedIds\.length\}곳 일정에 추가/);
  assert.match(planner, /dropOnPlan/);
  assert.match(planner, /차량·공항 이동 서비스/);
  assert.match(planner, /공항 픽업/);
  assert.match(planner, /공항 환송/);
  assert.match(planner, /높은 가격순/);
  assert.match(planner, /business-sedan/);
  assert.match(planner, /standard-van/);
});
