import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public information pages keep the configurable brand tagline under the brand name", async () => {
  for (const route of ["guide", "notices", "privacy", "terms"]) {
    const source = await read(`app/${route}/page.tsx`);
    assert.match(source, /content-brand[\s\S]*?settings\.brand_name[\s\S]*?settings\.brand_tagline/);
  }
});

test("member and administrator brand lockups use the configurable tagline", async () => {
  const [memberAuth, reset, adminLogin, adminDashboard] = await Promise.all([
    read("components/MemberAuthForm.tsx"),
    read("components/PasswordResetRequestForm.tsx"),
    read("app/admin/login/page.tsx"),
    read("components/AdminDashboard.tsx"),
  ]);
  assert.match(memberAuth, /brand\.brandName[\s\S]*?brand\.brandTagline/);
  assert.match(reset, /brand\.brandName[\s\S]*?brand\.brandTagline/);
  assert.match(adminLogin, /brand_tagline/);
  assert.match(adminDashboard, /s\.brand_name[\s\S]*?s\.brand_tagline/);
});

test("brand settings supplied to member authentication include the tagline", async () => {
  const data = await read("lib/data.ts");
  assert.match(data, /WHERE key IN \([^)]*'brand_tagline'/);
  assert.match(data, /brandTagline: String\(values\.brand_tagline/);
});
