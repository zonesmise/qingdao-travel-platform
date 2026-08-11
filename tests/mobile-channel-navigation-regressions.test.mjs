import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
const css = await readFile(new URL("app/globals.css", root), "utf8");
const dashboard = await readFile(new URL("components/AdminDashboard.tsx", root), "utf8");

test("mobile pages declare the real device viewport", () => {
  assert.match(layout, /export const viewport: Viewport/);
  assert.match(layout, /width: "device-width"/);
  assert.match(layout, /initialScale: 1/);
  assert.match(layout, /viewportFit: "cover"/);
});

test("other-channel cards stack without exposing a neighboring card on mobile", () => {
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?\.other-channel-showcase \.other-channel-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-auto-flow: row;[\s\S]*?overflow: visible;[\s\S]*?scroll-snap-type: none;/,
  );
  assert.match(
    css,
    /\.other-channel-showcase \.other-channel-grid > a \{[\s\S]*?grid-template-columns: 68px minmax\(0, 1fr\);/,
  );
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.other-channel-controls \{ display: none; \}/);
});

test("channel editor is selected before the admin screen paints", () => {
  assert.match(dashboard, /import \{[\s\S]*?useLayoutEffect[\s\S]*?\} from "react"/);
  assert.match(
    dashboard,
    /useLayoutEffect\(\(\) => \{[\s\S]*?initialChannelId[\s\S]*?editChannel\(initialChannel\)/,
  );
});
