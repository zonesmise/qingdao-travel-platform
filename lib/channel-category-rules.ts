import { categoryEntryFor, type StoreCategoryConfig } from "./category-config";
import { canonicalBrandAliases } from "./canonical-brands";

type ChannelCategoryRule = {
  label?: string;
  ruleType?: "brand" | "category";
  ruleValue?: string;
  ruleCategory?: string;
};

type ChannelCategoryProduct = {
  id?: unknown;
  brand?: unknown;
  category?: unknown;
};

function singleCategory(products: ChannelCategoryProduct[]) {
  const categories = Array.from(new Set(products.map((product) => String(product.category || "").trim()).filter(Boolean)));
  return categories.length === 1 ? categories[0] : "";
}

function brandKey(value: unknown) {
  return String(value || "").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLocaleLowerCase("en-US");
}

export function brandMatchesChannelRule(productBrand: unknown, ruleBrand: unknown) {
  const productKeys = new Set(canonicalBrandAliases(String(productBrand || "").trim()).map(brandKey).filter(Boolean));
  return canonicalBrandAliases(String(ruleBrand || "").trim()).map(brandKey).filter(Boolean).some((key) => productKeys.has(key));
}

export function inferChannelBrandRuleCategory(
  entry: ChannelCategoryRule,
  entries: ChannelCategoryRule[],
  products: ChannelCategoryProduct[],
  config: StoreCategoryConfig,
  channelProductIds: number[],
) {
  const stored = String(entry.ruleCategory || "").trim();
  if (stored) return stored;

  const selectedIds = new Set(channelProductIds.map(Number).filter((id) => id > 0));
  const selectedProducts = products.filter((product) => selectedIds.has(Number(product.id)));
  const brand = String(entry.ruleValue || entry.label || "").trim();
  const brandCategory = singleCategory(selectedProducts.filter((product) => brandMatchesChannelRule(product.brand, brand)));
  if (brandCategory) return brandCategory;

  const channelCategory = singleCategory(selectedProducts);
  if (channelCategory) return channelCategory;

  const navigationCategories = Array.from(new Set(entries
    .filter((candidate) => candidate.ruleType === "category" && candidate.ruleValue)
    .map((candidate) => categoryEntryFor(config, String(candidate.ruleValue || "")))
    .map((category) => String(category?.sourceName || category?.name || "").trim())
    .filter(Boolean)));
  return navigationCategories.length === 1 ? navigationCategories[0] : "";
}
