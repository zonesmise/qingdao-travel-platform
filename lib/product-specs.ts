export type ProductType = "shoes" | "clothing" | "bags" | "belts" | "wallets" | "accessories";

export type ProductSpecField = {
  key: string;
  label: string;
  placeholder: string;
};

export const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string; description: string }> = [
  { value: "shoes", label: "신발", description: "운동화·구두·샌들 등" },
  { value: "clothing", label: "의류", description: "상의·하의·아우터 등" },
  { value: "bags", label: "가방", description: "백팩·토트·크로스백 등" },
  { value: "belts", label: "벨트", description: "패션·정장 벨트" },
  { value: "wallets", label: "지갑", description: "반지갑·장지갑·카드지갑 등" },
  { value: "accessories", label: "기타 패션잡화", description: "모자·장갑·소품 등" },
];

export const PRODUCT_SPEC_FIELDS: Record<ProductType, ProductSpecField[]> = {
  shoes: [
    { key: "officialColor", label: "색상", placeholder: "예: 화이트 / 블랙" },
    { key: "gender", label: "성별·착용대상", placeholder: "예: 남녀공용, 여성용" },
    { key: "material", label: "주요 소재", placeholder: "예: 천연가죽, 메시, 고무" },
    { key: "sizeGuide", label: "사이즈 안내", placeholder: "예: 230~290mm, 5mm 단위" },
    { key: "releaseDate", label: "출시일", placeholder: "예: 2026-03-16" },
    { key: "countryOfOrigin", label: "제조국", placeholder: "예: 베트남" },
  ],
  clothing: [
    { key: "color", label: "색상", placeholder: "예: 블랙, 네이비" },
    { key: "material", label: "소재·혼용률", placeholder: "예: 면 80% / 폴리에스터 20%" },
    { key: "fit", label: "핏", placeholder: "예: 레귤러핏, 오버핏" },
    { key: "season", label: "계절", placeholder: "예: 봄·가을, 사계절" },
    { key: "sizeGuide", label: "사이즈 안내", placeholder: "예: S~XL / 상세 실측 참고" },
    { key: "care", label: "세탁·관리", placeholder: "예: 찬물 단독 세탁" },
  ],
  bags: [
    { key: "color", label: "색상", placeholder: "예: 블랙" },
    { key: "material", label: "소재", placeholder: "예: 나일론 / 천연가죽" },
    { key: "dimensions", label: "크기", placeholder: "예: 가로 30 × 세로 22 × 폭 12cm" },
    { key: "weight", label: "무게", placeholder: "예: 약 650g" },
    { key: "strap", label: "스트랩", placeholder: "예: 길이 조절·탈부착 가능" },
    { key: "closure", label: "잠금·수납", placeholder: "예: 지퍼 잠금 / 내부 포켓 2개" },
  ],
  belts: [
    { key: "color", label: "색상", placeholder: "예: 블랙 / 실버 버클" },
    { key: "material", label: "소재", placeholder: "예: 소가죽 / 메탈" },
    { key: "width", label: "벨트 폭", placeholder: "예: 3.5cm" },
    { key: "totalLength", label: "총길이", placeholder: "예: 105cm" },
    { key: "buckle", label: "버클", placeholder: "예: 핀 버클 / 무광 실버" },
    { key: "sizeGuide", label: "사이즈 안내", placeholder: "예: 허리 28~34인치 권장" },
  ],
  wallets: [
    { key: "color", label: "색상", placeholder: "예: 블랙" },
    { key: "material", label: "소재", placeholder: "예: 카프스킨" },
    { key: "dimensions", label: "크기", placeholder: "예: 가로 11 × 세로 9cm" },
    { key: "walletType", label: "형태", placeholder: "예: 반지갑, 카드지갑" },
    { key: "cardSlots", label: "수납 구성", placeholder: "예: 카드 6 / 지폐 1 / 동전 1" },
    { key: "closure", label: "잠금 방식", placeholder: "예: 오픈형, 스냅 버튼" },
  ],
  accessories: [
    { key: "color", label: "색상", placeholder: "예: 블랙" },
    { key: "material", label: "소재", placeholder: "예: 면 / 폴리에스터" },
    { key: "dimensions", label: "크기", placeholder: "예: 가로 × 세로 × 높이" },
    { key: "includedItems", label: "구성품", placeholder: "예: 본품 / 파우치 / 보증서" },
    { key: "countryOfOrigin", label: "제조국", placeholder: "예: 이탈리아" },
  ],
};

export function normalizeProductType(value: unknown): ProductType {
  const matched = PRODUCT_TYPE_OPTIONS.find((option) => option.value === String(value));
  return matched?.value ?? "accessories";
}

export function guessProductType(category: unknown): ProductType {
  const value = String(category ?? "").replace(/\s+/g, "");
  if (/신발|슈즈|운동화|스니커|구두|샌들/.test(value)) return "shoes";
  if (/의류|상의|하의|아우터|티셔츠|바지|재킷/.test(value)) return "clothing";
  if (/가방|백팩|토트|크로스백|숄더백/.test(value)) return "bags";
  if (/벨트|밸트/.test(value)) return "belts";
  if (/지갑|카드지갑|장지갑|반지갑/.test(value)) return "wallets";
  return "accessories";
}

export function cleanProductTypeFields(productType: ProductType, value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    PRODUCT_SPEC_FIELDS[productType]
      .map((field) => [field.key, String(source[field.key] ?? "").trim().slice(0, 180)] as const)
      .filter(([, fieldValue]) => fieldValue),
  );
}
