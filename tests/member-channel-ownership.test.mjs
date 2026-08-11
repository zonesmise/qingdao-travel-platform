import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("member channels have an owner and an approval lifecycle", () => {
  const schema = read("db/schema.ts");
  const migration = read("drizzle/0019_channel_member_ownership.sql");
  for (const field of ["ownerMemberId", "applicationStatus", "adminReviewNote", "publicationRequestedAt", "publishedAt"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(schema, /sales_channels_owner_member_unique/);
  assert.match(migration, /owner_member_id/);
  assert.match(migration, /application_status/);
});

test("three preview channels are assigned to separate sample members", () => {
  const migration = read("drizzle/0020_assign_sample_channel_owners.sql");
  for (const login of ["sample01", "sample02", "sample03"]) assert.match(migration, new RegExp(login));
  for (const slug of ["preview-shoes", "preview-style", "preview-life"]) assert.match(migration, new RegExp(slug));
  assert.match(migration, /owner_member_id/);
  assert.match(migration, /'member', 'active'/);
});

test("admin channel creation searches active members and saves one owner per channel", () => {
  const adminRoute = read("app/api/admin/route.ts");
  const dashboard = read("components/AdminDashboard.tsx");
  assert.match(adminRoute, /channelOwnerCandidates/);
  assert.match(adminRoute, /LEFT JOIN sales_channels c ON c\.owner_member_id = m\.id/);
  assert.match(adminRoute, /ownerMemberId/);
  assert.match(adminRoute, /이미 .* 채널을 운영하고 있습니다/);
  assert.match(adminRoute, /owner_member_id = \?/);
  assert.match(dashboard, /회원 아이디\(이메일\) 또는 이름 검색/);
  assert.match(dashboard, /한 회원은 하나의 채널만 운영할 수 있습니다/);
  assert.match(dashboard, /ownerMemberId: draft\.owner_member_id/);
  assert.match(dashboard, /회원아이디 \$\{channel\.owner_member_email\}/);
});

test("member channel mutations are limited to the signed-in member owner", () => {
  const route = read("app/api/store/route.ts");
  assert.match(route, /action === "channel\.apply"/);
  assert.match(route, /action === "channel\.member\.save"/);
  assert.match(route, /action === "channel\.publication\.request"/);
  assert.match(route, /WHERE owner_member_id = \?/);
  assert.doesNotMatch(route, /channel\.member\.save[\s\S]{0,2500}status\s*=\s*'active'/);
});

test("only the supervisor can approve and publish member channels", () => {
  const admin = read("app/api/admin/route.ts");
  assert.match(admin, /action === "channel\.application\.review"/);
  assert.match(admin, /if \(!admin\.isSupervisor\)/);
  assert.match(admin, /decision === "publish"/);
  assert.match(admin, /application_status = 'published', status = 'active'/);
});

test("mypage and admin expose separate channel work areas", () => {
  const storefront = read("components/Storefront.tsx");
  const dashboard = read("components/AdminDashboard.tsx");
  assert.match(storefront, /내 방송 채널/);
  assert.match(storefront, /채널 개설 신청하기/);
  assert.match(storefront, /공개 검수 요청/);
  assert.match(storefront, /방송 상품과 번호표/);
  assert.match(storefront, /다시보기 관리/);
  assert.match(storefront, /쇼츠/);
  assert.match(storefront, /채널 전용 상담/);
  assert.match(dashboard, /라이브 방송 채널 신청 상황/);
  assert.match(dashboard, /최종 공개/);
});

test("admin separates channel applications from approved channel management", () => {
  const dashboard = read("components/AdminDashboard.tsx");
  assert.match(dashboard, /라이브 방송 신청 상황/);
  assert.match(dashboard, /라이브 방송 채널 관리/);
  assert.match(dashboard, /\["pending", "revision_requested", "rejected"\]/);
  assert.match(dashboard, /\["admin_created", "approved", "publication_review", "published", "suspended"\]/);
  assert.match(dashboard, /live-channel-card-grid">\{managedChannels\.map/);
  assert.match(dashboard, /승인된 채널은 채널 관리로 이동합니다/);
});

test("member channel product and media settings are validated on the server", () => {
  const route = read("app/api/store/route.ts");
  assert.match(route, /SELECT id FROM products WHERE status = 'active'/);
  assert.match(route, /DELETE FROM sales_channel_products WHERE channel_id = \?/);
  assert.match(route, /youtube_replays/);
  assert.match(route, /youtube_shorts/);
  assert.match(route, /contact_settings = \?/);
});
