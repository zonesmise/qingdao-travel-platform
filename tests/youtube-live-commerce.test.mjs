import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const defaults = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const replayAnalysis = readFileSync(new URL("../app/api/youtube-replay-analysis/route.ts", import.meta.url), "utf8");
const aiConfig = readFileSync(new URL("../app/api/ai-config/route.ts", import.meta.url), "utf8");
const adminLogin = readFileSync(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8");
const memberLogin = readFileSync(new URL("../components/MemberAuthForm.tsx", import.meta.url), "utf8");
const memberAuthApi = readFileSync(new URL("../app/api/member-auth/route.ts", import.meta.url), "utf8");
const liveStateApi = readFileSync(new URL("../app/api/live-state/route.ts", import.meta.url), "utf8");

test("youtube skin keeps live, replay, Shorts and products on one home", () => {
  assert.match(storefront, /id="youtube-live"/);
  assert.match(storefront, /id="youtube-replays"/);
  assert.match(storefront, /id="youtube-shorts"/);
  assert.match(storefront, />상품<\/a>/);
  assert.match(storefront, />라이브<\/a>/);
  assert.match(storefront, />다시보기<\/a>/);
  assert.match(storefront, /영상 시간에 맞춰 소개 상품이 자동으로 바뀝니다/);
});

test("a hidden channel never embeds a saved YouTube live URL or chat", () => {
  assert.match(storefront, /isCustomerLiveBroadcastVisible\(settings, liveVideoId\)/);
  assert.match(storefront, /settings\.youtube_live_enabled === "true" && Boolean\(videoId\)/);
  assert.match(storefront, /liveVisible \? liveOrientation === "vertical"/);
  assert.match(storefront, /: <div className="youtube-offline-card">/);
  assert.match(defaults, /youtube_live_enabled: broadcastSettings\.youtube_live_enabled === "true" \? "true" : "false"/);
  assert.match(liveStateApi, /youtube_live_enabled: settings\.youtube_live_enabled === "true" \? "true" : "false"/);
});

test("youtube product categories open from the dedicated product menu", () => {
  assert.match(storefront, /activeYoutubeMenu === "products"/);
  assert.match(storefront, /youtubeProductMenuEnabled/);
  assert.match(storefront, /youtubeCategoriesOpen/);
  assert.match(storefront, /aria-expanded=\{youtubeCategoriesOpen\}/);
  assert.match(storefront, /event\.preventDefault\(\); selectYoutubeMenu\("products"\)/);
  assert.match(storefront, /youtubeProductMenuEnabled && youtubeCategoriesOpen && <div className="youtube-category-strip open">/);
  assert.match(storefront, /\(!isYoutubeSkin \|\| youtubeCategoriesOpen\)/);
  assert.match(storefront, /selectYoutubeMenu\("home"\)/);
  assert.match(storefront, /selectYoutubeCategory/);
});

test("youtube product menu stays active after category choice and follows scroll direction", () => {
  assert.match(storefront, /function selectYoutubeCategory[\s\S]*?setYoutubeProductMenuEnabled\(true\);[\s\S]*?setYoutubeCategoriesOpen\(true\);[\s\S]*?scrollSectionBelowHeader\("products"\)/);
  assert.match(storefront, /const shouldOpen = accumulatedDelta < 0/);
  assert.match(storefront, /Math\.abs\(accumulatedDelta\) < 28/);
  assert.match(storefront, /categoryScrollSuppressedUntilRef\.current = Date\.now\(\) \+ 1400/);
  assert.match(storefront, /categoryScrollSuppressedUntilRef\.current = Date\.now\(\) \+ 320/);
  assert.match(storefront, /if \(activeYoutubeMenu === "products" && youtubeProductMenuEnabled\)/);
  assert.match(storefront, /setYoutubeProductMenuEnabled\(false\);\s*setYoutubeCategoriesOpen\(false\)/);
});

test("mobile bottom navigation is isolated from sticky category repaints", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.mobile-shop-nav \{[\s\S]*?background:#fff;[\s\S]*?transform:translateZ\(0\);[\s\S]*?contain:layout paint style;/);
  assert.doesNotMatch(styles, /\.mobile-shop-nav \{[\s\S]*?backdrop-filter:blur\(16px\)/);
});

test("youtube home navigation returns to the true page start", () => {
  assert.match(storefront, /menu === "home"[\s\S]*?window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(storefront, /event\.preventDefault\(\); selectYoutubeMenu\("home"\)/);
});

test("member and role-specific admin manuals explain the full workflow", () => {
  assert.match(storefront, /처음 가입부터 주문 완료까지/);
  assert.match(storefront, /회원가입·로그인/);
  assert.match(storefront, /후기·취소·반품/);
  assert.match(admin, /최고 관리자\(슈퍼바이저\)/);
  assert.match(admin, /일반 관리자/);
  assert.match(admin, /adminMenuDescriptions/);
  assert.match(admin, /내 권한으로 사용할 수 있는 메뉴 설명/);
});

test("mobile product shortcut opens the menu without jumping to clipped product cards", () => {
  assert.match(storefront, /상품 메뉴 열기 또는 닫기/);
  assert.match(storefront, /aria-controls=\{isYoutubeSkin \? "youtube-product-categories" : undefined\}/);
  assert.match(storefront, /if \(isYoutubeSkin\) \{\s*selectYoutubeMenu\("products"\);\s*return;/);
  assert.doesNotMatch(storefront, /<a href="#products" onClick=\{\(\) => isYoutubeSkin && selectYoutubeMenu\("products"\)\}/);
});

test("footer repeats the editable brand description under the brand name", () => {
  assert.match(storefront, /footer-brand[\s\S]*?s\.brand_tagline \|\| "취향을 선물하는 리워드 셀렉트숍"/);
});

test("replay timeline changes the linked product from YouTube playback time", () => {
  assert.match(storefront, /getCurrentTime/);
  assert.match(storefront, /timelineSeconds\(entry\.time\) <= currentTime/);
  assert.match(storefront, /seekTo/);
  assert.match(storefront, /loadVideoById/);
  assert.match(storefront, /replay\?\.timeline/);
  assert.match(storefront, /replay-experience-\$\{replayOrientation\}/);
  assert.match(storefront, /원하는 상품을 누르면 영상이 해당 장면으로 이동합니다/);
  assert.match(storefront, /지난 방송 다시보기/);
  assert.match(storefront, /pendingSeekRef/);
  assert.match(storefront, /queuedSeconds/);
  assert.match(storefront, /loadYoutubePlayerApi/);
});

test("supervisor credentials stay at the bottom and open directly for editing", () => {
  assert.match(admin, /return left\.role === "supervisor" \? 1 : -1/);
  assert.match(admin, /supervisor-account-row/);
  assert.match(admin, /슈퍼바이저 정보 및 로그인 아이디·비밀번호 수정/);
  assert.match(admin, /정보·로그인 수정/);
  assert.match(admin, /credentialsChanged=1/);
  assert.match(adminLogin, /최고 관리자 아이디·비밀번호가 변경되었습니다/);
  assert.match(defaults, /hashAdminPassword\("admin123456"\)/);
  assert.match(defaults, /verifyAdminPassword\("admin", supervisor\.password_hash\)/);
  assert.match(defaults, /VALUES \('admin', '슈퍼바이저'/);
  assert.match(memberLogin, /이메일 또는 아이디/);
  assert.doesNotMatch(memberLogin, /슈퍼바이저 아이디/);
  assert.match(memberAuthApi, /supervisor\.admin\.isSupervisor/);
  assert.match(memberAuthApi, /createSupervisorMemberSession/);
});

test("each replay supports its own horizontal or vertical layout", () => {
  assert.match(admin, /재방송 화면 비율/);
  assert.match(admin, /가로 재방송 \(16:9\)/);
  assert.match(admin, /세로 재방송 \(9:16\)/);
  assert.match(admin, /orientation: "horizontal"/);
  assert.match(api, /replay\.orientation === "vertical"/);
  assert.match(storefront, /replay-video-frame/);
  assert.match(storefront, /REPLAY · 지금 영상에 나온 상품/);
});

test("admin exposes one tabbed live-commerce menu and hides unfinished replays", () => {
  assert.match(admin, /\["live", "▶", "라이브 커머스"\]/);
  assert.match(admin, /기본 화면/);
  assert.match(admin, /재방송 관리/);
  assert.match(admin, /고객 공개/);
  assert.match(storefront, /replay\?\.completed/);
});

test("replays use one-title-per-row accordions on storefront and admin", () => {
  assert.match(storefront, /replay-accordion/);
  assert.match(storefront, /aria-expanded=\{expanded\}/);
  assert.match(storefront, /setSelectedId\(expanded \? "" : itemId\)/);
  assert.match(storefront, /상품 \{itemTimelineCount\}개/);
  assert.match(admin, /openReplayId/);
  assert.match(admin, /setOpenReplayId\(expanded \? "" : replay\.id\)/);
  assert.match(admin, /방송 제목을 눌러 필요한 재방송 하나만 펼쳐 수정합니다/);
  assert.match(admin, /생방송 설정/);
  assert.match(admin, /방송 번호표/);
});

test("live-commerce settings are durable and permission checked", () => {
  assert.match(defaults, /storefront_skin: "general"/);
  assert.match(defaults, /youtube_live_orientation: "horizontal"/);
  assert.match(api, /action === "live\.save"/);
  assert.match(api, /action\.startsWith\("live\."\)\) return "live"/);
  assert.match(api, /youtube_replays/);
  assert.match(api, /youtube_shorts/);
});

test("live broadcasts support separate horizontal and vertical layouts", () => {
  assert.match(admin, /방송 화면 비율/);
  assert.match(admin, /가로 방송 \(16:9\)/);
  assert.match(admin, /세로 방송 \(9:16\)/);
  assert.match(api, /youtube_live_orientation/);
  assert.match(storefront, /youtube-vertical-live-grid/);
  assert.match(storefront, /소개된 상품/);
  assert.match(storefront, /지금 방송 중인 상품/);
  assert.match(storefront, /유튜브에서 채팅 참여하기/);
});

test("mobile live and replay vertical players share one viewport width", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.youtube-live-stage\.live-vertical \.youtube-video-frame\.vertical-video,\s*\.replay-experience-vertical \.replay-video-frame\.vertical-video/);
  assert.match(styles, /width:min\(calc\(100vw - 28px\),430px\)/);
});

test("youtube benefits keep standard spacing below the notice strip", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.youtube-benefits \{ margin-top: 42px; \}/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.youtube-benefits \{ margin-top: 26px; \}/);
});

test("broadcast assistant changes products by reusable per-broadcast display number", () => {
  assert.match(admin, /이번 방송 상품 번호표/);
  assert.match(admin, /DEFAULT_LIVE_SLOT_COUNT = 50/);
  assert.match(admin, /\+ 번호 추가/);
  assert.match(admin, /번호 삭제/);
  assert.match(admin, /youtube_live_slot_numbers/);
  assert.match(admin, /이미 .*번에 연결되어 있습니다/);
  assert.match(admin, /상품명·품번·상품코드·브랜드 검색/);
  assert.match(admin, /방송 보조창 새 창으로 열기/);
  assert.match(api, /action === "live\.quickProduct"/);
  assert.match(api, /youtube_live_slot_count/);
  assert.match(api, /youtube_live_slot_numbers/);
  assert.match(api, /같은 상품은 한 방송에서 중복 연결할 수 없습니다/);
  assert.match(api, /youtube_live_current_number/);
  assert.match(api, /youtube_live_history/);
  assert.match(storefront, /INTRODUCED PRODUCTS/);
});

test("replay timeline draft separates detected time and broadcast number from product assignment", () => {
  assert.match(admin, /영상 분석 초안/);
  assert.match(admin, /AI로 영상 분석/);
  assert.match(admin, /방송번호/);
  assert.match(admin, /확인 필요/);
  assert.match(admin, /관리자는 결과를 확인한 뒤 상품만 연결하세요/);
  assert.match(replayAnalysis, /v1beta\/interactions/);
  assert.match(replayAnalysis, /type: "video", uri: youtubeUrl/);
  assert.match(replayAnalysis, /youtube_replays/);
  assert.match(replayAnalysis, /canAdmin\(admin, "live"\)/);
  assert.match(admin, /AI 영상 분석 연결 필요/);
  assert.match(admin, /Gemini API 키/);
  assert.match(aiConfig, /encryptGeminiApiKey/);
  assert.match(aiConfig, /admin\.isSupervisor/);
});

test("youtube management tabs appear only after choosing the youtube skin", () => {
  assert.match(admin, /values\.storefront_skin === "youtube" \? \[\["live"/);
  assert.match(admin, /쇼핑몰 스킨 설정/);
});

test("broadcast content links products through the selected channel catalog", () => {
  assert.match(admin, /channelProductIds = useMemo/);
  assert.match(admin, /channelProductCategories\.flatMap\(\(row\) => row\.ids\)/);
  assert.match(admin, /globalActiveProducts\.filter\(\(item\) => channelProductIds\.has/);
  assert.match(admin, /function ChannelProductPicker/);
  assert.match(admin, /상품명·품번·상품코드·브랜드 검색/);
  assert.match(admin, /전체 채널 카테고리/);
  assert.match(admin, /CHANNEL_PRODUCT_PICKER_PAGE_SIZE = 12/);
  assert.match(admin, /‘상품·카테고리’에서 먼저 상품을 가져와 주세요/);
  const pickerUses = admin.match(/<ChannelProductPicker/g) || [];
  assert.ok(pickerUses.length >= 3, "생방송·다시보기·쇼츠가 같은 상품 검색창을 사용해야 합니다.");
});

test("only one channel product picker stays open and edge pickers remain inside the viewport", () => {
  assert.match(admin, /createPortal/);
  assert.match(admin, /channel-product-picker-open/);
  assert.match(admin, /setOpen\(false\)/);
  assert.match(admin, /spaceBelow < 430 && spaceAbove > spaceBelow/);
  assert.match(admin, /bottom: window\.innerHeight - rect\.top \+ 8/);
  assert.match(admin, /document\.addEventListener\("pointerdown", closeOutside\)/);
  assert.match(admin, /event\.key === "Escape"/);
});
