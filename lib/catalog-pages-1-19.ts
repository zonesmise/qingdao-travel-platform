import catalogResults from "../generated/pages-1-19.json";

import type { ImportedSkuDraft } from "./sku-draft-catalog";

type CatalogResult = {
  sku?: string;
  album?: { sku?: string };
  skipped?: boolean;
  brand?: string;
  nameKo?: string;
  nameEn?: string;
  category?: "신발" | "가방" | "의류";
  productType?: "shoes" | "bags" | "clothing" | "accessories";
  subcategory?: string;
  gender?: string;
  description?: string;
  detailContent?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  sourceUrls?: Array<{ url: string; label: string }>;
  sourceNote?: string;
  imageSources?: Array<{ sourceUrl: string; domain: string }>;
};

function cleanName(value: string | undefined, brand: string, sku: string) {
  const cleaned = String(value || "")
    .replace(/\s+[-|]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const otherCodes = cleaned.match(/[A-Z0-9]{4,}(?:-[A-Z0-9]+)+/gi) || [];
  const hasDifferentCode = otherCodes.some((value) => value.replace(/[^A-Z0-9]/gi, "").toLowerCase() !== sku.replace(/[^A-Z0-9]/gi, "").toLowerCase());
  if (!cleaned || cleaned.length > 110 || /[\u0400-\u04ff]|&#x?\d+;/.test(cleaned) || hasDifferentCode) {
    return `${brand} ${sku}`;
  }
  const midpoint = Math.floor(cleaned.length / 2);
  const left = cleaned.slice(0, midpoint).trim();
  const right = cleaned.slice(midpoint).trim();
  return left.length > 15 && left.toLowerCase() === right.toLowerCase() ? left : cleaned;
}

function isReferenceDomain(value: string) {
  return value.replace(/^www\./, "").endsWith("yupoo.com");
}

const results = catalogResults as CatalogResult[];

export const ALL_PAGES_REVIEW_PENDING_SKUS = Array.from(new Set(
  results
    .filter((item) => item.skipped)
    .map((item) => item.album?.sku)
    .filter((sku): sku is string => Boolean(sku)),
));

export const ALL_PAGES_VERIFIED_DRAFTS: ImportedSkuDraft[] = results
  .filter((item): item is CatalogResult & { sku: string } => Boolean(item.sku) && !item.skipped)
  .filter((item) => {
    const evidenceDomains = new Set((item.sourceUrls || [])
      .map(({ url }) => new URL(url).hostname.replace(/^www\./, ""))
      .filter((domain) => !isReferenceDomain(domain)));
    const imageDomains = new Set((item.imageSources || [])
      .map(({ domain }) => domain.replace(/^www\./, ""))
      .filter((domain) => !isReferenceDomain(domain)));
    return evidenceDomains.size >= 2 && imageDomains.size >= 2 && (item.mediaUrls?.length || 0) >= 2;
  })
  .map((item) => {
    const brand = item.brand || "브랜드 확인 필요";
    const nameEn = cleanName(item.nameEn, brand, item.sku);
    const nameKo = cleanName(item.nameKo, brand, item.sku);
    const mediaUrls = (item.mediaUrls || []).slice(0, 12);
    const evidenceDomains = new Set((item.sourceUrls || [])
      .map(({ url }) => new URL(url).hostname.replace(/^www\./, ""))
      .filter((domain) => !isReferenceDomain(domain)));
    const imageDomains = new Set((item.imageSources || [])
      .map(({ domain }) => domain.replace(/^www\./, ""))
      .filter((domain) => !isReferenceDomain(domain)));
    const description = [
      `${nameKo}입니다.`,
      `품번 ${item.sku} 기준으로 서로 다른 ${evidenceDomains.size}개 외부 사이트에서 모델과 색상을 교차 확인했습니다.`,
      `${imageDomains.size}개 외부 사이트에서 확보한 고화질 사진 중 배경 제거 또는 흰 배경 상품컷을 우선 구성했습니다.`,
      "판매 전 실제 선택 옵션과 사이즈를 확인해 주세요.",
    ].join(" ");
    return {
      sku: item.sku,
      brand,
      nameKo,
      nameEn,
      category: item.category || "신발",
      productType: item.productType || "shoes",
      subcategory: item.subcategory || "스니커즈",
      gender: item.gender,
      description,
      detailContent: description,
      imageUrl: mediaUrls[0],
      mediaUrls,
      sourceUrls: item.sourceUrls || [],
      sourceNote: `${evidenceDomains.size}개 외부 사이트에서 품번·색상 교차 확인 · ${imageDomains.size}개 외부 사이트의 고화질 사진 사용 · 배경 제거 또는 흰 배경 사진 우선`,
    };
  });
