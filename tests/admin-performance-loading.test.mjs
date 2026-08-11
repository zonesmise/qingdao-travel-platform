import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("admin starts with dashboard summary and loads menu data by scope", async () => {
  const client = await readFile(new URL("components/AdminDashboard.tsx", root), "utf8");
  const api = await readFile(new URL("app/api/admin/route.ts", root), "utf8");
  const page = await readFile(new URL("app/admin/page.tsx", root), "utf8");

  assert.match(client, /\/api\/admin\?scope=dashboard/);
  assert.match(client, /loadScope\(key\)/);
  assert.match(client, /loadedScopes\.current\.has\(scope\)/);
  assert.match(api, /searchParams\.get\("scope"\)/);
  assert.match(api, /scope === "dashboard"/);
  assert.match(api, /scope !== "products"/);
  assert.match(api, /SELECT p\.id, p\.name, p\.category, p\.brand/);
  assert.doesNotMatch(page, /ensureSeedData/);
});
