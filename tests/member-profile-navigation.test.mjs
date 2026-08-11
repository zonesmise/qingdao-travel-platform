import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("member profile opens from the member identity card", () => {
  assert.match(source, /member-profile-trigger/);
  assert.match(source, /onClick=\{\(\) => setTab\("profile"\)\}/);
  assert.match(source, /회원정보 보기/);
});

test("profile is not duplicated in the horizontal account menu", () => {
  const menu = source.slice(source.indexOf('<nav className="panel-tabs"'), source.indexOf('<div className="panel-body account-body"'));
  assert.doesNotMatch(menu, /\["profile"/);
});

test("profile trigger has visible interactive states", () => {
  assert.match(css, /\.member-profile-trigger:hover/);
  assert.match(css, /\.member-profile-trigger:focus-visible/);
  assert.match(css, /\.member-profile-trigger\.active/);
});
