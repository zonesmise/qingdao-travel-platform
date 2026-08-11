"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useRef,
  useState,
} from "react";
import SafeProductImage from "./SafeProductImage";
import {
  categoryChildNames,
  categoryEntryFor,
  type StoreCategoryConfig,
} from "../lib/category-config";
import {
  guessProductType,
  normalizeProductType,
  PRODUCT_SPEC_FIELDS,
  PRODUCT_TYPE_OPTIONS,
  type ProductType,
} from "../lib/product-specs";

type MediaStatus = "ready" | "optimizing" | "uploading" | "error";

type ProductMedia = {
  id: string;
  url: string;
  alt: string;
  status: MediaStatus;
  fileName?: string;
  size?: number;
  width?: number;
  height?: number;
  error?: string;
  uploaded?: boolean;
};

type ProductOption = {
  id: string;
  name: string;
  values: string[];
  valueText: string;
};
type ProductVariant = { key: string; options: Record<string, string>; sku: string; stock: number; additionalPrice: number; active: boolean };

type ProductValues = {
  name: string;
  nameEn: string;
  productCode: string;
  styleNumber: string;
  category: string;
  subcategory: string;
  productType: ProductType;
  brand: string;
  badge: string;
  status: "active" | "inactive" | "draft";
  description: string;
  detailContent: string;
  shippingInfo: string;
  pointPrice: string;
  pointUsageMode: "none" | "partial" | "full";
  pointMaxPercent: string;
  cashPaymentEnabled: boolean;
  rewardOnCashOnly: boolean;
  stock: string;
};

type Props = {
  item?: any;
  categoryConfig: StoreCategoryConfig;
  brands: string[];
  brandGroups?: Record<string, string[]>;
  pointName: string;
  variantEnabled?: boolean;
  close: () => void;
  act: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
  busy: boolean;
};

const MAX_MEDIA = 12;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 900 * 1024;

function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseJson(value: unknown, fallback: unknown) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return fallback;
  }
}

function initialMedia(item: any): ProductMedia[] {
  const saved = parseJson(item?.media_json, []);
  if (Array.isArray(saved) && saved.length) {
    return saved
      .map((entry, index) => {
        if (typeof entry === "string") {
          return {
            id: uniqueId(),
            url: entry,
            alt: `${String(item?.name || "상품")} ${index + 1}`,
            status: "ready" as const,
          };
        }
        const url = String(entry?.url ?? "").trim();
        if (!url) return null;
        return {
          id: uniqueId(),
          url,
          alt: String(entry?.alt ?? `${String(item?.name || "상품")} ${index + 1}`).trim(),
          status: "ready" as const,
          width: Number(entry?.width ?? 0) || undefined,
          height: Number(entry?.height ?? 0) || undefined,
        };
      })
      .filter(Boolean) as ProductMedia[];
  }

  const extras = parseJson(item?.image_urls, []);
  return Array.from(
    new Set([
      String(item?.image_url ?? "").trim(),
      ...(Array.isArray(extras) ? extras.map(String) : []),
    ].filter(Boolean)),
  ).map((url, index) => ({
    id: uniqueId(),
    url,
    alt: `${String(item?.name || "상품")} ${index + 1}`,
    status: "ready" as const,
  }));
}

function initialOptions(item: any): ProductOption[] {
  const saved = parseJson(item?.options_json, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .map((entry) => {
      const values = Array.isArray(entry?.values)
        ? Array.from(new Set(entry.values.map(String).map((value: string) => value.trim()).filter(Boolean)))
        : [];
      return {
        id: uniqueId(),
        name: String(entry?.name ?? "").trim(),
        values,
        valueText: values.join(", "),
      };
    })
    .filter((entry) => entry.name || entry.values.length)
    .slice(0, 3);
}

function formatBytes(value = 0) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function fileError(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "JPG, PNG, WEBP 사진만 올릴 수 있습니다.";
  }
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) {
    return "사진 한 장은 20MB 이하여야 합니다.";
  }
  return "";
}

async function optimizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvasSize = 1200;
  const contentSize = 1080;
  const scale = Math.min(contentSize / bitmap.width, contentSize / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error("사진을 처리할 수 없는 브라우저입니다.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.drawImage(
    bitmap,
    Math.round((canvasSize - width) / 2),
    Math.round((canvasSize - height) / 2),
    width,
    height,
  );
  bitmap.close();

  let blob: Blob | null = null;
  for (const quality of [0.88, 0.82, 0.76, 0.7]) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
  }
  if (!blob || blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("사진 용량을 자동으로 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
  }
  const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9가-힣_-]+/gi, "-");
  return {
    file: new File([blob], `${stem || "product"}.webp`, { type: "image/webp" }),
    width: canvasSize,
    height: canvasSize,
    originalSize: file.size,
  };
}

async function responsePayload(response: Response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return { error: text || `업로드 서버 오류 (${response.status})` };
}

function combinationCount(options: ProductOption[]) {
  return options
    .filter((option) => option.name && option.values.length)
    .reduce((total, option) => total * option.values.length, 1);
}

function buildOptionCombinations(options: ProductOption[]) {
  const valid = options.filter((option) => option.name && option.values.length);
  if (!valid.length) return [] as Array<Record<string, string>>;
  return valid.reduce<Array<Record<string, string>>>((rows, option) => rows.flatMap((row) => option.values.map((value) => ({ ...row, [option.name]: value }))), [{}]);
}

const variantKey = (options: Record<string, string>) => Object.entries(options).map(([name, value]) => `${name}=${value}`).join("|");

export default function AdminProductEditor({
  item,
  categoryConfig,
  brands,
  brandGroups = {},
  pointName,
  variantEnabled = false,
  close,
  act,
  busy,
}: Props) {
  const categoryEntry = categoryEntryFor(categoryConfig, String(item?.category ?? ""));
  const initialCategory = categoryEntry?.name ?? categoryConfig.categories[0]?.name ?? "기타";
  const initialSubcategory = String(item?.subcategory ?? "").trim() || (
    categoryEntry && categoryEntry.name !== String(item?.category ?? "")
      ? String(item?.category ?? "")
      : ""
  );
  const savedTypeFields = parseJson(item?.type_fields_json, {});
  const initialProductType = item?.product_type
    ? normalizeProductType(item.product_type)
    : guessProductType(initialCategory);
  const initialBrand = String(item?.brand ?? brands.find((brand) => {
    const groups = brandGroups[brand] || [];
    return groups.length === 0 || groups.includes(initialCategory);
  }) ?? "");
  const [values, setValues] = useState<ProductValues>({
    name: String(item?.name ?? ""),
    nameEn: String(item?.name_en ?? ""),
    productCode: String(item?.product_code ?? ""),
    styleNumber: String(item?.style_number ?? ""),
    category: initialCategory,
    subcategory: initialSubcategory,
    productType: initialProductType,
    brand: initialBrand,
    badge: String(item?.badge ?? ""),
    status:
      item?.status === "inactive" || item?.status === "draft"
        ? item.status
        : "active",
    description: String(item?.description ?? ""),
    detailContent: String(item?.detail_content ?? ""),
    shippingInfo: String(item?.shipping_info ?? ""),
    pointPrice: String(item?.point_price ?? "999"),
    pointUsageMode: ["none", "partial"].includes(String(item?.point_usage_mode))
      ? item.point_usage_mode
      : "full",
    pointMaxPercent: String(item?.point_max_percent ?? 100),
    cashPaymentEnabled: item ? Boolean(item.cash_payment_enabled) : true,
    rewardOnCashOnly: item ? Boolean(item.reward_on_cash_only) : true,
    stock: String(item?.stock ?? "999"),
  });
  const [media, setMedia] = useState<ProductMedia[]>(() => initialMedia(item));
  const [typeFields, setTypeFields] = useState<Record<string, string>>(() =>
    savedTypeFields && typeof savedTypeFields === "object"
      ? Object.fromEntries(Object.entries(savedTypeFields as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]))
      : {},
  );
  const [options, setOptions] = useState<ProductOption[]>(() => initialOptions(item));
  const [variants, setVariants] = useState<ProductVariant[]>(() => {
    const saved = parseJson(item?.variants_json, []);
    return Array.isArray(saved) ? saved : [];
  });
  const [urlInput, setUrlInput] = useState("");
  const [formError, setFormError] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [activeSection, setActiveSection] = useState("basic");
  const fileRef = useRef<HTMLInputElement>(null);

  const readyMedia = media.filter((entry) => entry.status === "ready");
  const uploading = media.some((entry) =>
    entry.status === "optimizing" || entry.status === "uploading",
  );
  const optionCombinations = combinationCount(options);
  const combinations = buildOptionCombinations(options);
  const normalizedVariants = combinations.map((combination) => {
    const key = variantKey(combination);
    return variants.find((entry) => entry.key === key) || { key, options: combination, sku: "", stock: 0, additionalPrice: 0, active: true };
  });
  const updateVariant = (key: string, patch: Partial<ProductVariant>) => setVariants((current) => {
    const base = normalizedVariants.find((entry) => entry.key === key)!;
    return current.some((entry) => entry.key === key) ? current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry) : [...current, { ...base, ...patch }];
  });
  const completionChecks = [
    Boolean(values.name.trim()),
    Boolean(values.productCode.trim()),
    Boolean(values.styleNumber.trim()),
    readyMedia.length > 0,
    Number(values.pointPrice) > 0,
    Boolean(values.category),
    Boolean(values.description.trim()),
    Boolean(values.detailContent.trim()),
  ];
  const completion = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
  );

  const previewMedia = readyMedia[0];
  const subcategories = categoryChildNames(categoryConfig, values.category);
  const scopedBrands = brands.filter((brand) => {
    const groups = brandGroups[brand] || [];
    return groups.length === 0 || groups.includes(values.category) || brand === values.brand;
  });
  const sections = [
    ["basic", "01", "기본정보"],
    ["media", "02", `상품사진 ${readyMedia.length}`],
    ["options", "03", "옵션·재고"],
    ["detail", "04", "상세·배송"],
    ["publish", "05", "판매설정"],
  ];

  const update = (key: keyof ProductValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const updateTypeField = (key: string, value: string) => {
    setTypeFields((current) => ({ ...current, [key]: value }));
  };

  async function uploadOne(file: File) {
    const localUrl = URL.createObjectURL(file);
    const id = uniqueId();
    setMedia((current) => [
      ...current,
      {
        id,
        url: localUrl,
        alt: values.name.trim() || file.name.replace(/\.[^.]+$/, ""),
        status: "optimizing",
        fileName: file.name,
        size: file.size,
      },
    ]);

    try {
      const optimized = await optimizeImage(file);
      setMedia((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "uploading",
                size: optimized.file.size,
                width: optimized.width,
                height: optimized.height,
              }
            : entry,
        ),
      );
      const body = new FormData();
      body.set("image", optimized.file);
      const response = await fetch(
        `/api/product-image?productId=${encodeURIComponent(String(item?.id || "draft"))}`,
        { method: "POST", body, credentials: "include" },
      );
      const payload = await responsePayload(response);
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "사진을 올리지 못했습니다.");
      }
      setMedia((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                url: String(payload.url),
                status: "ready",
                size: optimized.file.size,
                width: optimized.width,
                height: optimized.height,
                error: "",
                uploaded: true,
              }
            : entry,
        ),
      );
      URL.revokeObjectURL(localUrl);
    } catch (cause) {
      setMedia((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "error",
                error: cause instanceof Error ? cause.message : "사진 업로드에 실패했습니다.",
              }
            : entry,
        ),
      );
    }
  }

  function addFiles(files: File[]) {
    setFormError("");
    const available = MAX_MEDIA - media.length;
    if (available < 1) {
      setFormError(`상품 사진은 최대 ${MAX_MEDIA}장까지 등록할 수 있습니다.`);
      return;
    }
    const selected = files.slice(0, available);
    const invalid = selected.find(fileError);
    if (invalid) {
      setFormError(`${invalid.name}: ${fileError(invalid)}`);
      return;
    }
    void Promise.all(selected.map(uploadOne));
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function addImageUrl() {
    const url = urlInput.trim();
    if (!/^https?:\/\//i.test(url) && !/^\/catalog\/[a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp)$/i.test(url)) {
      setFormError("사진 주소는 https://, http:// 또는 /catalog/ 경로를 사용해야 합니다.");
      return;
    }
    if (media.length >= MAX_MEDIA) {
      setFormError(`상품 사진은 최대 ${MAX_MEDIA}장까지 등록할 수 있습니다.`);
      return;
    }
    if (media.some((entry) => entry.url === url)) {
      setFormError("이미 추가한 사진 주소입니다.");
      return;
    }
    setMedia((current) => [
      ...current,
      {
        id: uniqueId(),
        url,
        alt: values.name.trim() || "상품 이미지",
        status: "ready",
      },
    ]);
    setUrlInput("");
    setFormError("");
  }

  function moveMedia(id: string, direction: -1 | 1) {
    setMedia((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makeCover(id: string) {
    setMedia((current) => {
      const selected = current.find((entry) => entry.id === id);
      return selected
        ? [selected, ...current.filter((entry) => entry.id !== id)]
        : current;
    });
  }

  function removeMedia(entry: ProductMedia) {
    setMedia((current) => current.filter((mediaEntry) => mediaEntry.id !== entry.id));
    if (entry.url.startsWith("blob:")) URL.revokeObjectURL(entry.url);
    if (entry.uploaded && entry.url.startsWith("/api/product-image?")) {
      void fetch(entry.url, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => undefined);
    }
  }

  function cancelEditor() {
    media.forEach((entry) => {
      if (entry.url.startsWith("blob:")) URL.revokeObjectURL(entry.url);
      if (entry.uploaded && entry.url.startsWith("/api/product-image?")) {
        void fetch(entry.url, {
          method: "DELETE",
          credentials: "include",
          keepalive: true,
        }).catch(() => undefined);
      }
    });
    close();
  }

  function dropMedia(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setMedia((current) => {
      const from = current.findIndex((entry) => entry.id === draggedId);
      const to = current.findIndex((entry) => entry.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId("");
  }

  function addOption() {
    if (options.length >= 3) {
      setFormError("옵션은 최대 3개까지 만들 수 있습니다.");
      return;
    }
    setOptions((current) => [
      ...current,
      { id: uniqueId(), name: "", values: [], valueText: "" },
    ]);
  }

  function updateOption(id: string, patch: Partial<ProductOption>) {
    setOptions((current) =>
      current.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    );
  }

  function generateCode() {
    const day = new Date().toISOString().slice(2, 10).replaceAll("-", "");
    update(
      "productCode",
      `PG-${day}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "save";
    const status = intent === "draft" ? "draft" : values.status;
    const validOptions = options
      .map((option) => ({
        name: option.name.trim(),
        values: Array.from(new Set(option.values.map((value) => value.trim()).filter(Boolean))),
      }))
      .filter((option) => option.name && option.values.length);

    if (uploading) {
      setFormError("사진 업로드가 끝난 뒤 저장해 주세요.");
      setActiveSection("media");
      return;
    }
    if (
      status !== "draft" &&
      (!values.name.trim() || !values.productCode.trim() || !values.styleNumber.trim() || readyMedia.length < 1 || Number(values.pointPrice) < 1)
    ) {
      setFormError("판매하려면 상품명, 상품코드, 품번, 상품사진 1장 이상, 판매가를 입력해 주세요.");
      setActiveSection(readyMedia.length < 1 ? "media" : "basic");
      return;
    }
    const pointPercent = Number(values.pointMaxPercent || 0);
    if (values.pointUsageMode === "partial" && (pointPercent < 1 || pointPercent > 99)) {
      setFormError("일부 사용 상품의 리워드 최대 사용률은 1~99%로 입력해 주세요.");
      setActiveSection("options");
      return;
    }
    if (!values.cashPaymentEnabled && (values.pointUsageMode !== "full" || pointPercent !== 100)) {
      setFormError("현금 결제를 막으려면 리워드 전액(100%) 결제가 가능해야 합니다.");
      setActiveSection("options");
      return;
    }
    const mediaPayload = readyMedia.map((entry, index) => ({
      url: entry.url,
      alt:
        entry.alt.trim() ||
        `${values.name.trim() || "상품"} ${index === 0 ? "대표사진" : index + 1}`,
      width: entry.width || undefined,
      height: entry.height || undefined,
    }));
    const ok = await act(
      {
        action: "product.save",
        id: item?.id,
        name: values.name,
        nameEn: values.nameEn,
        productCode: values.productCode,
        styleNumber: values.styleNumber,
        category: values.category,
        subcategory: values.subcategory,
        productType: values.productType,
        typeFields,
        brand: values.brand,
        description: values.description,
        detailContent: values.detailContent,
        shippingInfo: values.shippingInfo,
        imageUrl: mediaPayload[0]?.url || "",
        imageUrls: mediaPayload.slice(1).map((entry) => entry.url),
        media: mediaPayload,
        optionText: validOptions
          .map((option) => `${option.name}: ${option.values.join(", ")}`)
          .join("\n"),
        variants: variantEnabled ? normalizedVariants : [],
        pointPrice: Number(values.pointPrice || 0),
        pointUsageMode: values.pointUsageMode,
        pointMaxPercent: Number(values.pointMaxPercent || 0),
        cashPaymentEnabled: values.cashPaymentEnabled,
        rewardOnCashOnly: values.rewardOnCashOnly,
        stock: Number(values.stock || 0),
        status,
        badge: values.badge,
      },
      intent === "draft"
        ? "상품을 임시저장했습니다."
        : item
          ? "상품 정보를 수정했습니다."
          : "새 상품을 등록했습니다.",
    );
    if (ok) close();
  }

  return (
    <div className="modal-backdrop product-editor-backdrop">
      <section className="admin-editor product-editor">
        <header className="product-editor-header">
          <div>
            <span>PRODUCT STUDIO</span>
            <h2>{item ? "상품 수정" : "새 상품 등록"}</h2>
            <p>사진부터 판매 설정까지 한 화면에서 완성합니다.</p>
          </div>
          <div className="product-editor-completion">
            <small>등록 준비도</small>
            <strong>{completion}%</strong>
            <i><b style={{ width: `${completion}%` }} /></i>
          </div>
          <button type="button" className="modal-close" onClick={cancelEditor} aria-label="닫기">×</button>
        </header>

        <form className="product-editor-form" onSubmit={submit}>
          <aside className="product-editor-nav" aria-label="상품 등록 단계">
            {sections.map(([key, number, label]) => (
              <button
                type="button"
                className={activeSection === key ? "active" : ""}
                onClick={() => {
                  setActiveSection(key);
                  document.getElementById(`product-section-${key}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                key={key}
              >
                <span>{number}</span>
                <b>{label}</b>
              </button>
            ))}
            <div className="product-editor-preview-card">
              <span>회원 화면 미리보기</span>
              <div className="product-preview-image">
                <SafeProductImage
                  src={previewMedia?.url}
                  alt={values.name || "상품 미리보기"}
                />
                {values.badge && <b>{values.badge}</b>}
              </div>
              <small>{values.brand || values.category || "분류 미지정"}</small>
              <strong>{values.name || "상품명이 표시됩니다"}</strong>
              <p>
                {Number(values.pointPrice || 0).toLocaleString("ko-KR")} {pointName}
              </p>
              {item?.id && (
                <a href={`/admin/products/${item.id}/preview`} target="_blank" rel="noreferrer">
                  관리자 상품 미리보기 열기 ↗
                </a>
              )}
            </div>
          </aside>

          <main className="product-editor-content">
            {formError && (
              <div className="product-form-error" role="alert">
                <span>!</span><p>{formError}</p>
                <button type="button" onClick={() => setFormError("")}>×</button>
              </div>
            )}

            <section
              id="product-section-basic"
              className="product-form-section"
              onFocus={() => setActiveSection("basic")}
            >
              <header><span>01</span><div><h3>기본정보</h3><p>상품을 찾고 구분하는 핵심 정보입니다.</p></div></header>
              <div className="product-form-grid">
                <label className="wide">
                  상품명 <em>필수</em>
                  <input
                    value={values.name}
                    onChange={(event) => update("name", event.target.value)}
                    maxLength={100}
                    placeholder="회원이 한눈에 이해할 수 있는 상품명"
                  />
                  <small>{values.name.length}/100자</small>
                </label>
                <label className="wide">
                  영문 상품명
                  <input
                    value={values.nameEn}
                    onChange={(event) => update("nameEn", event.target.value)}
                    maxLength={140}
                    placeholder="공식 영문 상품명 또는 모델명"
                  />
                  <small>{values.nameEn.length}/140자</small>
                </label>
                <label>
                  상품 코드 <em>필수</em>
                  <div className="input-with-action">
                    <input
                      value={values.productCode}
                      onChange={(event) => update("productCode", event.target.value)}
                      maxLength={60}
                      placeholder="예: V2-123 또는 내부 관리 코드"
                    />
                    <button type="button" onClick={generateCode}>자동생성</button>
                  </div>
                </label>
                <label>
                  품번 <em>필수</em>
                  <input
                    value={values.styleNumber}
                    onChange={(event) => update("styleNumber", event.target.value)}
                    maxLength={80}
                    placeholder="예: HV8547-002"
                  />
                  <small>브랜드·제조사에서 사용하는 모델 품번입니다.</small>
                </label>
                <label>
                  카테고리 <em>필수</em>
                  <select
                    value={values.category}
                    onChange={(event) => {
                      const category = event.target.value;
                      setValues((current) => ({
                        ...current,
                        category,
                        subcategory: "",
                        productType: guessProductType(category),
                      }));
                    }}
                  >
                    {categoryConfig.categories.map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}
                  </select>
                </label>
                <label>
                  하위 분류
                  <select
                    value={values.subcategory}
                    onChange={(event) => update("subcategory", event.target.value)}
                    disabled={!subcategories.length}
                  >
                    <option value="">{subcategories.length ? "하위 분류 선택" : "등록된 하위 분류 없음"}</option>
                    {values.subcategory && !subcategories.includes(values.subcategory) && <option value={values.subcategory}>기존 분류: {values.subcategory}</option>}
                    {subcategories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                  <small>대분류에 연결된 하위 분류만 선택할 수 있습니다.</small>
                </label>
                <label>
                  브랜드
                  <select value={values.brand} onChange={(event) => update("brand", event.target.value)}>
                    <option value="">브랜드 미지정</option>
                    {scopedBrands.map((entry) => <option key={entry}>{entry}</option>)}
                  </select>
                  <small>선택한 대분류에서 사용하는 브랜드만 표시됩니다.</small>
                </label>
                <label>
                  상품 배지
                  <select
                    value={values.badge}
                    onChange={(event) => update("badge", event.target.value)}
                  >
                    <option value="">배지 없음</option>
                    <option value="신상품">신상품</option>
                    <option value="인기상품">인기상품</option>
                    <option value="세일">세일상품</option>
                    <option value="추천">추천상품</option>
                    <option value="한정">한정상품</option>
                    {values.badge && !["신상품", "인기상품", "세일", "추천", "한정"].includes(values.badge) && <option value={values.badge}>기존 배지: {values.badge}</option>}
                  </select>
                  <small>고객에게 실제로 보여 줄 판매용 표시만 선택합니다.</small>
                </label>
                <label className="wide">
                  목록용 짧은 설명
                  <textarea
                    rows={3}
                    value={values.description}
                    onChange={(event) => update("description", event.target.value)}
                    maxLength={180}
                    placeholder="목록과 상세 상단에 표시할 핵심 특징을 적어주세요."
                  />
                  <small>{values.description.length}/180자</small>
                </label>
              </div>

              <div className="product-type-fields">
                <div className="product-type-fields-heading">
                  <div><strong>상품군별 상세정보</strong><small>상품 종류를 선택하면 필요한 입력값이 자동으로 바뀝니다. 빈 항목은 회원 화면에 표시되지 않습니다.</small></div>
                  <label>
                    상품 종류
                    <select
                      value={values.productType}
                      onChange={(event) => setValues((current) => ({ ...current, productType: normalizeProductType(event.target.value) }))}
                    >
                      {PRODUCT_TYPE_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>{option.label} · {option.description}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="product-form-grid product-spec-grid">
                  {PRODUCT_SPEC_FIELDS[values.productType].map((field) => (
                    <label key={`${values.productType}-${field.key}`}>
                      {field.label}
                      <input
                        value={typeFields[field.key] ?? ""}
                        onChange={(event) => updateTypeField(field.key, event.target.value)}
                        maxLength={180}
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section
              id="product-section-media"
              className="product-form-section"
              onFocus={() => setActiveSection("media")}
            >
              <header>
                <span>02</span>
                <div><h3>상품사진</h3><p>첫 번째 사진이 목록과 상세의 대표사진이 됩니다.</p></div>
                <b>{media.length}/{MAX_MEDIA}</b>
              </header>
              <div className="product-media-guide">
                <div><strong>정확한 사진을 확보되는 만큼</strong><small>장수를 맞추려고 중복·다른 상품 사진을 넣지 않습니다.</small></div>
                <div><strong>1200×1200px · 1:1</strong><small>상품이 잘리지 않도록 여백 통일</small></div>
                <div><strong>자동 WEBP 최적화</strong><small>sRGB·흰 배경·900KB 이하</small></div>
              </div>
              <div
                className="product-media-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(Array.from(event.dataTransfer.files || []));
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={handleFileInput}
                />
                <span aria-hidden="true">＋</span>
                <strong>사진을 끌어놓거나 선택하세요</strong>
                <p>JPG·PNG·WEBP · 원본 20MB 이하 · 한 번에 여러 장 가능</p>
                <button type="button" onClick={() => fileRef.current?.click()}>내 컴퓨터에서 선택</button>
              </div>

              {!!media.length && (
                <div className="product-media-grid">
                  {media.map((entry, index) => (
                    <article
                      className={`product-media-card ${entry.status}`}
                      draggable={entry.status === "ready"}
                      onDragStart={() => setDraggedId(entry.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropMedia(event, entry.id)}
                      key={entry.id}
                    >
                      <div className="product-media-thumb">
                        <SafeProductImage src={entry.url} alt={entry.alt || values.name} />
                        {index === 0 && entry.status === "ready" && <b>대표</b>}
                        {entry.status !== "ready" && (
                          <span>
                            {entry.status === "optimizing" && "사진 최적화 중"}
                            {entry.status === "uploading" && "업로드 중"}
                            {entry.status === "error" && "업로드 실패"}
                          </span>
                        )}
                      </div>
                      <div className="product-media-meta">
                        <strong>{entry.fileName || `상품사진 ${index + 1}`}</strong>
                        <small>
                          {[entry.width && entry.height ? `${entry.width}×${entry.height}` : "", formatBytes(entry.size)]
                            .filter(Boolean)
                            .join(" · ") || "외부 이미지"}
                        </small>
                        {entry.error && <p>{entry.error}</p>}
                      </div>
                      {entry.status === "ready" && (
                        <>
                          <label>
                            대체텍스트
                            <input
                              value={entry.alt}
                              onChange={(event) =>
                                setMedia((current) =>
                                  current.map((mediaEntry) =>
                                    mediaEntry.id === entry.id
                                      ? { ...mediaEntry, alt: event.target.value }
                                      : mediaEntry,
                                  ),
                                )
                              }
                              maxLength={125}
                              placeholder="사진 내용을 짧게 설명"
                            />
                          </label>
                          <div className="product-media-actions">
                            <button type="button" onClick={() => moveMedia(entry.id, -1)} disabled={index === 0} aria-label="앞으로 이동">←</button>
                            <button type="button" onClick={() => moveMedia(entry.id, 1)} disabled={index === media.length - 1} aria-label="뒤로 이동">→</button>
                            {index !== 0 && <button type="button" onClick={() => makeCover(entry.id)}>대표지정</button>}
                            <button type="button" className="danger" onClick={() => removeMedia(entry)}>삭제</button>
                          </div>
                        </>
                      )}
                      {entry.status === "error" && (
                        <button type="button" className="media-remove-error" onClick={() => removeMedia(entry)}>실패한 사진 지우기</button>
                      )}
                    </article>
                  ))}
                </div>
              )}

              <div className="product-image-url">
                <div><strong>외부 사진 주소로 추가</strong><small>공급사에서 받은 영구 이미지 주소가 있을 때만 사용하세요.</small></div>
                <input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://..." />
                <button type="button" onClick={addImageUrl}>주소 추가</button>
              </div>
            </section>

            <section
              id="product-section-options"
              className="product-form-section"
              onFocus={() => setActiveSection("options")}
            >
              <header>
                <span>03</span>
                <div><h3>옵션·판매가·재고</h3><p>판매가는 원화 기준이며 색상·사이즈 옵션과 함께 회원 화면에 연결됩니다.</p></div>
              </header>
              <div className="product-form-grid">
                <label>
                  판매가 <em>필수</em>
                  <div className="input-suffix">
                    <input type="number" min="0" value={values.pointPrice} onChange={(event) => update("pointPrice", event.target.value)} />
                    <span>원</span>
                  </div>
                </label>
                <label>
                  판매 가능 재고
                  <div className="input-suffix">
                    <input type="number" min="0" value={values.stock} onChange={(event) => update("stock", event.target.value)} />
                    <span>개</span>
                  </div>
                  {Number(values.stock) < 1 && <small className="warning-text">판매 중이어도 회원 화면에는 품절로 표시됩니다.</small>}
                </label>
                <label>
                  리워드 사용 범위
                  <select
                    value={values.pointUsageMode}
                    onChange={(event) => {
                      const mode = event.target.value as ProductValues["pointUsageMode"];
                      setValues((current) => ({
                        ...current,
                        pointUsageMode: mode,
                        pointMaxPercent: mode === "none" ? "0" : mode === "partial" ? "50" : "100",
                        cashPaymentEnabled: mode === "none" ? true : current.cashPaymentEnabled,
                      }));
                    }}
                  >
                    <option value="none">리워드 사용 불가</option>
                    <option value="partial">일부 사용</option>
                    <option value="full">전액 사용 가능</option>
                  </select>
                </label>
                <label>
                  리워드 최대 사용률
                  <div className="input-suffix">
                    <input
                      type="number"
                      min={values.pointUsageMode === "partial" ? "1" : "0"}
                      max={values.pointUsageMode === "partial" ? "99" : "100"}
                      step="1"
                      disabled={values.pointUsageMode !== "partial"}
                      value={values.pointMaxPercent}
                      onChange={(event) => update("pointMaxPercent", event.target.value)}
                    />
                    <span>%</span>
                  </div>
                  <small>
                    {values.pointUsageMode === "none"
                      ? "이 상품에는 리워드를 사용할 수 없습니다."
                      : values.pointUsageMode === "full"
                        ? "상품금액 전액을 리워드로 결제할 수 있습니다."
                        : "1~99%에서 자유롭게 설정할 수 있습니다. 예: 30%"}
                  </small>
                </label>
              </div>

              <div className="publish-options payment-policy-options">
                <label className={values.cashPaymentEnabled ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={values.cashPaymentEnabled}
                    onChange={(event) => setValues((current) => ({
                      ...current,
                      cashPaymentEnabled: event.target.checked,
                      pointUsageMode: event.target.checked ? current.pointUsageMode : "full",
                      pointMaxPercent: event.target.checked ? current.pointMaxPercent : "100",
                    }))}
                  />
                  <span><strong>현금 결제 가능</strong><small>남은 금액을 무통장입금 또는 카카오톡 송금으로 받습니다.</small></span>
                </label>
                <label className={values.rewardOnCashOnly ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={values.rewardOnCashOnly}
                    onChange={(event) => setValues((current) => ({ ...current, rewardOnCashOnly: event.target.checked }))}
                  />
                  <span><strong>현금 결제액 기준 적립</strong><small>리워드 사용분에는 새 리워드를 적립하지 않습니다.</small></span>
                </label>
              </div>

              <div className="product-option-builder">
                <div className="option-builder-heading">
                  <div><strong>선택 옵션</strong><small>예: 색상 / 블랙, 화이트</small></div>
                  <button type="button" onClick={addOption} disabled={options.length >= 3}>＋ 옵션 추가</button>
                </div>
                {!options.length && (
                  <button type="button" className="empty-option" onClick={addOption}>
                    옵션이 없는 단일 상품입니다. 색상·사이즈 옵션을 추가하려면 누르세요.
                  </button>
                )}
                {options.map((option, index) => (
                  <article className="option-row" key={option.id}>
                    <span>{index + 1}</span>
                    <label>
                      옵션명
                      <input value={option.name} onChange={(event) => updateOption(option.id, { name: event.target.value })} placeholder="색상" maxLength={30} />
                    </label>
                    <label>
                      옵션값
                      <input
                        value={option.valueText}
                        onChange={(event) =>
                          updateOption(option.id, {
                            valueText: event.target.value,
                            values: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="블랙, 화이트, 네이비"
                      />
                      {!!option.values.length && (
                        <small className="option-chips">
                          {option.values.map((value) => <i key={value}>{value}</i>)}
                        </small>
                      )}
                    </label>
                    <button type="button" className="remove-option" onClick={() => setOptions((current) => current.filter((entry) => entry.id !== option.id))} aria-label="옵션 삭제">×</button>
                  </article>
                ))}
                {!!options.length && (
                  <p className="option-summary">
                    유효한 옵션 조합 <strong>{optionCombinations.toLocaleString("ko-KR")}개</strong> · {variantEnabled ? "아래에서 조합별 재고와 추가금액을 관리합니다." : "운영 기능에서 옵션별 재고를 켜면 조합별 관리가 열립니다."}
                  </p>
                )}
                {variantEnabled && !!normalizedVariants.length && <div className="variant-stock-table"><div className="variant-stock-head"><span>옵션 조합</span><span>SKU</span><span>추가금액</span><span>재고</span><span>판매</span></div>{normalizedVariants.map((variant) => <div className="variant-stock-row" key={variant.key}><strong>{Object.values(variant.options).join(" / ")}</strong><input value={variant.sku} onChange={(e) => updateVariant(variant.key, { sku: e.target.value })} placeholder="SKU" /><input type="number" value={variant.additionalPrice} onChange={(e) => updateVariant(variant.key, { additionalPrice: Number(e.target.value) })} /><input type="number" min="0" value={variant.stock} onChange={(e) => updateVariant(variant.key, { stock: Math.max(0, Number(e.target.value)) })} /><label className="checkbox-line"><input type="checkbox" checked={variant.active} onChange={(e) => updateVariant(variant.key, { active: e.target.checked })} /> 사용</label></div>)}</div>}
              </div>
            </section>

            <section
              id="product-section-detail"
              className="product-form-section"
              onFocus={() => setActiveSection("detail")}
            >
              <header><span>04</span><div><h3>상세정보·배송</h3><p>구매 판단과 주문 후 안내에 함께 사용됩니다.</p></div></header>
              <div className="product-form-grid">
                <label className="wide">
                  상품 상세 설명
                  <textarea rows={9} value={values.detailContent} onChange={(event) => update("detailContent", event.target.value)} placeholder={"소재·구성·크기·사용법을 항목별로 적어주세요.\n줄바꿈은 회원용 상세페이지에 그대로 반영됩니다."} />
                </label>
                <label className="wide">
                  배송·교환 안내
                  <textarea rows={6} value={values.shippingInfo} onChange={(event) => update("shippingInfo", event.target.value)} placeholder="배송 기간, 취소 가능 시점, 교환 기준을 입력합니다." />
                </label>
              </div>
            </section>

            <section
              id="product-section-publish"
              className="product-form-section"
              onFocus={() => setActiveSection("publish")}
            >
              <header><span>05</span><div><h3>판매설정</h3><p>저장 후 회원에게 보이는 상태를 선택합니다.</p></div></header>
              <div className="publish-options">
                {[
                  ["active", "판매 중", "상품목록과 검색에 즉시 공개합니다."],
                  ["inactive", "판매 중지", "관리자에는 보관하고 회원에게는 숨깁니다."],
                  ["draft", "임시저장", "정보를 더 작성한 뒤 공개합니다."],
                ].map(([status, label, description]) => (
                  <label className={values.status === status ? "active" : ""} key={status}>
                    <input
                      type="radio"
                      name="productStatus"
                      value={status}
                      checked={values.status === status}
                      onChange={() => update("status", status)}
                    />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </label>
                ))}
              </div>
              <div className="publish-checklist">
                <strong>등록 전 확인</strong>
                <ul>
                  <li className={values.name.trim() ? "done" : ""}>상품명 입력</li>
                  <li className={readyMedia.length > 0 ? "done" : ""}>상품사진 1장 이상 등록</li>
                  <li className={Number(values.pointPrice) > 0 ? "done" : ""}>판매가 입력</li>
                  <li className={values.description.trim() ? "done" : ""}>목록 설명 입력</li>
                  <li className={values.detailContent.trim() ? "done" : ""}>상세 설명 입력</li>
                </ul>
              </div>
            </section>
          </main>

          <footer className="product-editor-actions">
            <div>
              <span>첫 사진이 대표사진이며 순서는 상품 상세 갤러리에 그대로 반영됩니다.</span>
              {uploading && <b>사진 업로드가 진행 중입니다…</b>}
            </div>
            <button type="button" onClick={cancelEditor}>취소</button>
            <button type="submit" name="intent" value="draft" disabled={busy || uploading}>임시저장</button>
            <button type="submit" name="intent" value="save" className="admin-primary" disabled={busy || uploading}>
              {busy ? "저장 중..." : item ? "변경사항 저장" : "상품 등록"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
