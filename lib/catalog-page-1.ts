import pageOneResults from "../generated/page-1.json";

import type { ImportedSkuDraft } from "./sku-draft-catalog";

type VerifiedPageResult = {
  sku?: string;
  album?: { sku?: string; albumUrl?: string };
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
  sources?: Array<{ url: string; title?: string; snippet?: string }>;
  imageSources?: Array<{ sourceUrl: string; domain: string }>;
  skipped?: boolean;
};

const PRODUCT_NAMES: Record<string, { ko: string; en: string }> = {
  "749571-002": { ko: "나이키 클래식 코르테즈 레더 트리플 블랙", en: "Nike Classic Cortez Leather Triple Black" },
  "DM4044-109": { ko: "나이키 코르테즈 레더 DM4044-109", en: "Nike Cortez Leather DM4044-109" },
  "DM4044-112": { ko: "나이키 코르테즈 DM4044-112", en: "Nike Cortez DM4044-112" },
  "DN1791-100": { ko: "나이키 여성 코르테즈 화이트 블랙 라이트 포토 블루", en: "Nike Women's Cortez White Black Light Photo Blue" },
  "DN1791-102": { ko: "나이키 여성 코르테즈 화이트 블루", en: "Nike Women's Cortez White Blue" },
  "DN1791-116": { ko: "나이키 여성 코르테즈 레더 세일 실트 레드", en: "Nike Women's Cortez Leather Sail Silt Red" },
  "DR1413-001": { ko: "유니온 × 나이키 코르테즈 SP 오프 누아", en: "Union x Nike Cortez SP Off Noir" },
  "DR1413-100": { ko: "유니온 × 나이키 코르테즈 레몬 프로스트", en: "Union x Nike Cortez Lemon Frost" },
  "DR1413-200": { ko: "유니온 × 나이키 코르테즈 SP 세서미", en: "Union x Nike Cortez SP Sesame" },
  "DZ2795-001": { ko: "나이키 여성 코르테즈 DZ2795-001", en: "Nike Women's Cortez DZ2795-001" },
  "DZ2795-202": { ko: "나이키 여성 코르테즈 텍스타일 DZ2795-202", en: "Nike Women's Cortez Textile DZ2795-202" },
  "DZ2795-601": { ko: "나이키 여성 코르테즈 피칸테 레드", en: "Nike Women's Cortez Picante Red" },
  "DZ3239-002": { ko: "CLOT × 나이키 코르테즈 클로테즈 블랙", en: "CLOT x Nike Cortez Clotez Black" },
  "DZ3239-100": { ko: "CLOT × 나이키 코르테즈 클로테즈 포레스트 검프", en: "CLOT x Nike Cortez Clotez Forrest Gump" },
  "FD2334-133": { ko: "나이키 여성 코르테즈 알로에 베라", en: "Nike Women's Cortez Aloe Vera" },
  "FJ2530-302": { ko: "나이키 여성 코르테즈 빈티지 스웨이드 그린", en: "Nike Women's Cortez Vintage Suede Green" },
  "FJ5480-100": { ko: "나이키 코트 비전 로우 화이트 오일 그린", en: "Nike Court Vision Low White Oil Green" },
  "FN7650-030": { ko: "나이키 여성 코르테즈 슈퍼소닉", en: "Nike Women's Cortez Supersonic" },
  "FQ8075-133": { ko: "나이키 코트 비전 로우 세일 블랙 검", en: "Nike Court Vision Low Sail Black Gum" },
  "FV3639-171": { ko: "나이키 여성 코르테즈 세일", en: "Nike Women's Cortez Sail" },
  "FZ3020-919": { ko: "나이키 여성 코르테즈 둔비처 시드니 리틀", en: "Nike Women's Cortez Doernbecher Sydney Little" },
  "HF0263-002": { ko: "나이키 여성 코르테즈 텍스타일 HF0263-002", en: "Nike Women's Cortez Textile HF0263-002" },
  "HF0263-200": { ko: "나이키 코르테즈 텍스타일 HF0263-200", en: "Nike Cortez Textile HF0263-200" },
  "HQ1500-043": { ko: "나이키 여성 코르테즈 프리미엄 레더 퓨어 플래티넘", en: "Nike Women's Cortez Premium Leather Pure Platinum" },
  "HQ2593-102": { ko: "나이키 여성 페가수스 프리미엄 화이트 메탈릭 실버", en: "Nike Women's Pegasus Premium White Metallic Silver" },
  "HQ2593-601": { ko: "나이키 여성 페가수스 프리미엄 애트모스피어 핑크", en: "Nike Women's Pegasus Premium Atmosphere Pink" },
  "HQ3490-099": { ko: "나이키 코르테즈 SE HQ3490-099", en: "Nike Cortez SE HQ3490-099" },
  "HV6724-001": { ko: "나이키 코르테즈 재키 로빈슨 데이", en: "Nike Cortez Jackie Robinson Day" },
  "IF1764-100": { ko: "나이키 여성 코르테즈 세일 아틱 오렌지", en: "Nike Women's Cortez Sail Arctic Orange" },
  "IM4843-010": { ko: "나이키 코르테즈 SE 티엠포 팩 블랙", en: "Nike Cortez SE Tiempo Pack Black" },
  "U19065WS": { ko: "뉴발란스 1906L 로즈우드", en: "New Balance 1906L Rosewood" },
  "U190663V": { ko: "뉴발란스 1906L U190663V", en: "New Balance 1906L U190663V" },
  "U190667K": { ko: "뉴발란스 1906L 네온 실버 메탈릭", en: "New Balance 1906L Neon Silver Metallic" },
};

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "DN1791-116": "클래식한 코르테즈 실루엣을 세일과 실트 레드 배색으로 완성한 여성용 로우탑 스니커즈입니다. 레더 갑피와 폼 미드솔을 적용해 깔끔한 복고풍 스타일과 가벼운 쿠셔닝을 제공하며, 일상복에 편하게 매치할 수 있습니다. 품번은 DN1791-116이며 색상은 세일/실트 레드입니다.",
};

function normalizeBrand(brand: string) {
  if (brand === "NIKE") return "NIKE";
  if (brand === "NEW BALANCE") return "NEW BALANCE";
  return brand;
}

function isReferenceOnlyDomain(domain: string) {
  return domain.replace(/^www\./, "").endsWith("yupoo.com");
}

function externalImageEntries(item: VerifiedPageResult) {
  return (item.imageSources || [])
    .map((source, index) => ({ source, mediaUrl: (item.mediaUrls || [])[index] }))
    .filter(({ source, mediaUrl }) => mediaUrl && !isReferenceOnlyDomain(source.domain));
}

function externalImageDomainCount(item: VerifiedPageResult) {
  return new Set(externalImageEntries(item).map(({ source }) => source.domain.replace(/^www\./, ""))).size;
}

export const PAGE_1_REVIEW_PENDING_SKUS = (pageOneResults as VerifiedPageResult[])
  .filter((item) => item.skipped || externalImageEntries(item).length < 1)
  .map((item) => item.sku || item.album?.sku)
  .filter((sku): sku is string => Boolean(sku));

function resultSku(item: VerifiedPageResult) {
  return item.sku || item.album?.sku || "";
}

function fallbackBrand(sku: string) {
  if (/^U190/i.test(sku)) return "NEW BALANCE";
  if (/^(?:\d{6}|C[DJ]|D[DMNRZ]|F[DJNQZ]|H[FQ]|I[FM])\d/i.test(sku)) return "NIKE";
  return "브랜드 확인 필요";
}

function evidenceRows(item: VerifiedPageResult) {
  return item.sourceUrls || (item.sources || []).map((source) => ({
    url: source.url,
    label: `${new URL(source.url).hostname.replace(/^www\./, "")} 품번·모델 확인`,
  }));
}

export const PAGE_1_DRAFTS: ImportedSkuDraft[] = (pageOneResults as VerifiedPageResult[])
  .map((item) => {
    const sku = resultSku(item);
    const verified = !item.skipped && externalImageEntries(item).length >= 1;
    const names = PRODUCT_NAMES[sku];
    const brand = normalizeBrand(item.brand || fallbackBrand(sku));
    const nameKo = names?.ko || item.nameKo || `${brand} ${sku}`;
    const nameEn = names?.en || item.nameEn || `${brand} ${sku}`;
    const mediaUrls = verified ? externalImageEntries(item).map(({ mediaUrl }) => mediaUrl).slice(0, 12) : [];
    const sources = evidenceRows(item);
    const evidenceDomains = new Set(sources.map(({ url }) => new URL(url).hostname.replace(/^www\./, "")).filter((domain) => !isReferenceOnlyDomain(domain)));
    const description = PRODUCT_DESCRIPTIONS[sku] || (verified
      ? `${nameKo}입니다. 품번 ${sku} 기준으로 ${evidenceDomains.size}개 외부 사이트에서 모델과 색상을 교차 확인했습니다. 판매 전 실제 선택 옵션과 사이즈를 확인해 주세요.`
      : `${nameKo} 비공개 임시상품입니다. 품번 ${sku}은 등록했으며 외부 웹사진을 추가 검수하고 있습니다. 공급처 사진은 최종 갤러리에 사용하지 않습니다.`);
    return {
      sku,
      brand,
      nameKo,
      nameEn,
      category: item.category || "신발",
      productType: item.productType || "shoes",
      subcategory: item.subcategory || "스니커즈",
      gender: item.gender,
      description,
      detailContent: PRODUCT_DESCRIPTIONS[sku] || item.detailContent || description,
      imageUrl: mediaUrls[0],
      mediaUrls,
      sourceUrls: sources,
      sourceNote: verified
        ? `${evidenceDomains.size}개 외부 사이트에서 품번·색상 교차 확인 · ${externalImageDomainCount(item)}개 외부 사이트의 웹 상품사진 사용 · 확보 가능한 최고 화질 우선`
        : `1페이지 등록 완료 · 외부 웹사진 재검수 대기 · 공급처 사진 최종 갤러리 미사용`,
    };
  })
  .filter((item) => Boolean(item.sku));

export const PAGE_1_VERIFIED_DRAFTS = PAGE_1_DRAFTS.filter((item) => (item.mediaUrls?.length || 0) >= 1);
