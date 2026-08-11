import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isContactAvailable } from "../components/FloatingContact.tsx";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("floating contact is rendered on customer shopping screens", () => {
  const storefront = read("components/Storefront.tsx");
  const productDetail = read("components/ProductDetailExperience.tsx");
  assert.match(storefront, /<FloatingContact settings=\{s\}/);
  assert.match(productDetail, /<FloatingContact settings=\{settings\}/);
});

test("contact destinations are editable and persisted through admin settings", () => {
  const defaults = read("lib/data.ts");
  const adminApi = read("app/api/admin/route.ts");
  const dashboard = read("components/AdminDashboard.tsx");
  for (const key of [
    "contact_floating_enabled",
    "contact_default_open",
    "contact_always_available",
    "contact_start_time",
    "contact_end_time",
    "contact_weekdays",
    "contact_counselor_image_url",
    "contact_kakao_enabled", "contact_kakao_url",
    "contact_telegram_enabled", "contact_telegram_url",
    "contact_line_enabled", "contact_line_url",
    "contact_live_enabled", "contact_live_url",
  ]) {
    assert.match(defaults, new RegExp(key));
    assert.match(adminApi, new RegExp(`\\"${key}\\"`));
    assert.match(dashboard, new RegExp(key));
  }
});

test("contact panel defaults open and stays inside desktop and mobile viewports", () => {
  const component = read("components/FloatingContact.tsx");
  const css = read("app/globals.css");
  assert.match(component, /카카오톡 상담/);
  assert.match(component, /siKakaotalk/);
  assert.match(component, /siTelegram/);
  assert.match(component, /siLine/);
  assert.match(component, /텔레그램상담/);
  assert.match(component, /라인상담/);
  assert.match(component, /실시간상담/);
  assert.match(component, /useState\(initiallyAvailable && settings\.contact_default_open !== "false"\)/);
  assert.match(component, /role="region"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /onClick=\{toggleContact\}/);
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /channel\.enabled && channel\.url/);
  assert.match(component, /contact-counselor/);
  assert.doesNotMatch(component, /contact-status-dot/);
  assert.match(component, /contact-header-copy/);
  assert.match(component, /상담 가능/);
  assert.match(component, /편하게 문의하세요/);
  assert.match(component, /contact-close-mark/);
  assert.match(component, /<strong>닫기<\/strong>/);
  assert.doesNotMatch(component, /상담 가능 · \{settings\.support_hours/);
  assert.match(component, /현재 상담시간이 아닙니다/);
  assert.match(component, /contact-status-lamp/);
  assert.doesNotMatch(component, /channel\.key !== "kakao"/);
  assert.match(component, /\(max-width: 720px\), \(pointer: coarse\)/);
  assert.match(component, /Math\.min\(500, Math\.max\(380, window\.screen\.availWidth - 96\)\)/);
  assert.match(component, /Math\.min\(720, Math\.max\(560, window\.screen\.availHeight - 96\)\)/);
  assert.match(component, /"rewardConsultPopup"/);
  assert.match(component, /popup=yes,width=\$\{popupWidth\},height=\$\{popupHeight\}/);
  assert.match(component, /window\.location\.assign\(channel\.url\)/);
  assert.match(component, /onClick=\{\(event\) => openContactChannel\(event, channel\)\}/);
  assert.match(css, /\.floating-contact\s*\{[^}]*right:max\(14px,env\(safe-area-inset-right\)\)[^}]*width:min\(104px,calc\(100vw - 28px\)\)[^}]*height:58px/);
  assert.match(css, /\.floating-contact-backdrop\s*\{[^}]*position:absolute[^}]*bottom:68px/);
  assert.match(css, /\.floating-contact-panel\s*\{[^}]*width:100%[^}]*max-height:calc\(100dvh - 142px\)/);
  assert.match(css, /\.floating-contact-button\s*\{[\s\S]*?width:\s*58px[\s\S]*?height:\s*58px/);
  assert.match(css, /\.floating-contact-panel>header\s*\{[^}]*flex-direction:column[^}]*align-items:center/);
  assert.match(css, /\.contact-channel\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*36px[\s\S]*?min-height:\s*36px/);
  assert.match(css, /\.contact-channel>span>svg\s*\{[^}]*width:13px[^}]*height:13px/);
  assert.match(css, /\.contact-counselor\s*\{[^}]*width:50px[^}]*height:50px[^}]*flex-basis:50px/);
  assert.match(css, /\.contact-kakao\s*\{[^}]*#ffe45c[^}]*#f8cf24/);
  assert.match(css, /\.contact-telegram\s*\{[^}]*#39afe5[^}]*#168fca/);
  assert.match(css, /\.contact-line\s*\{[^}]*#17cd70[^}]*#05ad57/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*?\.floating-contact\s*\{[^}]*bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)[^}]*width:min\(100px,calc\(100vw - 20px\)\)[^}]*height:54px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*?\.floating-contact-panel\s*\{[^}]*width:100%[^}]*border-radius:15px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*?\.contact-channel\s*\{[^}]*width:100%[^}]*height:38px[^}]*min-height:38px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*?\.contact-counselor\s*\{[^}]*width:48px[^}]*height:48px[^}]*flex-basis:48px/);
  assert.match(css, /\.floating-contact\.is-closed\.is-available \.floating-contact-button/);
  assert.match(css, /\.floating-contact\.is-unavailable \.floating-contact-button/);
});

test("contact availability follows Seoul schedule, overnight hours and always-on override", () => {
  const weekdays = {
    contact_always_available: "false",
    contact_start_time: "09:00",
    contact_end_time: "18:00",
    contact_weekdays: "1,2,3,4,5",
  };
  assert.equal(isContactAvailable(weekdays, new Date("2026-08-03T01:00:00Z")), true);
  assert.equal(isContactAvailable(weekdays, new Date("2026-08-03T10:00:00Z")), false);
  assert.equal(isContactAvailable({ ...weekdays, contact_always_available: "true" }, new Date("2026-08-02T20:00:00Z")), true);

  const overnight = { ...weekdays, contact_start_time: "22:00", contact_end_time: "02:00", contact_weekdays: "1" };
  assert.equal(isContactAvailable(overnight, new Date("2026-08-03T14:00:00Z")), true);
  assert.equal(isContactAvailable(overnight, new Date("2026-08-03T16:00:00Z")), true);
  assert.equal(isContactAvailable(overnight, new Date("2026-08-03T18:00:00Z")), false);
});

test("admin sidebar shows all desktop menu groups without its own vertical scroll", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.admin-sidebar nav\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /@media \(max-height: 820px\) and \(min-width: 761px\)/);
});

test("counselor photos are optimized, uploaded and saved immediately", () => {
  const dashboard = read("components/AdminDashboard.tsx");
  const uploadRoute = read("app/api/contact-image/route.ts");
  assert.match(dashboard, /20 \* 1024 \* 1024/);
  assert.match(dashboard, /createImageBitmap\(file\)/);
  assert.match(dashboard, /canvas\.toBlob\(resolve, "image\/webp"/);
  assert.match(dashboard, /사진이 등록되어 즉시 저장되었습니다/);
  assert.match(uploadRoute, /contact_counselor_image_url/);
  assert.match(uploadRoute, /ON CONFLICT\(key\) DO UPDATE/);
});
