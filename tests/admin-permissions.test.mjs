import assert from "node:assert/strict";
import test from "node:test";

import {
  canAdmin,
  parseManagerPermissions,
} from "../lib/admin-permissions.ts";

test("manager permissions accept only known operation keys", () => {
  assert.deepEqual(
    parseManagerPermissions('["products","orders","settings","products"]'),
    ["products", "orders"],
  );
});

test("manager requests require an explicitly granted permission", () => {
  const manager = { role: "manager", permissions: ["products"] };
  assert.equal(canAdmin(manager, "products"), true);
  assert.equal(canAdmin(manager, "settings"), false);
  assert.equal(canAdmin(manager, "administrators"), false);
});

test("supervisor has every permission regardless of the stored list", () => {
  const supervisor = { role: "supervisor", permissions: [] };
  assert.equal(canAdmin(supervisor, "settings"), true);
  assert.equal(canAdmin(supervisor, "administrators"), true);
});
