import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const memberAuth = readFileSync(
  new URL("../lib/member-auth.ts", import.meta.url),
  "utf8",
);
const storeRoute = readFileSync(
  new URL("../app/api/store/route.ts", import.meta.url),
  "utf8",
);
const storefront = readFileSync(
  new URL("../components/Storefront.tsx", import.meta.url),
  "utf8",
);
const adminRoute = readFileSync(
  new URL("../app/api/admin/route.ts", import.meta.url),
  "utf8",
);

test("member sessions persist for 30 days and support embedded site cookies", () => {
  assert.match(memberAuth, /60 \* 60 \* 24 \* 30/);
  assert.match(memberAuth, /SameSite=None/);
  assert.match(memberAuth, /Partitioned/);
  assert.match(memberAuth, /SESSION_RENEWAL_WINDOW_SECONDS/);
});

test("store membership is based only on the point-mall member session", () => {
  assert.doesNotMatch(storeRoute, /getRequestUser/);
  assert.doesNotMatch(storeRoute, /ensureMember/);
  assert.match(storeRoute, /getNativeMemberSessionFromHeaders/);
  assert.match(storeRoute, /private, no-store/);
});

test("popup product browsing stays in the current member session", () => {
  assert.match(storefront, /event\.preventDefault\(\)/);
  assert.match(storefront, /history\.replaceState\(null, "", "#products"\)/);
  assert.match(storefront, /scrollIntoView/);
  assert.match(adminRoute, /popupLinkUrl\.startsWith\("\/"\)/);
  assert.match(adminRoute, /popupTarget/);
});
