import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("채널 관리는 마이페이지와 분리된 전용 화면을 사용한다", async () => {
  const [page, studio, store] = await Promise.all([
    read("app/my-channel/page.tsx"), read("components/MemberChannelStudio.tsx"), read("components/Storefront.tsx"),
  ]);
  assert.match(page, /MemberChannelStudio/);
  assert.match(store, /href="\/my-channel"/);
  assert.match(store, /channel-owner-menu/);
  assert.match(store, /내 채널 관리/);
  assert.match(store, /채널 신청/);
  assert.match(store, /채널 관리/);
  assert.match(store, /channelAccountMenuLabel/);
  assert.match(store, /큰 채널 관리 화면으로 이동/);
  assert.doesNotMatch(studio, /className="channel-studio-header"/);
  assert.match(studio, /channel-studio-store-header/);
  assert.match(studio, /youtube-main-menu/);
  assert.match(studio, /\/login\?return_to=%2Fmy-channel/);
});

test("승인된 채널 소유자 메뉴는 최고 관리자와 같은 작업 흐름으로 구분한다", async () => {
  const store = await read("components/Storefront.tsx");
  for (const label of ["채널 홈", "기본정보", "생방송", "방송 상품", "다시보기", "쇼츠", "상품·카테고리", "상담", "통계"]) {
    assert.match(store, new RegExp(label));
  }
  assert.match(store, /ownsCurrentChannel/);
  assert.match(store, /Number\(data\.memberChannel\?\.id/);
});

test("모바일에서는 복잡한 방송 편집을 제공하지 않는다", async () => {
  const [studio, css] = await Promise.all([read("components/MemberChannelStudio.tsx"), read("app/globals.css")]);
  assert.match(studio, /PC에서만 제공/);
  assert.match(css, /@media\(max-width:760px\).*\.channel-studio-desktop\{display:none\}/s);
});

test("채널 관리 메뉴는 채널 상단에서 일반 메뉴 크기로 표시된다", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /youtube-main-menu a\.channel-owner-menu[\s\S]*min-height:\s*30px/);
  assert.match(css, /channel-studio-store-header/);
  assert.match(css, /member-channel-account-summary/);
});

test("채널 카테고리는 회원 직접 적용이 아니라 관리자 승인을 거친다", async () => {
  const [storeApi, adminApi, adminUi] = await Promise.all([
    read("app/api/store/route.ts"), read("app/api/admin/route.ts"), read("components/AdminDashboard.tsx"),
  ]);
  assert.match(storeApi, /channel\.category\.request/);
  assert.match(storeApi, /member_category_requests/);
  assert.match(adminApi, /channel\.category\.request\.review/);
  assert.match(adminApi, /category_settings = \?, broadcast_settings = \?/);
  assert.match(adminUi, /카테고리 변경 요청/);
});

test("회원 채널은 관리자와 같은 방송 운영 메뉴와 소유자 전용 보조창을 제공한다", async () => {
  const [store, storeApi, assistant] = await Promise.all([
    read("components/Storefront.tsx"), read("app/api/store/route.ts"), read("components/LiveAssistant.tsx"),
  ]);
  assert.match(store, /방송 상품과 번호표/);
  assert.match(store, /상품 시간표/);
  assert.match(store, /방송 진행 보조창/);
  assert.match(store, /\/my-channel\/live-assistant/);
  assert.match(storeApi, /channel\.live\.quickProduct/);
  assert.match(storeApi, /owner_member_id = \?/);
  assert.match(assistant, /memberMode/);
});

test("회원 채널 관리는 최고 관리자와 같은 편집 컴포넌트를 재사용한다", async () => {
  const [studio, dashboard, imageRoute] = await Promise.all([
    read("components/MemberChannelStudio.tsx"),
    read("components/AdminDashboard.tsx"),
    read("app/api/channel-image/route.ts"),
  ]);
  assert.match(studio, /ChannelManager/);
  assert.match(studio, /LiveCommerceSettings/);
  assert.match(studio, /assistantBasePath="\/my-channel\/live-assistant"/);
  assert.match(dashboard, /export function ChannelManager/);
  assert.match(dashboard, /export function LiveCommerceSettings/);
  assert.match(imageRoute, /owner_member_id = \?/);
});

test("이미 공개된 회원 채널에는 공개 검토를 다시 요청하지 않는다", async () => {
  const studio = await read("components/MemberChannelStudio.tsx");
  assert.match(studio, /channel\.application_status === "published"/);
  assert.match(studio, /현재 운영 중/);
  assert.match(studio, /운영 채널 보기/);
  assert.match(studio, /channel\.application_status === "publication_review"/);
});

test("회원 채널 관리는 채널 메뉴 안에 통합되고 선택 메뉴가 선명하게 표시된다", async () => {
  const [studio, css] = await Promise.all([
    read("components/MemberChannelStudio.tsx"),
    read("app/globals.css"),
  ]);
  assert.doesNotMatch(studio, /className="channel-studio-header"/);
  assert.match(studio, /channel-owner-menu active/);
  assert.match(css, /channel-owner-menu\.active[\s\S]*color:\s*#fff/);
  assert.match(css, /channel-studio-embedded \.channel-studio-desktop[\s\S]*background:\s*transparent/);
  assert.match(css, /member-shared-admin-tabs button\.active[\s\S]*background:\s*#102846[\s\S]*color:\s*#fff/);
  assert.match(css, /youtube-main-menu a\.channel-owner-menu[\s\S]*min-height:\s*30px/);
});

test("supervisor channel management entry is server-authorized", async () => {
  const [store, storeApi] = await Promise.all([
    read("components/Storefront.tsx"),
    read("app/api/store/route.ts"),
  ]);
  assert.match(storeApi, /adminAccess: admin\?\.isSupervisor/);
  assert.match(storeApi, /channelManagementHref: "\/admin"/);
  assert.match(store, /canSuperviseCurrentChannel/);
  assert.match(store, /최고 관리자 채널 관리/);
  assert.match(store, /ownsCurrentChannel \? "\/my-channel"/);
});

test("member channel studio uses the same upper header structure as the public channel", async () => {
  const studio = await read("components/MemberChannelStudio.tsx");
  assert.match(studio, /member-ribbon/);
  assert.match(studio, /YOUTUBE LIVE SHOP/);
  assert.match(studio, /\/?account=orders/);
  assert.match(studio, /\/?cart=1/);
  assert.match(studio, /action: "logout"/);
  assert.match(studio, /point-pill/);
  assert.doesNotMatch(studio, /#other-channels/);
});
