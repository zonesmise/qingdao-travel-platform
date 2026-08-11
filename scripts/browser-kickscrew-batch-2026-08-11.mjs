import { readFile, writeFile } from "node:fs/promises";

const ROOT = "D:/Codex/리워드프로그램";
const PENDING_PATH = `${ROOT}/work/results/kickscrew-pending-2026-08-11.json`;
const RESULTS_PATH = `${ROOT}/work/results/kickscrew-browser-results-2026-08-11.json`;
const BROWSER_CLIENT =
  "C:/Users/Administrator/.codex/plugins/cache/openai-bundled/browser/26.803.41515/scripts/browser-client.mjs";

if (globalThis.agent?.browsers == null) {
  const { setupBrowserRuntime } = await import(BROWSER_CLIENT);
  globalThis.agent = await setupBrowserRuntime();
}
if (globalThis.browser == null) {
  globalThis.browser = await globalThis.agent.browsers.getForUrl("https://www.kickscrew.com/");
}
if (globalThis.kcTab == null) {
  const openTabs = await globalThis.browser.user.openTabs();
  const existing = openTabs.find((tab) => String(tab.url || "").includes("kickscrew.com"));
  globalThis.kcTab = existing
    ? await globalThis.browser.user.claimTab(existing)
    : await globalThis.browser.tabs.new();
  if (!existing) await globalThis.kcTab.goto("https://www.kickscrew.com/en-KR");
}

const pending = JSON.parse(await readFile(PENDING_PATH, "utf8")).pending;
const results = JSON.parse(await readFile(RESULTS_PATH, "utf8"));
const processed = new Set(results.filter((item) => item.status !== "error").map((item) => item.sku));
const limit = Math.max(1, Number(globalThis.kcBatchLimit || 10));
const batch = pending.filter((sku) => !processed.has(sku)).slice(0, limit);
const summary = { batch: batch.length, matched: 0, skipped: 0, errors: 0 };

for (const sku of batch) {
  try {
    await globalThis.kcTab.goto(
      `https://www.kickscrew.com/en-KR/search?q=${encodeURIComponent(sku)}`,
    );
    await globalThis.kcTab.playwright.waitForLoadState({
      state: "domcontentloaded",
      timeoutMs: 20_000,
    });
    const href = await globalThis.kcTab.playwright
      .locator('main a[href*="/products/"]')
      .first()
      .getAttribute("href", { timeoutMs: 12_000 })
      .catch(() => null);

    let record;
    if (!href) {
      record = { sku, status: "skip", reason: "no-first-result" };
      summary.skipped += 1;
    } else {
      const url = href.startsWith("http") ? href : `https://www.kickscrew.com${href}`;
      await globalThis.kcTab.goto(url);
      await globalThis.kcTab.playwright.waitForLoadState({
        state: "domcontentloaded",
        timeoutMs: 20_000,
      });
      const body = await globalThis.kcTab.playwright
        .locator("body")
        .innerText({ timeoutMs: 15_000 });

      if (!body.toUpperCase().includes(sku.toUpperCase())) {
        record = { sku, status: "skip", reason: "first-detail-style-mismatch", url };
        summary.skipped += 1;
      } else {
        const title = await globalThis.kcTab.playwright
          .locator("h1")
          .first()
          .innerText({ timeoutMs: 8_000 })
          .catch(() => "");
        const rawImages = await globalThis.kcTab.playwright
          .locator("main img")
          .evaluateAll((elements) =>
            elements.map((element) => ({
              src: element.currentSrc || element.src || "",
              alt: element.alt || "",
            })),
          );
        const seen = new Set();
        const images = [];
        for (const image of rawImages) {
          try {
            const imageUrl = new URL(image.src);
            if (imageUrl.hostname !== "cdn.shopify.com") continue;
            if (/loading_shimmer|authenticity|placeholder/i.test(image.src)) continue;
            if (!(/main product image|product image/i.test(image.alt) || /main-square/i.test(image.src))) {
              continue;
            }
            const key = image.src.replace(
              /_(?:\d+x\d*|\d+x)\.(jpg|jpeg|png|webp)/i,
              ".$1",
            );
            if (seen.has(key)) continue;
            seen.add(key);
            images.push(image.src);
            if (images.length >= 12) break;
          } catch {
            // Ignore non-URL image placeholders.
          }
        }
        const facts = body
          .split("\n")
          .map((line) => line.trim())
          .filter(
            (line) =>
              /^(Style|Color|Release Date|Season|SKU)\b/i.test(line) ||
              line.toUpperCase() === sku.toUpperCase(),
          )
          .slice(0, 20);
        record = {
          sku,
          status: "matched",
          reason: "exact_detail_match",
          url,
          title: title.trim(),
          images,
          facts,
        };
        summary.matched += 1;
      }
    }
    results.push(record);
    processed.add(sku);
  } catch (error) {
    results.push({
      sku,
      status: "error",
      reason: String(error?.message || error).slice(0, 300),
    });
    summary.errors += 1;
  }

  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
}

summary.processed = processed.size;
summary.total = pending.length;
summary.remaining = pending.length - processed.size;
nodeRepl.write(JSON.stringify(summary));
