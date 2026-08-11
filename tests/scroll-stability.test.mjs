import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeChangedSettings } from "../components/Storefront.tsx";

const storefront = readFileSync(
  new URL("../components/Storefront.tsx", import.meta.url),
  "utf8",
);
const floatingContact = readFileSync(
  new URL("../components/FloatingContact.tsx", import.meta.url),
  "utf8",
);

test("the server payload is not fetched again after the first screen renders", () => {
  assert.match(storefront, /if \(!initialData \|\| params\.get\("guest"\) === "1"\) void load\(\)/);
  assert.doesNotMatch(storefront, /useEffect\(\(\) => \{\s*load\(\)/);
});

test("unchanged live settings preserve the current data object", () => {
  const current = { settings: { youtube_live_enabled: "true", youtube_live_current_number: "7" } };
  assert.equal(mergeChangedSettings(current, { youtube_live_current_number: "7" }), current);
  const changed = mergeChangedSettings(current, { youtube_live_current_number: "8" });
  assert.notEqual(changed, current);
  assert.equal(changed.settings.youtube_live_current_number, "8");
});

test("background live updates preserve the viewport and do not overlap", () => {
  assert.match(storefront, /liveViewportRef\.current = \{ x: window\.scrollX, y: window\.scrollY \}/);
  assert.match(storefront, /window\.scrollTo\(viewport\.x, viewport\.y\)/);
  assert.match(storefront, /if \(requestInFlight \|\| document\.visibilityState === "hidden"\) return/);
  assert.match(storefront, /controller\.abort\(\)/);
});

test("contact availability refreshes only when its schedule changes", () => {
  assert.match(floatingContact, /const availabilitySettings = useMemo\(\(\) => \(\{/);
  assert.match(floatingContact, /\}, \[availabilitySettings\]\)/);
  assert.doesNotMatch(floatingContact, /\}, \[settings\]\)/);
});
