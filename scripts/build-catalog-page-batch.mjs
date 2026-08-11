import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36";
const INPUT = process.argv[2];
const INPUTS = (INPUT || "").split("|").map((value) => value.trim()).filter(Boolean);
const BATCH = process.argv[3] || "page-1";
const SOURCE_MANIFEST = process.argv[4] || "";
const OUTPUT_ROOT = path.resolve("public/catalog/web-verified", BATCH);
const OUTPUT_DATA = path.resolve("generated", `${BATCH}.json`);
const MAX_IMAGES = 12;
const MIN_IMAGE_SIDE = Number(process.env.CATALOG_MIN_IMAGE_SIDE || 700);
const MIN_IMAGES = Number(process.env.CATALOG_MIN_IMAGES || 2);
const MIN_IMAGE_DOMAINS = Number(process.env.CATALOG_MIN_IMAGE_DOMAINS || 2);
const CONCURRENCY = Number(process.env.CATALOG_CONCURRENCY || 16);
const JOB_LIMIT = Number(process.env.CATALOG_LIMIT || 0);
const RETRY_SKUS = new Set((process.env.CATALOG_RETRY || "")
  .split(",")
  .map((value) => comparable(value))
  .filter(Boolean));
const ONLY_SKUS = new Set((process.env.CATALOG_ONLY || "")
  .split(",")
  .map((value) => comparable(value))
  .filter(Boolean));
const previousSourcesBySku = new Map();

if (!INPUTS.length) {
  throw new Error("Usage: node scripts/build-catalog-page-batch.mjs <saved-catalog.html[|saved-catalog-2.html...]> [batch-name]");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function comparable(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function assetKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function normalizedSku(title) {
  const withoutPrice = title.replace(/^[^A-Za-z0-9가-힣]*(?:\d+(?:\.\d+)?\s+)?/, "").trim();
  const candidates = withoutPrice.match(/[A-Za-z0-9][A-Za-z0-9.-]*(?:-[A-Za-z0-9]+)+/g) || [];
  const strong = candidates.find((value) => /\d/.test(value) && /[A-Za-z]/.test(value));
  const raw = (strong || withoutPrice).replace(/\s+\d{2,3}(?:-\d{2,3})?.*$/, "").trim();
  if (/^0ZXSHM/i.test(raw)) return raw.slice(1).toUpperCase();
  return raw.toUpperCase();
}

function isResearchableSku(value) {
  return value.length >= 4
    && value.length <= 40
    && /\d/.test(value)
    && /^[A-Z0-9][A-Z0-9.-]*$/.test(value);
}

function parseAlbums(html) {
  const albums = [];
  const pattern = /<a\s+class="album__main"\s+title="([^"]*)"\s+href="([^"]*)">([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = decodeHtml(match[1]).trim();
    const albumUrl = decodeHtml(match[2]);
    const image = match[3].match(/data-src="([^"]+)"/i)?.[1] || "";
    albums.push({
      title,
      sku: normalizedSku(title),
      albumUrl,
      supplierImage: decodeHtml(image).replace(/\/small(?=\.)/i, "/big"),
    });
  }
  return albums;
}

function parseInputAlbums(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("[")) return parseAlbums(input);
  try {
    const rows = JSON.parse(trimmed);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((item) => item?.album || (item?.sku ? {
        title: item.originalTitle || item.nameEn || item.nameKo || item.sku,
        sku: item.sku,
        albumUrl: (item.sourceUrls || []).find(({ url }) => domainOf(url).endsWith("yupoo.com"))?.url || "",
        supplierImage: "",
      } : null))
      .filter(Boolean);
  } catch {
    return parseAlbums(input);
  }
}

async function fetchText(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text: await response.text(), finalUrl: response.url };
  } finally {
    clearTimeout(timer);
  }
}

function resultUrls(html) {
  const rows = [];
  const blockPattern = /<div class="result results_links[\s\S]*?(?=<div class="result results_links|<div class="nav-link|<\/body>)/gi;
  for (const block of html.match(blockPattern) || []) {
    const anchor = block.match(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const redirect = new URL(decodeHtml(anchor[1]), "https://duckduckgo.com");
    const url = redirect.searchParams.get("uddg") || redirect.href;
    const snippet = cleanText(block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    rows.push({ url, title: cleanText(anchor[2]), snippet });
  }
  return rows;
}

function braveResultUrls(html) {
  const rows = [];
  const blocks = html.match(/<div class="snippet [\s\S]*?data-type="web"[\s\S]*?(?=<div class="snippet |<footer|<\/main>)/gi) || [];
  for (const block of blocks) {
    const url = block.match(/<a href="(https?:\/\/[^"#]+)"[^>]+class="[^"]*\bl1\b[^"]*"/i)?.[1];
    if (!url) continue;
    const title = decodeHtml(block.match(/class="title search-snippet-title[^"]*"[^>]*title="([^"]+)"/i)?.[1] || "");
    const snippet = cleanText(block.match(/class="content [^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    rows.push({ url: decodeHtml(url), title, snippet });
  }
  return rows;
}

function decodeBraveImageUrl(value) {
  try {
    const encoded = new URL(decodeHtml(value)).pathname.split("/g:ce/")[1]?.replaceAll("/", "");
    if (!encoded) return "";
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function braveImageResults(html, sku) {
  const rows = [];
  const key = comparable(sku);
  const blocks = html.match(/<button class="image-result [\s\S]*?<\/button>/gi) || [];
  for (const block of blocks) {
    const proxyUrl = block.match(/<img src="([^"]+)"[^>]+alt="([^"]*)"/i)?.[1] || "";
    const title = decodeHtml(block.match(/<img src="[^"]+"[^>]+alt="([^"]*)"/i)?.[1] || "");
    const domain = cleanText(block.match(/class="image-metadata-source[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "")
      .replace(/^www\./, "")
      .toLowerCase();
    const sourceUrl = decodeBraveImageUrl(proxyUrl);
    const url = sourceUrl;
    if (!sourceUrl || !domain || !hasFashionContext(title) || !comparable(`${title} ${sourceUrl}`).includes(key)) continue;
    rows.push({ url, sourceUrl, domain, title });
  }
  return rows;
}

function bingImageResults(html, sku) {
  const rows = [];
  const key = comparable(sku);
  for (const match of html.matchAll(/class="iusc"[^>]+m="([^"]+)"/gi)) {
    try {
      const data = JSON.parse(decodeHtml(match[1]));
      const url = String(data.murl || "");
      const sourceUrl = String(data.purl || url);
      const title = cleanText(`${data.t || ""} ${data.desc || ""}`);
      const domain = domainOf(sourceUrl) || domainOf(url);
      if (!url || !domain || !hasFashionContext(title) || !comparable(`${title} ${url} ${sourceUrl}`).includes(key)) continue;
      rows.push({ url, sourceUrl, domain, title });
    } catch {
      // Ignore malformed image metadata.
    }
  }
  return rows;
}

function yandexImageResults(html, sku) {
  const rows = [];
  const key = comparable(sku);
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && value.origUrl && value.snippet) {
      const url = String(value.origUrl || "");
      const sourceUrl = String(value.snippet.url || url);
      const domain = String(value.snippet.domain || domainOf(sourceUrl) || domainOf(url)).replace(/^www\./, "").toLowerCase();
      const title = cleanText(`${value.alt || ""} ${value.snippet.title || ""}`);
      const identity = `${domain}\n${url}`;
      if (url && domain && hasFashionContext(title) && comparable(`${title} ${url} ${sourceUrl}`).includes(key) && !seen.has(identity)) {
        seen.add(identity);
        rows.push({ url, sourceUrl, domain, title });
      }
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/data-(?:state|bem)="([^"]+)"/gi)) {
    try {
      visit(JSON.parse(decodeHtml(match[1])));
    } catch {
      // Ignore unrelated component state that is not valid JSON after decoding.
    }
  }
  return rows;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const BLOCKED_RESULT_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "youtube.com",
  "m.youtube.com",
]);

function usefulResults(rows, sku) {
  const key = comparable(sku);
  const seen = new Set();
  return rows.filter((row) => {
    const domain = domainOf(row.url);
    if (!domain || [...BLOCKED_RESULT_DOMAINS].some((blocked) => domain.endsWith(blocked))) return false;
    if (!comparable(`${row.title} ${row.snippet} ${row.url}`).includes(key)) return false;
    if (seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

function extractImages(html, pageUrl, sku) {
  if (!comparable(html).includes(comparable(sku))) return [];
  const urls = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/gi,
    /"hiRes"\s*:\s*"(https:[^"\\]+)"/gi,
    /"image"\s*:\s*"(https:[^"\\]+\.(?:jpe?g|png|webp)(?:\?[^"\\]*)?)"/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      try {
        const decoded = decodeHtml(match[1].replaceAll("\\/", "/"));
        urls.push(new URL(decoded, pageUrl).href);
      } catch {
        // Ignore malformed image URLs from unrelated page scripts.
      }
    }
  }
  return [...new Set(urls)].filter((url) => !/logo|favicon|icon|avatar|sprite|qr[-_]?code/i.test(url));
}

function inferBrand(title, sku) {
  const value = title.toUpperCase();
  if (value.includes("MAISON MARGIELA")) return "MAISON MARGIELA";
  if (value.includes("NEW BALANCE")) return "NEW BALANCE";
  if (value.includes("ONITSUKA TIGER")) return "ONITSUKA TIGER";
  if (value.includes("GOLDEN GOOSE")) return "GOLDEN GOOSE";
  if (value.includes("BALENCIAGA")) return "BALENCIAGA";
  if (value.includes("SALOMON")) return "SALOMON";
  if (value.includes("CONVERSE")) return "CONVERSE";
  if (value.includes("ADIDAS")) return "ADIDAS";
  if (value.includes("CROCS")) return "CROCS";
  if (value.includes("PUMA")) return "PUMA";
  if (value.includes("UGG")) return "UGG";
  if (/\bBOSS\b/.test(value)) return "BOSS";
  if (value.includes("NIKE") || /^(?:AO|AQ|AR|AT|AV|BQ|BV|CD|CI|CJ|CK|CN|CQ|CT|CU|DA|DB|DC|DD|DH|DJ|DM|DN|DQ|DR|DV|DX|DZ|FB|FD|FJ|FN|FQ|FV|FZ|HF|HJ|HM|HQ|HV|IB|IF|IH|IM|IQ)[A-Z0-9-]+$/.test(sku)) return "NIKE";
  if (value.includes("ASICS") || /^(?:10|11|12)[0-9][A-Z]/.test(sku)) return "ASICS";
  if (value.includes("NEW BALANCE") || /^(?:M|MR|MS|U|W|WR|WS)[0-9]/.test(sku)) return "NEW BALANCE";
  if (value.includes("HOKA") || /^11[0-9]{5}-/.test(sku)) return "HOKA";
  if (value.includes("ADIDAS")) return "ADIDAS";
  if (value.includes("ONITSUKA")) return "ONITSUKA TIGER";
  return cleanText(title).split(" ")[0]?.toUpperCase() || "브랜드 확인 필요";
}

function cleanProductName(title, sku, brand) {
  const withoutSite = title.replace(/\s+[-|]\s+[^-|]+$/, "").trim();
  const withoutSku = withoutSite.replace(new RegExp(sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").replace(/[()]/g, " ");
  const name = withoutSku
    .replace(/\s+(?:raffles\s*&\s*)?where to buy.*$/i, "")
    .replace(/\s+release date.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^buy\s+/i, "");
  return name || `${brand} ${sku}`;
}

function hasFashionContext(value) {
  return /\b(?:shoe|shoes|sneaker|sneakers|trainer|trainers|running|cortez|jordan|boot|boots|sandal|sandals|clog|clogs|slide|slides|slipper|slippers|loafer|loafers|heel|heels|mary jane|jacket|coat|windbreaker|parka|blazer|vest|t-shirt|tee|shirt|hoodie|sweatshirt|sweater|cardigan|pants|trousers|shorts|legging|jeans|skirt|dress|bag|handbag|backpack|tote|crossbody|wallet|pouch|nike|adidas|asics|puma|crocs|ugg|hoka|salomon|converse|balenciaga|margiela|new balance|onitsuka|golden goose|boss)\b/i.test(value);
}

function inferCatalogType(text) {
  const value = text.toLowerCase();
  if (/\b(wallet|card holder|coin purse|key pouch)\b/.test(value)) {
    return { category: "가방", productType: "accessories", subcategory: "지갑·소품" };
  }
  if (/\b(backpack|rucksack)\b/.test(value)) {
    return { category: "가방", productType: "bags", subcategory: "백팩" };
  }
  if (/\b(tote|shopper)\b/.test(value)) {
    return { category: "가방", productType: "bags", subcategory: "토트백" };
  }
  if (/\b(bag|handbag|crossbody|shoulder bag|duffle|duffel)\b/.test(value)) {
    return { category: "가방", productType: "bags", subcategory: "가방" };
  }
  if (/\b(jacket|coat|windbreaker|parka|blazer|vest)\b/.test(value)) {
    return { category: "의류", productType: "clothing", subcategory: "아우터" };
  }
  if (/\b(t-shirt|tee|shirt|hoodie|sweatshirt|sweater|cardigan|top)\b/.test(value)) {
    return { category: "의류", productType: "clothing", subcategory: "상의" };
  }
  if (/\b(pants|trousers|shorts|legging|jeans|skirt)\b/.test(value)) {
    return { category: "의류", productType: "clothing", subcategory: "하의" };
  }
  return {
    category: "신발",
    productType: "shoes",
    subcategory: /running|runner|trail|pegasus|vomero/i.test(text) ? "러닝화" : "스니커즈",
  };
}

async function downloadCandidate(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, referer: new URL(url).origin },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`not image: ${type}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 3_000 || bytes.length > 12 * 1024 * 1024) throw new Error("invalid image size");
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (Number(metadata.width) < MIN_IMAGE_SIDE || Number(metadata.height) < MIN_IMAGE_SIDE) throw new Error("low resolution");
  const preview = await sharp(bytes)
    .rotate()
    .resize(48, 48, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let whiteBorder = 0;
  let borderPixels = 0;
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      if (x > 2 && x < 45 && y > 2 && y < 45) continue;
      const offset = (y * 48 + x) * 3;
      borderPixels += 1;
      if (preview[offset] >= 238 && preview[offset + 1] >= 238 && preview[offset + 2] >= 238) whiteBorder += 1;
    }
  }
  const fingerprint = createHash("sha1").update(
    await sharp(bytes).resize(40, 40, { fit: "contain", background: "white" }).grayscale().raw().toBuffer(),
  ).digest("hex");
  return { bytes, fingerprint, width: metadata.width, height: metadata.height, cleanBackgroundScore: whiteBorder / borderPixels };
}

function interleaveByDomain(candidates) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const domain = candidate.domain || domainOf(candidate.sourceUrl) || domainOf(candidate.url);
    if (!domain) continue;
    const bucket = buckets.get(domain) || [];
    bucket.push(candidate);
    buckets.set(domain, bucket);
  }
  const result = [];
  while ([...buckets.values()].some((bucket) => bucket.length)) {
    for (const bucket of buckets.values()) {
      const candidate = bucket.shift();
      if (candidate) result.push(candidate);
    }
  }
  return result;
}

async function researchAlbum(album) {
  const manifestRows = sourceManifest[album.sku] || [];
  const previousRows = previousSourcesBySku.get(comparable(album.sku)) || [];
  const sourceRows = [...manifestRows, ...previousRows]
    .filter((row) => ![...BLOCKED_RESULT_DOMAINS].some((blocked) => domainOf(row.url).endsWith(blocked)))
    .filter((row, index, rows) => rows.findIndex((other) => domainOf(other.url) === domainOf(row.url)) === index)
    .slice(0, 8);
  const imageCandidates = [];
  try {
    const queryBrand = inferBrand(album.title, album.sku);
    const imageSearch = await fetchText(`https://yandex.com/images/search?text=${encodeURIComponent(`${album.sku} ${queryBrand}`)}`, 15_000);
    imageCandidates.push(...yandexImageResults(imageSearch.text, album.sku).slice(0, 30));
  } catch {
    // Brave below remains available as a bounded fallback.
  }
  if (new Set(imageCandidates.map((item) => item.domain)).size < 2) {
    try {
      const imageSearch = await fetchText(`https://search.brave.com/images?q=${encodeURIComponent(`"${album.sku}"`)}&source=web`, 8_000);
      imageCandidates.push(...braveImageResults(imageSearch.text, album.sku).slice(0, 30));
    } catch {
      // Bing below remains available as a bounded fallback.
    }
  }
  if (new Set(imageCandidates.map((item) => item.domain)).size < 2) {
    try {
      const queryBrand = inferBrand(album.title, album.sku);
      const imageSearch = await fetchText(`https://www.bing.com/images/search?q=${encodeURIComponent(`"${album.sku}" ${queryBrand}`)}`, 25_000);
      imageCandidates.push(...bingImageResults(imageSearch.text, album.sku).slice(0, 30));
    } catch {
      // Retailer pages below remain available as a bounded fallback.
    }
  }
  if (sourceRows.length < 2) {
    const seenEvidenceDomains = new Set(sourceRows.map((row) => domainOf(row.url)));
    for (const candidate of imageCandidates) {
      if (seenEvidenceDomains.has(candidate.domain)) continue;
      seenEvidenceDomains.add(candidate.domain);
      sourceRows.push({ url: candidate.sourceUrl, title: candidate.title || album.sku, snippet: "" });
      if (sourceRows.length >= 8) break;
    }
  }
  const productEvidence = [
    ...sourceRows.flatMap((row) => [row.title, row.snippet]),
    ...imageCandidates.map((item) => item.title || ""),
  ].join(" ");
  if (!hasFashionContext(productEvidence)) {
    return { album, skipped: true, reason: "non_fashion_search_match", sources: sourceRows, imageDomains: [] };
  }
  if (sourceRows.length < 2) {
    let webResults = [];
    try {
      const search = await fetchText(`https://search.brave.com/search?q=${encodeURIComponent(`"${album.sku}"`)}&source=web`, 8_000);
      webResults = usefulResults(braveResultUrls(search.text), album.sku).slice(0, 8);
    } catch {
      try {
        const search = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${album.sku}"`)}`, 8_000);
        webResults = usefulResults(resultUrls(search.text), album.sku).slice(0, 8);
      } catch {
        webResults = [];
      }
    }
    const seenEvidenceDomains = new Set(sourceRows.map((row) => domainOf(row.url)));
    for (const row of webResults) {
      const domain = domainOf(row.url);
      if (!domain || seenEvidenceDomains.has(domain)) continue;
      seenEvidenceDomains.add(domain);
      sourceRows.push(row);
    }
  }
  const imageCandidateDomains = new Set(imageCandidates.map((item) => item.domain));
  if (imageCandidateDomains.size < 2) {
  for (const row of sourceRows) {
    try {
      const page = await fetchText(row.url);
      for (const url of extractImages(page.text, page.finalUrl, album.sku)) {
        imageCandidates.push({ url, sourceUrl: row.url, domain: domainOf(row.url) });
      }
    } catch {
      // Search evidence remains useful when a retailer blocks automated page reads.
    }
  }
  }
  const preferred = interleaveByDomain(imageCandidates.sort((a, b) => {
    const aClean = /photoroom|main-square|packshot|\.png(?:\?|$)/i.test(a.url) ? 1 : 0;
    const bClean = /photoroom|main-square|packshot|\.png(?:\?|$)/i.test(b.url) ? 1 : 0;
    return bClean - aClean;
  }));
  const attempts = await Promise.allSettled(preferred.slice(0, MAX_IMAGES * 4).map(async (candidate) => ({
    ...candidate,
    ...await downloadCandidate(candidate.url),
  })));
  const downloaded = [];
  const fingerprints = new Set();
  for (const attempt of attempts) {
    if (attempt.status !== "fulfilled" || fingerprints.has(attempt.value.fingerprint)) continue;
    fingerprints.add(attempt.value.fingerprint);
    downloaded.push(attempt.value);
  }
  const accepted = downloaded
    .sort((a, b) => b.cleanBackgroundScore - a.cleanBackgroundScore || (b.width * b.height) - (a.width * a.height))
    .slice(0, MAX_IMAGES);
  const evidenceDomains = new Set(sourceRows.map((row) => domainOf(row.url)).filter(Boolean));
  const imageDomains = new Set(accepted.map((item) => item.domain).filter(Boolean));
  if (accepted.length < MIN_IMAGES || evidenceDomains.size < 2 || imageDomains.size < MIN_IMAGE_DOMAINS) {
    return {
      album,
      skipped: true,
      reason: accepted.length < MIN_IMAGES ? "not_enough_verified_images" : imageDomains.size < MIN_IMAGE_DOMAINS ? "single_image_source" : "single_evidence_source",
      sources: sourceRows,
      imageDomains: [...imageDomains],
    };
  }

  const key = assetKey(album.sku);
  const target = path.join(OUTPUT_ROOT, key);
  await mkdir(target, { recursive: true });
  const mediaUrls = [];
  for (let index = 0; index < accepted.length; index += 1) {
    const fileName = `${String(index + 1).padStart(2, "0")}.webp`;
    await sharp(accepted[index].bytes, { failOn: "error" })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "contain", background: "#ffffff", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 84, effort: 4 })
      .toFile(path.join(target, fileName));
    mediaUrls.push(`/catalog/web-verified/${BATCH}/${key}/${fileName}`);
  }

  const best = [...sourceRows].sort((a, b) => {
    const score = (row) => (/[^\u0000-\u024f]/.test(row.title) ? -5 : 0) + (row.title.length >= 12 && row.title.length <= 100 ? 3 : 0);
    return score(b) - score(a);
  })[0] || { title: album.sku, snippet: "" };
  const brand = inferBrand(best.title, album.sku);
  const cleanedName = cleanProductName(best.title, album.sku, brand);
  const nameEn = /[\u0400-\u04ff]/.test(cleanedName) || cleanedName.length > 110
    ? `${brand} ${album.sku}`
    : cleanedName;
  const catalogType = inferCatalogType(`${best.title} ${best.snippet}`);
  const sourceUrls = [
    ...sourceRows.slice(0, 3).map((row) => ({ url: row.url, label: `${domainOf(row.url)} 품번·모델·색상 확인` })),
    { url: album.albumUrl, label: "스카이샵 원본 품번·색상 식별 참고(사진 미사용)" },
  ];
  return {
    sku: album.sku,
    originalTitle: album.title,
    brand,
    nameKo: nameEn,
    nameEn,
    category: catalogType.category,
    productType: catalogType.productType,
    subcategory: catalogType.subcategory,
    gender: /women|wmns|woman/i.test(`${best.title} ${best.snippet}`) ? "여성용" : "남녀공용",
    description: best.snippet || `${nameEn}입니다. 품번 ${album.sku}와 상품사진을 여러 판매처에서 교차 확인했습니다.`,
    detailContent: best.snippet || `${nameEn} · 품번 ${album.sku}`,
    imageUrl: mediaUrls[0],
    mediaUrls,
    sourceUrls,
    sourceNote: `${evidenceDomains.size}개 외부 사이트에서 품번·색상 교차 확인 · ${imageDomains.size}개 외부 사이트에서 고화질 상품사진 확보 · 배경 제거 또는 흰 배경 사진 우선`,
    imageSources: accepted.map(({ sourceUrl, domain }) => ({ sourceUrl, domain })),
  };
}

const inputHtmlList = await Promise.all(INPUTS.map((input) => readFile(path.resolve(input), "utf8")));
const sourceManifest = SOURCE_MANIFEST
  ? JSON.parse(await readFile(path.resolve(SOURCE_MANIFEST), "utf8"))
  : {};
const catalogSource = await readFile(path.resolve("lib/sku-draft-catalog.ts"), "utf8");
const rawMatch = catalogSource.match(/const RAW_SKUS = `\n([\s\S]*?)\n`;/);
const existing = new Set((rawMatch?.[1] || "").split(/\s+/).map((value) => comparable(value)).filter(Boolean));
try {
  const pageOne = JSON.parse(await readFile(path.resolve("generated/page-1.json"), "utf8"));
  for (const item of pageOne) {
    const sku = comparable(item?.sku || item?.album?.sku || "");
    if (item?.sku && !item.skipped && !RETRY_SKUS.has(sku) && !ONLY_SKUS.has(sku)) existing.add(sku);
  }
} catch {
  // A page-one result is optional when this script is reused on a clean checkout.
}
const unique = new Map();
const unidentified = new Map();
for (const inputHtml of inputHtmlList) {
  for (const album of parseInputAlbums(inputHtml)) {
    if (!isResearchableSku(album.sku)) {
      if (album.albumUrl) unidentified.set(album.albumUrl, album);
      continue;
    }
    if (existing.has(comparable(album.sku))) continue;
    if (!unique.has(comparable(album.sku))) unique.set(comparable(album.sku), album);
  }
}
let completed = [];
try {
  const saved = JSON.parse(await readFile(OUTPUT_DATA, "utf8"));
  if (Array.isArray(saved)) completed = saved;
} catch {
  completed = [];
}
for (const item of completed) {
  const sku = comparable(item.sku || item.album?.sku || "");
  if (!sku) continue;
  const rows = (item.sources || item.sourceUrls || [])
    .map((row) => ({
      url: row.url,
      title: row.title || row.label || item.nameEn || item.originalTitle || sku,
      snippet: row.snippet || item.description || "",
    }))
    .filter((row) => row.url && !domainOf(row.url).endsWith("yupoo.com"));
  previousSourcesBySku.set(sku, rows);
}
completed = completed.map((item) => {
  if (item.skipped || (item.sku !== "10274269" && hasFashionContext(`${item.nameEn || ""} ${item.description || ""}`))) return item;
  const reference = (item.sourceUrls || []).find(({ url }) => domainOf(url).endsWith("yupoo.com"));
  return {
    album: { title: item.originalTitle || item.sku, sku: item.sku, albumUrl: reference?.url || "" },
    skipped: true,
    reason: "non_fashion_search_match",
    sources: item.sourceUrls || [],
    imageDomains: [],
  };
});
completed = completed.filter((item) => !RETRY_SKUS.has(comparable(item.sku || item.album?.sku || "")));
const completedAlbumUrls = new Set(completed.map((item) => item.album?.albumUrl).filter(Boolean));
for (const album of unidentified.values()) {
  if (completedAlbumUrls.has(album.albumUrl)) continue;
  completed.push({ album, skipped: true, reason: "unidentifiable_title_or_missing_sku", sources: [], imageDomains: [] });
}
const processed = new Set(completed
  .filter((item) => !String(item.reason || "").startsWith("AbortError"))
  .map((item) => comparable(item.sku || item.album?.sku || ""))
  .filter(Boolean));
completed = completed.filter((item) => !String(item.reason || "").startsWith("AbortError"));
const pendingJobs = [...unique.values()]
  .filter((item) => !processed.has(comparable(item.sku)))
  .filter((item) => !ONLY_SKUS.size || ONLY_SKUS.has(comparable(item.sku)));
const jobs = JOB_LIMIT > 0 ? pendingJobs.slice(0, JOB_LIMIT) : pendingJobs;
let cursor = 0;

async function saveProgress() {
  const saved = [...completed]
    .sort((a, b) => (a.sku || a.album?.sku || "").localeCompare(b.sku || b.album?.sku || ""));
  await writeFile(OUTPUT_DATA, `${JSON.stringify(saved, null, 2)}\n`);
}

async function worker() {
  while (cursor < jobs.length) {
    const current = jobs[cursor++];
    try {
      completed.push(await researchAlbum(current));
    } catch (error) {
      completed.push({ album: current, skipped: true, reason: String(error) });
    }
    if (completed.length % 25 === 0) await saveProgress();
    process.stdout.write(`Researched ${completed.length}/${completed.length + jobs.length - cursor}\n`);
  }
}

await mkdir(path.dirname(OUTPUT_DATA), { recursive: true });
await mkdir(OUTPUT_ROOT, { recursive: true });
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
completed.sort((a, b) => (a.sku || a.album?.sku || "").localeCompare(b.sku || b.album?.sku || ""));
await saveProgress();
const ready = completed.filter((item) => !item.skipped);
const skipped = completed.filter((item) => item.skipped);
process.stdout.write(`Ready ${ready.length}; skipped ${skipped.length}; output ${OUTPUT_DATA}\n`);
