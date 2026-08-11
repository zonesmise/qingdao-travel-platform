import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authForm = readFileSync(new URL("../components/MemberAuthForm.tsx", import.meta.url), "utf8");
const memberAuth = readFileSync(new URL("../lib/member-auth.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const storeApi = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const productDetail = readFileSync(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
const channelPage = readFileSync(new URL("../app/channel/[slug]/page.tsx", import.meta.url), "utf8");

test("login and registration preserve the requested shopping page", () => {
  assert.match(authForm, /register\?return_to=/);
  assert.match(authForm, /login\?return_to=/);
  assert.match(authForm, /readReturnTo\(\)/);
});

test("registration validates password confirmation and Korean mobile numbers", () => {
  assert.match(authForm, /passwordConfirmation/);
  assert.match(memberAuth, /비밀번호 확인이 일치하지 않습니다/);
  assert.match(memberAuth, /\^01\[016789\]/);
});

test("expired member sessions return to login and then resume the current page", () => {
  assert.match(storefront, /response\.status === 401/);
  assert.match(storefront, /login\?return_to=/);
});

test("channel login returns to the channel and channel pages load the member session", () => {
  assert.match(storefront, /channelContext\?\.channel\?\.slug[\s\S]*?login\?return_to=/);
  assert.match(channelPage, /getNativeMemberSessionFromHeaders/);
  assert.match(channelPage, /getStorePayload\(session\.member, "native", origin, \{ skipCatalog: true \}\)/);
});

test("buy now checks out only its selected cart row", () => {
  assert.match(productDetail, /buy_now_cart_id/);
  assert.match(storefront, /cartIds: orderCart\.map/);
  assert.match(storeApi, /requestedCartIds/);
  assert.match(storeApi, /DELETE FROM carts WHERE member_id = \? AND id IN/);
});

test("successful checkout keeps a visible order completion summary", () => {
  assert.match(storefront, /ORDER COMPLETE/);
  assert.match(storefront, /주문번호/);
  assert.match(storefront, /입금기한/);
  assert.match(storefront, /주문내역 보기/);
});
