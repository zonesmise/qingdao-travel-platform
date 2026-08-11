import assert from "node:assert/strict";
import test from "node:test";

import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "../lib/password-hash.ts";

test("admin password hash survives a save and login round trip", async () => {
  const password = "PointMall2026!관리";
  const encoded = await hashAdminPassword(password);

  assert.match(encoded, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyAdminPassword(password, encoded), true);
  assert.equal(await verifyAdminPassword(`${password}x`, encoded), false);
});

test("admin password policy requires ten characters, a letter, and a number", () => {
  assert.equal(validateAdminPassword("PointMall2026"), true);
  assert.equal(validateAdminPassword("short1"), false);
  assert.equal(validateAdminPassword("숫자만1234567890"), false);
});
