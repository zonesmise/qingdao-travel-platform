import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const productPage = readFileSync(
  new URL("../app/products/[id]/page.tsx", import.meta.url),
  "utf8",
);
const productClient = readFileSync(
  new URL("../components/ProductDetailExperience.tsx", import.meta.url),
  "utf8",
);

test("home resolves the member session before the first render", () => {
  assert.match(home, /getNativeMemberSessionFromHeaders\(requestHeaders\)/);
  assert.match(home, /getStorePayload\(session\.member, "native", origin, \{ skipCatalog: true \}\)/);
});

test("product details receive signed-in state on the first render", () => {
  assert.match(productPage, /initialMember=\{initialStoreData\?\.member \?\? null\}/);
  assert.match(productPage, /initialCartCount=\{initialStoreData\?\.cart\?\.length \?\? 0\}/);
  assert.match(productClient, /useState<any>\(initialMember\)/);
  assert.match(productClient, /useState\(initialCartCount\)/);
});
