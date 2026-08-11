export type StoreCategory = {
  id: string;
  name: string;
  sourceName?: string;
  visible: boolean;
  children: StoreCategoryChild[];
};

export type StoreCategoryChild = {
  id: string;
  name: string;
  sourceName?: string;
  visible: boolean;
  children: StoreCategoryGrandchild[];
};

export type StoreCategoryGrandchild = {
  id: string;
  name: string;
  sourceName?: string;
  visible: boolean;
};

export type StoreCategoryConfig = {
  menuLimit: number;
  categories: StoreCategory[];
};

export const DEFAULT_CATEGORY_NAMES = ["생활", "식품", "디지털", "주방", "뷰티", "패션", "기타"];

function categoryId(prefix: string, index: number, name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${prefix}-${slug || index + 1}`;
}

export function legacyCategoryConfig(names = DEFAULT_CATEGORY_NAMES): StoreCategoryConfig {
  return {
    menuLimit: 7,
    categories: names.map((name, index) => ({
      id: categoryId("category", index, name),
      name,
      visible: true,
      children: [],
    })),
  };
}

export function parseCategoryConfig(
  value: string | undefined,
  legacyNames = DEFAULT_CATEGORY_NAMES,
): StoreCategoryConfig {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || !Array.isArray(parsed.categories)) return legacyCategoryConfig(legacyNames);
    const categories = parsed.categories
      .map((rawEntry: unknown, index: number) => {
        const entry = rawEntry && typeof rawEntry === "object" ? rawEntry as Record<string, unknown> : {};
        return {
          id: String(entry.id || categoryId("category", index, String(entry.name || ""))),
          name: String(entry.name || "").trim(),
          sourceName: String(entry.sourceName || "").trim() || undefined,
          visible: entry.visible !== false,
          children: Array.isArray(entry.children)
            ? entry.children
                .map((rawChild: unknown, childIndex: number) => {
                  const child = rawChild && typeof rawChild === "object" ? rawChild as Record<string, unknown> : {};
                  return {
                    id: String(child.id || categoryId(`child-${index + 1}`, childIndex, String(child.name || ""))),
                    name: String(child.name || "").trim(),
                    sourceName: String(child.sourceName || "").trim() || undefined,
                    visible: child.visible !== false,
                    children: Array.isArray(child.children)
                      ? child.children
                          .map((rawGrandchild: unknown, grandchildIndex: number) => {
                            const grandchild = rawGrandchild && typeof rawGrandchild === "object" ? rawGrandchild as Record<string, unknown> : {};
                            return {
                              id: String(grandchild.id || categoryId(`grandchild-${index + 1}-${childIndex + 1}`, grandchildIndex, String(grandchild.name || ""))),
                              name: String(grandchild.name || "").trim(),
                              sourceName: String(grandchild.sourceName || "").trim() || undefined,
                              visible: grandchild.visible !== false,
                            };
                          })
                          .filter((grandchild: StoreCategoryGrandchild) => grandchild.name)
                      : [],
                  };
                })
                .filter((child: StoreCategoryChild) => child.name)
            : [],
        };
      })
      .filter((entry: StoreCategory) => entry.name);
    return {
      menuLimit: Math.max(5, Math.min(10, Number(parsed.menuLimit || 7))),
      categories: categories.length ? categories : legacyCategoryConfig(legacyNames).categories,
    };
  } catch {
    return legacyCategoryConfig(legacyNames);
  }
}

export function selectableCategoryNames(config: StoreCategoryConfig) {
  return config.categories.flatMap((category) => [
    category.name,
    ...category.children.flatMap((child) => [child.name, ...child.children.map((grandchild) => grandchild.name)]),
  ]);
}

export function parentCategoryNames(config: StoreCategoryConfig) {
  return config.categories.map((category) => category.name);
}

export function categoryEntryFor(
  config: StoreCategoryConfig,
  name: string,
) {
  return config.categories.find(
    (category) =>
      category.name === name ||
      category.children.some((child) => child.name === name || child.children.some((grandchild) => grandchild.name === name)),
  );
}

export function categoryChildNames(config: StoreCategoryConfig, parent: string) {
  return config.categories.find((category) => category.name === parent)?.children.flatMap((child) => [child.name, ...child.children.map((grandchild) => grandchild.name)]) ?? [];
}

export function productMatchesCategory(
  product: { category?: unknown; subcategory?: unknown },
  selectedName: string,
  config: StoreCategoryConfig,
) {
  if (selectedName === "전체") return true;
  const productCategory = String(product.category ?? "").trim();
  const productSubcategory = String(product.subcategory ?? "").trim();
  const selected = categoryEntryFor(config, selectedName);
  if (!selected) return productCategory === selectedName || productSubcategory === selectedName;
  const selectedSourceName = selected.sourceName || selected.name;

  if (selected.name === selectedName) {
    return productCategory === selectedSourceName || selected.children.some((child) =>
      productCategory === (child.sourceName || child.name) ||
      child.children.some((grandchild) => productCategory === (grandchild.sourceName || grandchild.name)),
    );
  }

  const selectedChild = selected.children.find((child) => child.name === selectedName);
  const selectedGrandchild = selected.children.flatMap((child) => child.children).find((grandchild) => grandchild.name === selectedName);
  if (selectedChild) {
    const exactNames = new Set([
      selectedChild.sourceName || selectedChild.name,
      ...selectedChild.children.map((grandchild) => grandchild.sourceName || grandchild.name),
    ]);
    return exactNames.has(productSubcategory) || exactNames.has(productCategory);
  }
  const selectedGrandchildSourceName = selectedGrandchild?.sourceName || selectedGrandchild?.name || selectedName;
  return productSubcategory === selectedGrandchildSourceName || productCategory === selectedGrandchildSourceName;
}

export function categoryProductNames(category: StoreCategory) {
  return [
    category.sourceName || category.name,
    ...category.children.flatMap((child) => [
      child.sourceName || child.name,
      ...child.children.map((grandchild) => grandchild.sourceName || grandchild.name),
    ]),
  ];
}
