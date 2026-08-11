"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-html-link-for-pages, @next/next/no-img-element, react-hooks/set-state-in-effect */

import { FormEvent, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SafeProductImage from "./SafeProductImage";
import FloatingContact from "./FloatingContact";
import { QRCodeSVG } from "qrcode.react";
import { parseCategoryConfig, productMatchesCategory } from "../lib/category-config";

type Data = {
  settings: Record<string, string>;
  products: any[];
  catalog?: {
    items: any[];
    total: number;
    page: number;
    pageSize: number;
    category?: string;
    search?: string;
    categoryCounts?: Record<string, number>;
  };
  salesChannels?: any[];
  memberChannel?: any | null;
  adminAccess?: { isSupervisor: boolean; channelManagementHref: string } | null;
  cart: any[];
  addresses: any[];
  wishlist: number[];
  orders: any[];
  orderClaims?: any[];
  reviewableItems: any[];
  pointLogs: any[];
  pointSummary: { earned: number; used: number; count: number };
  attendance: {
    enabled: boolean;
    todayChecked: boolean;
    today: any | null;
    streak: number;
    dailyPoints: number;
    streakDays: number;
    streakBonus: number;
    history: any[];
  };
  finance: any[];
  reviews: any[];
  popups: any[];
  notices: any[];
  inquiries: any[];
  member: any;
  memberAuthType?: "native" | "guest";
  reward?: any | null;
  memberTier?: any | null;
  discountCoupons?: any[];
};

type AddressDraft = {
  label: string;
  recipient: string;
  phone: string;
  postalCode: string;
  address1: string;
  addressDetail: string;
  deliveryRequest: string;
  isDefault: boolean;
  customsCode: string;
  customsMasked: string;
  customsNameConfirmed: boolean;
  saveCustomsCode: boolean;
};

type ReviewPhotoStatus = "optimizing" | "ready" | "uploading" | "uploaded" | "error";

type ReviewPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  sourceName: string;
  sourceSize: number;
  status: ReviewPhotoStatus;
  error?: string;
};

const fmt = (value: number | string) => Number(value ?? 0).toLocaleString("ko-KR");
function orderTemplate(settings: Record<string, string>, status: string) {
  if (settings.feature_templates_enabled !== "true") return "";
  if (["취소"].includes(status)) return settings.template_cancelled || "";
  if (["반품완료"].includes(status)) return settings.template_returned || "";
  if (["배송중", "배송완료"].includes(status)) return settings.template_shipping || "";
  if (["상품준비", "결제완료"].includes(status)) return settings.template_payment_confirmed || "";
  return settings.template_order_received || "";
}
const PRODUCTS_PER_PAGE = 8;
const REVIEW_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const REVIEW_UPLOAD_TARGET_BYTES = 820 * 1024;
const REVIEW_UPLOAD_MAX_DIMENSION = 1600;
const REVIEW_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const formatFileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

async function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("사진을 변환하지 못했습니다."))),
      "image/jpeg",
      quality,
    );
  });
}

async function optimizeReviewPhoto(file: File): Promise<File> {
  if (file.size <= REVIEW_UPLOAD_TARGET_BYTES && file.type === "image/jpeg") {
    return file;
  }

  let image: ImageBitmap | HTMLImageElement;
  let release = () => {};
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
    release = () => image instanceof ImageBitmap && image.close();
  } catch {
    const sourceUrl = URL.createObjectURL(file);
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이 사진 형식을 읽을 수 없습니다."));
      element.src = sourceUrl;
    });
    release = () => URL.revokeObjectURL(sourceUrl);
  }

  try {
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const scale = Math.min(
      1,
      REVIEW_UPLOAD_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
    );
    let width = Math.max(1, Math.round(sourceWidth * scale));
    let height = Math.max(1, Math.round(sourceHeight * scale));
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    let context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("사진을 변환하지 못했습니다.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let blob = await canvasBlob(canvas, 0.84);
    for (const quality of [0.76, 0.68, 0.6]) {
      if (blob.size <= REVIEW_UPLOAD_TARGET_BYTES) break;
      blob = await canvasBlob(canvas, quality);
    }
    while (blob.size > REVIEW_UPLOAD_TARGET_BYTES && width > 720 && height > 720) {
      width = Math.max(720, Math.round(width * 0.82));
      height = Math.max(720, Math.round(height * 0.82));
      const resized = document.createElement("canvas");
      resized.width = width;
      resized.height = height;
      const resizedContext = resized.getContext("2d", { alpha: false });
      if (!resizedContext) break;
      resizedContext.fillStyle = "#fff";
      resizedContext.fillRect(0, 0, width, height);
      resizedContext.drawImage(canvas, 0, 0, width, height);
      canvas = resized;
      context = resizedContext;
      blob = await canvasBlob(canvas, 0.68);
    }
    if (blob.size > REVIEW_UPLOAD_TARGET_BYTES) {
      throw new Error("사진을 자동으로 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
    }
    const fileName = file.name.replace(/\.[^.]+$/, "") || "review-photo";
    return new File([blob], `${fileName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    release();
  }
}

async function responsePayload(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (response.status === 413 || /payload too large/i.test(text)) {
      return {
        error:
          "사진 용량이 서버 전송 한도를 넘었습니다. 사진을 다시 선택하면 자동으로 줄여 등록합니다.",
      };
    }
    return {
      error: response.ok
        ? "사진 저장 결과를 확인하지 못했습니다."
        : "사진을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

const seoulDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
const hasProductOptions = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) && parsed.some((item) => item?.name && item?.values?.length);
  } catch {
    return false;
  }
};
const cartOptionLabel = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return Object.entries(parsed)
      .map(([name, option]) => `${name}: ${String(option)}`)
      .join(" · ");
  } catch {
    return "";
  }
};
const reviewImageList = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const jsonValue = <T,>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
};

export function mergeChangedSettings(
  current: Data | null,
  nextSettings: Record<string, unknown>,
) {
  if (!current) return current;
  let changed = false;
  const settings = { ...current.settings };
  for (const [key, rawValue] of Object.entries(nextSettings)) {
    const value = String(rawValue ?? "");
    if (settings[key] === value) continue;
    settings[key] = value;
    changed = true;
  }
  return changed ? { ...current, settings } : current;
}
const youtubeVideoId = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.pathname.includes("/shorts/")) return url.pathname.split("/shorts/")[1]?.split("/")[0] || "";
    if (url.pathname.includes("/live/")) return url.pathname.split("/live/")[1]?.split("/")[0] || "";
    return url.searchParams.get("v") || "";
  } catch { return ""; }
};
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const timelineSeconds = (value: unknown) => {
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map((part) => Number(part.trim()));
    if (parts.every(Number.isFinite)) {
      return parts.reduce((total, part) => total * 60 + part, 0);
    }
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
};

let youtubePlayerApiPromise: Promise<void> | null = null;
const loadYoutubePlayerApi = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저에서만 영상을 재생할 수 있습니다."));
  if ((window as any).YT?.Player) return Promise.resolve();
  if (youtubePlayerApiPromise) return youtubePlayerApiPromise;
  youtubePlayerApiPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled || !(window as any).YT?.Player) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      resolve();
    };
    const poll = window.setInterval(finish, 200);
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      youtubePlayerApiPromise = null;
      reject(new Error("유튜브 플레이어를 불러오지 못했습니다."));
    }, 15000);
    const previous = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };
    if (!document.querySelector('script[data-youtube-player-api]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.dataset.youtubePlayerApi = "true";
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(poll);
        window.clearTimeout(timeout);
        youtubePlayerApiPromise = null;
        reject(new Error("유튜브 플레이어 연결에 실패했습니다."));
      };
      document.head.appendChild(script);
    }
  });
  return youtubePlayerApiPromise;
};

const deliveryRequests = [
  "문 앞에 놓아주세요",
  "경비실에 맡겨주세요",
  "택배함에 넣어주세요",
  "배송 전에 연락해 주세요",
  "직접 입력",
];

const addressDraft = (
  source?: any,
  member?: any,
): AddressDraft => ({
  label: String(source?.label ?? "집"),
  recipient: String(source?.recipient ?? member?.name ?? ""),
  phone: String(source?.phone ?? member?.phone ?? ""),
  postalCode: String(source?.postal_code ?? source?.postalCode ?? ""),
  address1: String(source?.address1 ?? source?.address ?? ""),
  addressDetail: String(source?.address_detail ?? source?.addressDetail ?? ""),
  deliveryRequest: String(
    source?.delivery_request ?? source?.deliveryRequest ?? source?.memo ?? "",
  ),
  isDefault: Boolean(source?.is_default ?? source?.isDefault),
  customsCode: "",
  customsMasked: String(source?.customs_code_masked ?? source?.customsMasked ?? ""),
  customsNameConfirmed: Boolean(source?.customs_code_masked ?? source?.customsMasked),
  saveCustomsCode: Boolean(source?.customs_save_consent_at ?? source?.saveCustomsCode),
});

function fullAddress(source: any) {
  const structured = [
    source?.postal_code ? `[${source.postal_code}]` : "",
    source?.address1,
    source?.address_detail,
  ]
    .filter(Boolean)
    .join(" ");
  return structured || String(source?.address ?? "");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function openPostcode(
  complete: (postalCode: string, address: string) => void,
  failed: () => void,
) {
  const launch = () => {
    const KakaoPostcode = (window as any).kakao?.Postcode;
    if (!KakaoPostcode) {
      failed();
      return;
    }
    new KakaoPostcode({
      oncomplete: (result: any) => {
        const address = String(result.roadAddress || result.jibunAddress || "");
        complete(String(result.zonecode || ""), address);
      },
    }).open();
  };
  if ((window as any).kakao?.Postcode) {
    launch();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    "script[data-kakao-postcode]",
  );
  if (existing) {
    existing.addEventListener("load", launch, { once: true });
    existing.addEventListener("error", failed, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src =
    "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  script.async = true;
  script.dataset.kakaoPostcode = "true";
  script.addEventListener("load", launch, { once: true });
  script.addEventListener("error", failed, { once: true });
  document.head.appendChild(script);
}

type ChannelContext = { channel: any; otherChannels: any[] };

export default function Storefront({ initialData = null, channelContext = null }: { initialData?: Data | null; channelContext?: ChannelContext | null }) {
  const [data, setData] = useState<Data | null>(initialData);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [cartBusyProductIds, setCartBusyProductIds] = useState<Set<number>>(() => new Set());
  const [wishlistBusyProductIds, setWishlistBusyProductIds] = useState<Set<number>>(() => new Set());
  const [category, setCategory] = useState("전체");
  const [activeYoutubeMenu, setActiveYoutubeMenu] = useState<"home" | "live" | "replays" | "shorts" | "products">("home");
  const [youtubeProductMenuEnabled, setYoutubeProductMenuEnabled] = useState(false);
  const [youtubeCategoriesOpen, setYoutubeCategoriesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<Data["catalog"]>(initialData?.catalog);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountTab, setAccountTab] = useState("orders");
  const [popupOpen, setPopupOpen] = useState(false);
  const [toast, setToast] = useState("");
  const liveViewportRef = useRef<{ x: number; y: number } | null>(null);
  const categoryScrollSuppressedUntilRef = useRef(0);
  const subcategoryScrollRef = useRef<HTMLElement | null>(null);

  async function load() {
    try {
      const guestPreview =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("guest") === "1";
      const response = await fetch(guestPreview ? "/api/store?guest=1" : "/api/store", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "쇼핑몰을 불러오지 못했습니다.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "쇼핑몰을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The server already supplied the complete first screen. Loading it again
    // changes the page tree after the user has started scrolling. Guest preview
    // is the only mode that intentionally replaces the server payload.
    if (!initialData || params.get("guest") === "1") void load();
    const requestedSearch = params.get("search");
    const requestedCategory = params.get("category");
    if (requestedSearch) setSearch(requestedSearch);
    if (requestedCategory) setCategory(requestedCategory);
    if (params.get("browse") === "1" || requestedSearch || requestedCategory) {
      setPopupOpen(false);
    }
    if (params.get("cart") === "1") setCartOpen(true);
    const requestedAccountTab = params.get("account");
    if (requestedAccountTab) {
      setAccountTab(requestedAccountTab);
      setAccountOpen(true);
    }
  }, []);

  useLayoutEffect(() => {
    const viewport = liveViewportRef.current;
    if (!viewport) return;
    liveViewportRef.current = null;
    if (Math.abs(window.scrollX - viewport.x) < 1 && Math.abs(window.scrollY - viewport.y) < 1) return;
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(viewport.x, viewport.y);
    root.style.scrollBehavior = previousScrollBehavior;
  }, [data]);

  useEffect(() => {
    const popup = data?.popups?.[0];
    if (!data || !popup || data.member.role === "guest") {
      setPopupOpen(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("browse") === "1" ||
      params.get("search") ||
      params.get("category") ||
      window.location.hash === "#products"
    ) {
      setPopupOpen(false);
      return;
    }
    const popupVersion = encodeURIComponent(`${popup.title}|${popup.content}|${popup.image_url || ""}`);
    const key = `point-mall-popup-dismissed-v2:${data.member.id}:${popup.id}:${popupVersion}`;
    try {
      setPopupOpen(window.localStorage.getItem(key) !== "1");
    } catch {
      setPopupOpen(true);
    }
  }, [data]);

  async function act(body: Record<string, unknown>, success?: string) {
    const action = String(body.action ?? "처리");
    const cartProductId = action === "cart.add" ? Number(body.productId ?? 0) : 0;
    const wishlistProductId = action === "wishlist.toggle" ? Number(body.productId ?? 0) : 0;
    if (cartProductId) {
      setCartBusyProductIds((current) => new Set(current).add(cartProductId));
    } else if (wishlistProductId) {
      setWishlistBusyProductIds((current) => new Set(current).add(wishlistProductId));
    } else {
      setBusy(action);
    }
    setError("");
    try {
      const response = await fetch("/api/store", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.href = `/login?return_to=${encodeURIComponent(here)}`;
        return null;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
      if (payload?.partial === "cart.add" && payload.cartItem) {
        setData((current) => {
          if (!current) return current;
          const remaining = current.cart.filter((item) => Number(item.id) !== Number(payload.cartItem.id));
          return { ...current, cart: [payload.cartItem, ...remaining] };
        });
      } else if (payload?.partial) {
        setData((current) => current ? { ...current, ...payload, products: current.products, settings: current.settings } : current);
      } else {
        setData(payload);
      }
      if (success) {
        setToast(success);
        window.setTimeout(() => setToast(""), 2400);
      }
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.");
      return null;
    } finally {
      if (cartProductId) {
        setCartBusyProductIds((current) => {
          const next = new Set(current);
          next.delete(cartProductId);
          return next;
        });
      } else if (wishlistProductId) {
        setWishlistBusyProductIds((current) => {
          const next = new Set(current);
          next.delete(wishlistProductId);
          return next;
        });
      } else {
        setBusy("");
      }
    }
  }

  const categoryConfig = useMemo(() => parseCategoryConfig(
    data?.settings?.product_category_config,
    Array.from(new Set((data?.products ?? []).map((item) => String(item.category)))),
  ), [data]);
  const channelCategoryProductMap = useMemo(() => {
    try {
      const parsed = JSON.parse(String(data?.settings?.channel_category_product_map || "{}"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number[]> : {};
    } catch { return {} as Record<string, number[]>; }
  }, [data]);
  const visibleCategoryEntries = useMemo(() => {
    const activeProducts = (data?.products ?? []).filter((item) => item.status === "active");
    const hasProducts = (name: string) => {
      const knownCount = Number(catalog?.categoryCounts?.[name] ?? -1);
      if (knownCount >= 0) return knownCount > 0;
      const channelProductIds = channelCategoryProductMap[name];
      if (Array.isArray(channelProductIds)) {
        return channelProductIds.length > 0;
      }
      return activeProducts.some((item) => productMatchesCategory(item, name, categoryConfig));
    };
    return categoryConfig.categories
      .filter((entry) => entry.visible && hasProducts(entry.name))
      .map((entry) => ({
        ...entry,
        children: entry.children
          .filter((child) => child.visible && hasProducts(child.name))
          .map((child) => ({ ...child, children: child.children.filter((grandchild) => grandchild.visible && hasProducts(grandchild.name)) })),
      }));
  }, [categoryConfig, channelCategoryProductMap, data?.products, catalog?.categoryCounts]);
  const visibleMenuEntries = visibleCategoryEntries.slice(0, Math.max(1, categoryConfig.menuLimit - 1));
  const overflowMenuEntries = visibleCategoryEntries.slice(Math.max(1, categoryConfig.menuLimit - 1));
  const selectedCategoryEntry = visibleCategoryEntries.find((entry) => entry.name === category || entry.children.some((child) => child.name === category || child.children.some((grandchild) => grandchild.name === category)));
  const products = catalog?.items ?? data?.products ?? [];
  const totalProducts = Number(catalog?.total ?? products.length);
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  const visibleProducts = products;
  const homeDisplaySections = useMemo(() => {
    if (data?.settings?.feature_home_display_enabled !== "true") return [];
    let configured: any[] = [];
    try { configured = JSON.parse(data.settings.home_display_sections || "[]"); } catch { configured = []; }
    const active = (data.products || []).filter((item) => item.status === "active");
    return configured.filter((entry) => entry.visible !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((entry) => {
      const items = entry.sort === "newest" ? [...active].sort((a, b) => Number(b.id) - Number(a.id)) : entry.sort === "popular" ? [...active].sort((a, b) => Number(b.sales_count || 0) - Number(a.sales_count || 0)) : (entry.productIds || []).map((id: number) => active.find((item) => Number(item.id) === Number(id))).filter(Boolean);
      return { ...entry, items: items.slice(0, 8) };
    }).filter((entry) => entry.items.length);
  }, [data]);
  // A sales-channel route is always a live-commerce storefront. Do not let a
  // legacy global storefront setting make a channel fall back to the ordinary
  // reward-mall home screen after production data is migrated.
  const isYoutubeSkin = Boolean(channelContext) || data?.settings?.storefront_skin === "youtube";
  const liveProductIds = useMemo(() => jsonValue<number[]>(data?.settings?.youtube_live_product_ids, []), [data]);
  const liveProducts = useMemo(() => liveProductIds.map((id) => data?.products?.find((product) => Number(product.id) === Number(id) && product.status === "active")).filter(Boolean), [data, liveProductIds]);
  const liveSlots = useMemo(() => jsonValue<Array<{ number: number; productId: number }>>(data?.settings?.youtube_live_slots, []), [data]);
  const liveHistory = useMemo(() => jsonValue<number[]>(data?.settings?.youtube_live_history, []), [data]);
  const currentLiveNumber = Number(data?.settings?.youtube_live_current_number || 0);
  const slotProduct = (number: number) => {
    const slot = liveSlots.find((item) => Number(item.number) === Number(number));
    return slot ? data?.products?.find((product) => Number(product.id) === Number(slot.productId) && product.status === "active") : null;
  };
  const currentBroadcastProduct = slotProduct(currentLiveNumber) || liveProducts[0];
  const introducedBroadcastProducts = liveHistory.map(slotProduct).filter(Boolean);
  const broadcastProductHistory = introducedBroadcastProducts.length ? introducedBroadcastProducts : liveProducts;
  const publicReplays = useMemo(() => jsonValue<any[]>(data?.settings?.youtube_replays, []).filter((replay) => replay?.completed && youtubeVideoId(replay?.youtubeUrl)), [data]);
  const publicShorts = useMemo(() => jsonValue<any[]>(data?.settings?.youtube_shorts, []).filter((short) => short?.visible && youtubeVideoId(short?.youtubeUrl)), [data]);

  useEffect(() => {
    setPage(1);
  }, [category, search]);

  useEffect(() => {
    if (!data) return;
    const normalizedSearch = search.trim().toLowerCase();
    if (
      Number(catalog?.page || 1) === page &&
      String(catalog?.category || "전체") === category &&
      String(catalog?.search || "").toLowerCase() === normalizedSearch
    ) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PRODUCTS_PER_PAGE),
          category,
          search: search.trim(),
        });
        if (channelContext?.channel?.slug) params.set("channel", String(channelContext.channel.slug));
        const response = await fetch(`/api/catalog?${params}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "상품을 불러오지 못했습니다.");
        setCatalog(payload.catalog);
        setData((current) => {
          if (!current) return current;
          const merged = new Map(current.products.map((product) => [Number(product.id), product]));
          for (const product of payload.catalog?.items || []) merged.set(Number(product.id), product);
          return { ...current, products: [...merged.values()], catalog: payload.catalog };
        });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "상품을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }, normalizedSearch ? 280 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [category, search, page, channelContext?.channel?.slug]);

  useEffect(() => {
    if (!isYoutubeSkin || data?.settings?.youtube_live_enabled !== "true") return;
    let stopped = false;
    let requestInFlight = false;
    const controller = new AbortController();
    const sync = async () => {
      if (requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        const liveStateUrl = channelContext?.channel?.slug ? `/api/live-state?channel=${encodeURIComponent(channelContext.channel.slug)}` : "/api/live-state";
        const response = await fetch(liveStateUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!stopped && response.ok && payload.settings) {
          setData((current) => {
            const next = mergeChangedSettings(current, payload.settings);
            if (next === current) return current;
            liveViewportRef.current = { x: window.scrollX, y: window.scrollY };
            return next;
          });
        }
      } catch {
        // A temporary network pause should not interrupt video playback or ordering.
      } finally {
        requestInFlight = false;
      }
    };
    const timer = window.setInterval(sync, 2500);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isYoutubeSkin, data?.settings?.youtube_live_enabled, channelContext?.channel?.slug]);

  function moveToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    window.requestAnimationFrame(() => scrollSectionBelowHeader("products"));
    scrollSectionBelowHeader("products");
  }

  function selectYoutubeMenu(menu: "home" | "live" | "replays" | "shorts" | "products") {
    if (menu === "products") {
      if (activeYoutubeMenu === "products" && youtubeProductMenuEnabled) {
        setYoutubeProductMenuEnabled(false);
        setYoutubeCategoriesOpen(false);
        return;
      }
      setActiveYoutubeMenu("products");
      setYoutubeProductMenuEnabled(true);
      setYoutubeCategoriesOpen(true);
      return;
    }
    setActiveYoutubeMenu(menu);
    setYoutubeProductMenuEnabled(false);
    setYoutubeCategoriesOpen(false);
    if (menu === "home") {
      window.history.replaceState(null, "", window.location.pathname);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    scrollSectionBelowHeader(`youtube-${menu}`);
  }

  function selectYoutubeCategory(nextCategory: string) {
    setCategory(nextCategory);
    setActiveYoutubeMenu("products");
    setYoutubeProductMenuEnabled(true);
    setYoutubeCategoriesOpen(true);
    // Category selection adds/removes sticky header rows before the smooth
    // scroll settles. Ignore those synthetic scroll deltas so they cannot
    // start an open/close feedback loop.
    categoryScrollSuppressedUntilRef.current = Date.now() + 1400;
    scrollSectionBelowHeader("products");
  }

  useEffect(() => {
    if (!isYoutubeSkin || !youtubeProductMenuEnabled) return;
    let lastScrollY = window.scrollY;
    let accumulatedDelta = 0;
    let lastDirection = 0;
    const handleCategoryVisibility = () => {
      const nextScrollY = window.scrollY;
      const difference = nextScrollY - lastScrollY;
      if (Date.now() < categoryScrollSuppressedUntilRef.current) {
        lastScrollY = nextScrollY;
        accumulatedDelta = 0;
        lastDirection = 0;
        return;
      }
      if (Math.abs(difference) < 2) return;
      const direction = Math.sign(difference);
      if (lastDirection && direction !== lastDirection) accumulatedDelta = 0;
      accumulatedDelta += difference;
      lastDirection = direction;
      lastScrollY = nextScrollY;
      // Small mobile viewport corrections and sticky-header reflows are not
      // user intent. Require a deliberate gesture before changing the menu.
      if (Math.abs(accumulatedDelta) < 28) return;
      // Product navigation follows the familiar mobile header pattern:
      // reveal choices when the shopper scrolls back up, and reclaim content
      // space while they continue down the page.
      const shouldOpen = accumulatedDelta < 0;
      categoryScrollSuppressedUntilRef.current = Date.now() + 320;
      setYoutubeCategoriesOpen((open) => open === shouldOpen ? open : shouldOpen);
      accumulatedDelta = 0;
      lastDirection = 0;
    };
    window.addEventListener("scroll", handleCategoryVisibility, { passive: true });
    return () => window.removeEventListener("scroll", handleCategoryVisibility);
  }, [isYoutubeSkin, youtubeProductMenuEnabled]);

  function selectStoreMenu(nextCategory: string) {
    setCategory(nextCategory);
    setSearch("");
    if (nextCategory === "전체") {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    scrollSectionBelowHeader("products");
  }

  function scrollSubcategories(direction: -1 | 1) {
    const navigation = subcategoryScrollRef.current;
    if (!navigation) return;
    navigation.scrollBy({
      left: direction * Math.max(280, navigation.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  useEffect(() => {
    const navigation = subcategoryScrollRef.current;
    const activeButton = navigation?.querySelector<HTMLElement>("button.active");
    if (!navigation || !activeButton) return;
    const targetLeft = activeButton.offsetLeft - (navigation.clientWidth - activeButton.offsetWidth) / 2;
    navigation.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [category, youtubeCategoriesOpen]);

  function scrollSectionBelowHeader(sectionId: string) {
    // Wait for React to finish rendering category bars before measuring the
    // sticky header. This keeps the section title visible in every skin and
    // viewport instead of letting the header cover it.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const header = document.querySelector<HTMLElement>(".store-header");
      const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
      const sectionTop = window.scrollY + section.getBoundingClientRect().top;
      window.scrollTo({
        top: Math.max(0, sectionTop - headerBottom - 14),
        behavior: "smooth",
      });
    }));
  }


  if (!data && !error) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">P</div>
        <p>회원 전용 리워드몰을 준비하고 있습니다</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="error-screen">
        <div className="error-card">
          <span>회원 확인</span>
          <h1>리워드몰에 입장할 수 없습니다.</h1>
          <p>{error}</p>
          <a href="/login" className="button primary">
            회원 로그인
          </a>
        </div>
      </main>
    );
  }

  const s = data.settings;
  const brandStyle = {
    "--brand": s.primary_color,
    "--brand-2": s.secondary_color,
    "--accent": s.accent_color,
  } as React.CSSProperties;
  const pointName = s.point_name || "리워드";
  const isGuest = data.member.role === "guest";
  const memberChannelStatus = String(data.memberChannel?.application_status || "");
  const canManageMemberChannel = ["approved", "revision_requested", "publication_review", "published"].includes(memberChannelStatus);
  const ownsCurrentChannel = Boolean(
    channelContext &&
    canManageMemberChannel &&
    Number(data.memberChannel?.id || 0) === Number(channelContext.channel.id || 0),
  );
  const canSuperviseCurrentChannel = Boolean(channelContext && data.adminAccess?.isSupervisor);
  const returnAfterLogin = channelContext?.channel?.slug
    ? `/channel/${channelContext.channel.slug}`
    : "/";
  const signInPath = `/login?return_to=${encodeURIComponent(returnAfterLogin)}`;
  const purchaseRewardRate = Math.max(
    0,
    Math.min(
      100,
      Number(s.cash_reward_rate || 0) +
        (s.feature_member_tiers_enabled === "true" ? Number(data.memberTier?.rewardRate || 0) : 0),
    ),
  );
  const catalogNow = new Date();
  const catalogDiscountStart = s.period_discount_starts_at
    ? new Date(`${s.period_discount_starts_at}T00:00:00+09:00`)
    : null;
  const catalogDiscountEnd = s.period_discount_ends_at
    ? new Date(`${s.period_discount_ends_at}T23:59:59+09:00`)
    : null;
  const catalogDiscountActive =
    s.feature_discount_enabled === "true" &&
    Number(s.period_discount_rate || 0) > 0 &&
    (!catalogDiscountStart || catalogNow >= catalogDiscountStart) &&
    (!catalogDiscountEnd || catalogNow <= catalogDiscountEnd);

  function productCardMeta(product: any) {
    const regularPrice = Number(product.point_price || 0);
    const discountApplies =
      catalogDiscountActive &&
      (String(s.period_discount_category || "전체") === "전체" ||
        String(s.period_discount_category) === String(product.category));
    const discountRate = discountApplies
      ? Math.max(0, Math.min(100, Number(s.period_discount_rate || 0)))
      : 0;
    const salePrice = Math.max(0, regularPrice - Math.floor((regularPrice * discountRate) / 100));
    const pointMode = String(product.point_usage_mode || "full");
    const pointPercent =
      pointMode === "none"
        ? 0
        : pointMode === "partial"
          ? Math.max(1, Math.min(99, Number(product.point_max_percent || 50)))
          : 100;
    const paymentLabel =
      pointMode === "none"
        ? "현금 결제"
        : pointMode === "partial"
          ? `${pointName} 최대 ${pointPercent}% 사용`
          : Boolean(product.cash_payment_enabled)
            ? `현금·${pointName} 결제`
            : `${pointName} 전액 결제`;
    const rewardPoints = Math.floor((salePrice * purchaseRewardRate) / 100);
    const shippingEnabled = s.feature_shipping_enabled === "true";
    const freeThreshold = Number(s.shipping_free_threshold || 0);
    const baseShippingFee = Number(s.shipping_base_fee || 0);
    const shippingLabel = !shippingEnabled
      ? "배송비 주문서 확인"
      : freeThreshold > 0 && salePrice >= freeThreshold
        ? "무료배송"
        : baseShippingFee > 0
          ? `배송비 ${fmt(baseShippingFee)}원`
          : "무료배송";
    return { regularPrice, salePrice, discountRate, paymentLabel, rewardPoints, shippingLabel };
  }

  async function logout() {
    await fetch("/api/member-auth", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = "/";
  }

  function openPopupDestination(event: React.MouseEvent<HTMLAnchorElement>) {
    const popup = data.popups[0];
    const rawLink = String(popup?.link_url || "/").trim();
    let destination: URL;
    try {
      destination = new URL(rawLink, window.location.href);
    } catch {
      dismissPopup();
      return;
    }

    const isProductBrowseButton = String(popup?.button_text ?? "")
      .replace(/\s/g, "")
      .includes("상품둘러보기");
    const isStoreCatalog =
      destination.origin === window.location.origin &&
      destination.pathname === "/" &&
      (!destination.hash || destination.hash === "#products");

    if (!isProductBrowseButton || !isStoreCatalog) {
      dismissPopup();
      return;
    }

    event.preventDefault();
    dismissPopup();
    window.history.replaceState(null, "", "#products");
    window.requestAnimationFrame(() => {
      document.getElementById("products")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function dismissPopup() {
    const popup = data.popups[0];
    if (popup) {
      const popupVersion = encodeURIComponent(`${popup.title}|${popup.content}|${popup.image_url || ""}`);
      const key = `point-mall-popup-dismissed-v2:${data.member.id}:${popup.id}:${popupVersion}`;
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // 브라우저 저장소가 차단된 경우에도 현재 화면에서는 닫습니다.
      }
    }
    setPopupOpen(false);
  }

  return (
    <div className="store-shell" style={brandStyle}>
      <div className="member-ribbon">
        <span>{isYoutubeSkin ? "YOUTUBE LIVE SHOP" : "MEMBERS ONLY"}</span>
        <p>{isYoutubeSkin ? "유튜브에서 보고, 리워드 쇼핑몰에서 바로 주문하세요." : "현금·리워드·혼합 결제를 선택하는 회원 리워드 쇼핑몰입니다."}</p>
      </div>

      <header
        className={`store-header${channelContext ? " channel-store-header" : ""}`}
        style={channelContext ? { "--channel-header-color": channelContext.channel.theme_color || s.primary_color } as React.CSSProperties : undefined}
      >
        <div className="header-main">
          <a
            className={`brand-lockup${channelContext ? " channel-brand-lockup" : ""}`}
            href={channelContext ? `/channel/${channelContext.channel.slug}` : "/"}
            aria-label={channelContext ? `${channelContext.channel.name} 채널 홈` : `${s.brand_name} 홈`}
          >
            {channelContext?.channel.avatar_image_url || channelContext?.channel.image_url ? (
              <img className="channel-header-image" src={channelContext.channel.avatar_image_url || channelContext.channel.image_url} alt={`${channelContext.channel.name} 채널`} />
            ) : s.logo_url && !channelContext ? (
              <img src={s.logo_url} alt={s.brand_name} />
            ) : (
              <span className="brand-symbol">{channelContext ? String(channelContext.channel.name || "채널").slice(0, 2) : s.logo_text || "PG"}</span>
            )}
            <span className="brand-copy">
              <strong>{channelContext ? channelContext.channel.name : s.brand_name}</strong>
              <small>
                {channelContext
                  ? `${channelContext.channel.operator_name || channelContext.channel.name}의 라이브 쇼핑 채널`
                  : s.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}
              </small>
            </span>
          </a>
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={channelContext ? `${channelContext.channel.name} 상품을 검색하세요` : "어떤 선물을 찾고 계세요?"}
              aria-label="상품 검색"
            />
          </label>
          <nav className="header-actions" aria-label="회원 메뉴">
            {isGuest ? (
              <a href={signInPath} className="login-action">
                <span>○</span>
                <small>회원 로그인</small>
              </a>
            ) : (
              <>
                <button onClick={() => setAccountOpen(true)}>
                  <span>○</span>
                  <small>마이페이지</small>
                </button>
                <button onClick={() => setCartOpen(true)} className="cart-button">
                  <span>▢</span>
                  <small>장바구니</small>
                  {data.cart.length > 0 && <b>{data.cart.length}</b>}
                </button>
                <button onClick={logout}>
                  <span>↪</span>
                  <small>로그아웃</small>
                </button>
              </>
            )}
          </nav>
        </div>
        <div className="category-bar">
          {isYoutubeSkin ? <nav className="youtube-main-menu" aria-label="유튜브 쇼핑 메뉴">
            <a href="#youtube-home" className={activeYoutubeMenu === "home" ? "active" : ""} onClick={(event) => { event.preventDefault(); selectYoutubeMenu("home"); }}>홈</a>
            <a href="#youtube-live" className={activeYoutubeMenu === "live" ? "active" : ""} onClick={(event) => { event.preventDefault(); selectYoutubeMenu("live"); }}>라이브</a>
            <a href="#youtube-replays" className={activeYoutubeMenu === "replays" ? "active" : ""} onClick={(event) => { event.preventDefault(); selectYoutubeMenu("replays"); }}>다시보기</a>
            <a href="#youtube-shorts" className={activeYoutubeMenu === "shorts" ? "active" : ""} onClick={(event) => { event.preventDefault(); selectYoutubeMenu("shorts"); }}>쇼츠</a>
            <a
              href="#products"
              className={activeYoutubeMenu === "products" ? "active" : ""}
              aria-expanded={youtubeProductMenuEnabled && youtubeCategoriesOpen}
              aria-controls="youtube-product-categories"
              onClick={(event) => { event.preventDefault(); selectYoutubeMenu("products"); }}
            >상품</a>
            <a href="/guide">이용안내</a>
            {(ownsCurrentChannel || canSuperviseCurrentChannel) && <a className="channel-owner-menu" href={ownsCurrentChannel ? "/my-channel" : data.adminAccess?.channelManagementHref || "/admin"}>{ownsCurrentChannel ? "내 채널 관리" : "최고 관리자 채널 관리"}</a>}
          </nav> : <nav>
            {["홈", ...visibleMenuEntries.map((entry) => entry.name)].map((item) => (
              <button
                key={item}
                className={item === "홈" ? (category === "전체" && !search.trim() ? "active" : "") : (category === item ? "active" : "")}
                onClick={() => selectStoreMenu(item === "홈" ? "전체" : item)}
              >
                {item}
              </button>
            ))}
            {overflowMenuEntries.length > 0 && <details className="category-more"><summary>더보기</summary><div>{overflowMenuEntries.map((entry) => <button type="button" key={entry.id} className={category === entry.name ? "active" : ""} onClick={() => selectStoreMenu(entry.name)}>{entry.name}</button>)}</div></details>}
            {overflowMenuEntries.map((entry) => <button type="button" className="mobile-extra-category" key={`mobile-${entry.id}`} onClick={() => selectStoreMenu(entry.name)}>{entry.name}</button>)}
          </nav>}
          <div className="point-pill">
            {isGuest ? (
              <a href={signInPath}>로그인하고 리워드 혜택 받기 →</a>
            ) : (
              <>
                <span>{data.member.name}님</span>
                <strong>{fmt(data.member.points)}</strong>
                <em>{pointName}</em>
              </>
            )}
          </div>
        </div>
        {isYoutubeSkin && visibleCategoryEntries.length > 0 && <div className="youtube-category-strip open">
          <button
            type="button"
            className="youtube-category-toggle"
            aria-expanded="true"
            aria-controls="youtube-product-categories"
            onClick={() => selectYoutubeMenu("products")}
          >
            <span><b>상품 카테고리</b><small>{category === "전체" ? "전체 상품" : category}</small></span>
            <i aria-hidden="true">⌄</i>
          </button>
          <nav id="youtube-product-categories" aria-label="상품 분류">
            <button className={category === "전체" ? "active" : ""} onClick={() => selectYoutubeCategory("전체")}>전체 상품</button>
            {visibleCategoryEntries.map((entry) => <button key={entry.id} className={category === entry.name ? "active" : ""} onClick={() => selectYoutubeCategory(entry.name)}>{entry.name}</button>)}
          </nav>
        </div>}
        {selectedCategoryEntry && selectedCategoryEntry.children.some((child) => child.visible) && (
          <div className="category-subbar-shell">
            <div className="category-subbar-frame">
            <button type="button" className="category-scroll-button previous" onClick={() => scrollSubcategories(-1)} aria-label={`${selectedCategoryEntry.name} 이전 항목 보기`}>‹</button>
            <nav ref={subcategoryScrollRef} className="category-subbar" aria-label={`${selectedCategoryEntry.name} 하위 분류`}>
              <span className="category-subbar-label" aria-hidden="true">
                {selectedCategoryEntry.name}<i>›</i>
              </span>
              <button className={category === selectedCategoryEntry.name ? "active" : ""} onClick={() => isYoutubeSkin ? selectYoutubeCategory(selectedCategoryEntry.name) : selectStoreMenu(selectedCategoryEntry.name)}>
                {selectedCategoryEntry.name} 전체
              </button>
              {selectedCategoryEntry.children.filter((child) => child.visible).map((child) => (
                <Fragment key={child.id}>
                  <button className={category === child.name ? "active" : ""} onClick={() => isYoutubeSkin ? selectYoutubeCategory(child.name) : selectStoreMenu(child.name)}>{child.name}</button>
                  {child.children.filter((grandchild) => grandchild.visible).map((grandchild) => <button key={grandchild.id} className={`category-level-three ${category === grandchild.name ? "active" : ""}`} onClick={() => isYoutubeSkin ? selectYoutubeCategory(grandchild.name) : selectStoreMenu(grandchild.name)}>└ {grandchild.name}</button>)}
                </Fragment>
              ))}
            </nav>
            <button type="button" className="category-scroll-button next" onClick={() => scrollSubcategories(1)} aria-label={`${selectedCategoryEntry.name} 다음 항목 보기`}>›</button>
            </div>
          </div>
        )}
      </header>

      <main>
        {!channelContext && !!data.salesChannels?.length && <ChannelShowcase channels={data.salesChannels} products={data.products} />}
        {isYoutubeSkin && <YoutubeCommerceHome
          settings={s}
          products={data.products}
          currentLiveProduct={currentBroadcastProduct}
          introducedProducts={broadcastProductHistory}
          replays={publicReplays}
          shorts={publicShorts}
          pointName={pointName}
          productMeta={productCardMeta}
          channelId={Number(channelContext?.channel?.id || 0)}
          isGuest={isGuest}
        />}
        {!isYoutubeSkin && <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">POINTS INTO JOY</span>
            <h1>
              {(s.hero_title || "").split("\n").map((line, index) => (
                <span key={index}>{line}</span>
              ))}
            </h1>
            <p>{s.hero_subtitle}</p>
            <button
              className="hero-cta"
              onClick={() => scrollSectionBelowHeader("products")}
            >
              리워드 상품 둘러보기 <span>→</span>
            </button>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="gift-card gift-main">
              <span>FOR YOU</span>
              <strong>{s.logo_text || "PG"}</strong>
              <small>{s.brand_name}</small>
              <em>{s.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</em>
            </div>
            <div className="gift-card gift-side">
              <span>{pointName}</span>
              <strong>+</strong>
              <small>매일의 좋은 선택</small>
            </div>
          </div>
          <div className="hero-stats">
            {isGuest ? (
              <>
                <div>
                  <span>MEMBER BENEFIT</span>
                  <strong>회원 전용</strong>
                  <em>{pointName} 몰</em>
                </div>
                <a className="hero-login-link" href={signInPath}>로그인하고 시작하기</a>
              </>
            ) : (
              <>
                <div>
                  <span>MY BALANCE</span>
                  <strong>{fmt(data.member.points)}</strong>
                  <em>{pointName}</em>
                </div>
                <button onClick={() => { setAccountTab("points"); setAccountOpen(true); }}>
                  이용 내역 보기
                </button>
              </>
            )}
          </div>
        </section>}

        {data.notices[0] && (
          <section className="notice-strip">
            <b>공지</b>
            <span>{data.notices[0].title}</span>
            <p>{data.notices[0].content}</p>
          </section>
        )}

        <section className={`benefit-row ${isYoutubeSkin ? "youtube-benefits" : ""}`} aria-label="쇼핑몰 특징">
          <article>
            <span className="benefit-icon">P</span>
            <div><strong>{isYoutubeSkin ? "영상에서 바로 주문" : "결제수단 선택"}</strong><p>{isYoutubeSkin ? "생방송·재방송·쇼츠의 상품을 한곳에서" : "리워드·무통장입금·카카오톡 송금·혼합 결제"}</p></div>
          </article>
          <article>
            <span className="benefit-icon">✓</span>
            <div><strong>검증된 상품</strong><p>운영자가 직접 등록한 상품만</p></div>
          </article>
          <article>
            <span className="benefit-icon">↗</span>
            <div><strong>간편한 주문</strong><p>배송 정보 입력 후 바로 접수</p></div>
          </article>
          <article>
            <span className="benefit-icon">♡</span>
            <div><strong>회원 혜택</strong><p>보유 리워드와 주문을 한곳에서</p></div>
          </article>
        </section>

        {!isYoutubeSkin && category === "전체" && !search.trim() && homeDisplaySections.map((section) => (
          <section className="home-display-section" key={section.id}>
            <div className="section-heading">
              <div><span>CURATED COLLECTION</span><h2>{section.title}</h2></div>
              <a href="#products">전체 상품 보기</a>
            </div>
            <div className="home-display-grid">
              {section.items.map((product: any) => {
                const meta = productCardMeta(product);
                const productHref = `/products/${product.id}`;
                const needsOptions = hasProductOptions(product.options_json);
                const soldOut = Number(product.stock) < 1;
                return (
                  <article key={product.id}>
                    <a className="home-product-summary" href={productHref} aria-label={`${product.name} 상품 보기`}>
                      <SafeProductImage src={product.image_url} alt={product.name} />
                      <span>{product.badge || product.category}</span>
                      <strong>{product.name}</strong>
                      <small>{fmt(meta.salePrice)}원</small>
                    </a>
                    <div className="home-product-actions">
                      <a href={productHref}>상품 보기</a>
                      <button
                        type="button"
                        disabled={cartBusyProductIds.has(Number(product.id)) || soldOut}
                        onClick={() => {
                          if (isGuest) {
                            window.location.href = signInPath;
                            return;
                          }
                          if (needsOptions) {
                            window.location.href = productHref;
                            return;
                          }
                          act(
                            { action: "cart.add", productId: product.id, quantity: 1 },
                            "장바구니에 상품을 담았습니다.",
                          );
                        }}
                      >
                        {soldOut ? "품절" : isGuest ? "로그인 후 구매" : needsOptions ? "옵션 선택" : cartBusyProductIds.has(Number(product.id)) ? "담는 중…" : "장바구니 담기"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <section className={`product-section ${channelContext ? "channel-product-gallery" : ""}`} id="products">
          <div className="section-heading">
            <div>
              <span>{channelContext ? "CHANNEL COLLECTION" : isYoutubeSkin ? "SHOP THE VIDEO" : "CURATED FOR MEMBERS"}</span>
              <h2>{category === "전체" ? (isYoutubeSkin ? "영상 밖에서도 만나는 전체 상품" : "이번 주 추천 선물") : `${category} 상품`}</h2>
              {channelContext && <p>{channelContext.channel.name}에서 소개하고 판매하는 상품을 방송이 끝난 뒤에도 편하게 둘러보세요.</p>}
            </div>
            <p>총 {totalProducts}개 · {page}/{totalPages} 페이지</p>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const wished = data.wishlist.includes(Number(product.id));
              const needsOptions = hasProductOptions(product.options_json);
              const productHref = `/products/${product.id}${channelContext ? `?channel=${channelContext.channel.id}` : ""}`;
              const cardMeta = productCardMeta(product);
              return (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    <a className="product-image-link" href={`/products/${product.id}${channelContext ? `?channel=${channelContext.channel.id}` : ""}`} aria-label={`${product.name} 상품보기`}>
                      <SafeProductImage src={product.image_url} alt={product.name} />
                    </a>
                    {product.badge && <span className="product-badge">{product.badge}</span>}
                    <button
                      className={`wish-button ${wished ? "active" : ""}`}
                      disabled={wishlistBusyProductIds.has(Number(product.id))}
                      onClick={() => {
                        if (isGuest) { window.location.href = signInPath; return; }
                        act(
                          { action: "wishlist.toggle", productId: product.id },
                          wished ? "찜 목록에서 삭제했습니다." : "찜 목록에 담았습니다.",
                        );
                      }}
                      aria-label={isGuest ? "로그인 후 찜하기" : wished ? "찜 해제" : "찜하기"}
                    >
                      {wished ? "♥" : "♡"}
                    </button>
                  </div>
                  <div className="product-info">
                    <span className="product-category">{product.category}{product.subcategory ? ` › ${product.subcategory}` : ""}{product.brand ? ` · ${product.brand}` : ""}</span>
                    <h3><a href={`/products/${product.id}${channelContext ? `?channel=${channelContext.channel.id}` : ""}`}>{product.name}</a></h3>
                    <p>{product.description}</p>
                    <div className="rating-line">
                      <span>★ {Number(product.rating).toFixed(1)}</span>
                      <em>후기 {product.review_count}</em>
                    </div>
                    <div className="price-line">
                      {cardMeta.discountRate > 0 && <del>{fmt(cardMeta.regularPrice)}원</del>}
                      <strong>{fmt(cardMeta.salePrice)}</strong>
                      <em>원</em>
                    </div>
                    <div className="product-benefit-meta">
                      <span>{cardMeta.shippingLabel}</span>
                      {cardMeta.paymentLabel !== `현금·${pointName} 결제` && <span>{cardMeta.paymentLabel}</span>}
                      {cardMeta.rewardPoints > 0 && <strong>최대 {fmt(cardMeta.rewardPoints)} {pointName} 적립</strong>}
                    </div>
                    <div className="product-card-actions">
                      <a href={productHref}>상품 보기</a>
                      <button
                        disabled={cartBusyProductIds.has(Number(product.id)) || Number(product.stock) < 1}
                        onClick={() => {
                          if (isGuest) {
                            window.location.href = signInPath;
                            return;
                          }
                          if (needsOptions) {
                            window.location.href = productHref;
                            return;
                          }
                          act(
                            { action: "cart.add", productId: product.id, quantity: 1 },
                            "장바구니에 상품을 담았습니다.",
                          );
                        }}
                      >
                        {Number(product.stock) < 1 ? "품절" : isGuest ? "로그인" : needsOptions ? "구매하기" : cartBusyProductIds.has(Number(product.id)) ? "담는 중…" : "장바구니 담기"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {catalogLoading && <div className="empty-state">상품을 불러오는 중입니다.</div>}
          {!catalogLoading && !products.length && <div className="empty-state">조건에 맞는 상품이 없습니다.</div>}
          {(totalPages > 1 || Boolean(channelContext)) && (
            <nav className="pagination" aria-label="상품 페이지">
              <button
                className="pagination-arrow"
                onClick={() => moveToPage(page - 1)}
                disabled={page === 1}
                aria-label="이전 페이지"
              >
                <span aria-hidden="true">←</span> 이전
              </button>
              <div className="pagination-status" aria-live="polite">
                <span>{totalPages > 1 ? "상품 페이지 이동" : "현재 전체 상품"}</span>
                <strong>{page} <i>/</i> {totalPages}</strong>
                <span className="pagination-progress" aria-hidden="true"><i style={{ width: `${(page / totalPages) * 100}%` }} /></span>
              </div>
              <button
                className="pagination-arrow"
                onClick={() => moveToPage(page + 1)}
                disabled={page === totalPages}
                aria-label="다음 페이지"
              >
                다음 <span aria-hidden="true">→</span>
              </button>
            </nav>
          )}
        </section>

        {!channelContext && <section className="brand-promise">
          <div>
            <span>{s.logo_text || "PG"}</span>
            <h2>리워드가 좋은 경험이 되도록</h2>
            <p>
              상품 등록부터 리워드 지급, 주문 처리까지 운영자가 직접 관리합니다.
              상품을 고른 뒤 마지막 주문 단계에서 리워드와 현금 사용액을 선택합니다.
            </p>
          </div>
          <dl>
            <div><dt>01</dt><dd>회원 전용 접근</dd></div>
            <div><dt>02</dt><dd>리워드 자동 차감</dd></div>
            <div><dt>03</dt><dd>주문 상태 추적</dd></div>
          </dl>
        </section>}

        {!channelContext && <section className="member-usage-manual" aria-labelledby="member-usage-title">
          <header>
            <div><span>MEMBER GUIDE</span><h2 id="member-usage-title">처음 가입부터 주문 완료까지</h2></div>
            <p>회원이 리워드를 받고 상품을 주문한 뒤 배송과 후기 혜택까지 확인하는 전체 이용 순서입니다.</p>
          </header>
          <ol>
            {[
              ["01", "회원가입·로그인", "이메일로 가입하고 로그인합니다. 회원 정보와 배송지는 마이페이지에서 관리할 수 있습니다."],
              ["02", "리워드 확인", `출석·추천·구매·후기 등으로 받은 ${pointName}는 마이페이지의 리워드 내역에서 확인합니다.`],
              ["03", "상품·옵션 선택", "카테고리에서 상품을 찾고 상세정보, 재고, 옵션, 사용 가능한 리워드 한도를 확인합니다."],
              ["04", "장바구니·배송지", "수량과 옵션을 다시 확인하고 받는 사람, 연락처, 주소, 배송 요청사항을 입력합니다."],
              ["05", "결제수단 선택", "리워드 전액, 현금, 리워드+현금 중에서 선택합니다. 현금 주문은 안내된 계좌 또는 카카오톡 송금 후 확인을 기다립니다."],
              ["06", "주문·배송 추적", "마이페이지에서 접수, 결제 확인, 상품 준비, 배송중, 배송완료 상태와 운송장 정보를 확인합니다."],
              ["07", "후기·취소·반품", "배송완료 상품은 후기를 작성해 혜택을 받을 수 있습니다. 취소·반품 시 사용 조건에 따라 리워드가 반환 또는 회수됩니다."],
            ].map(([no, title, body]) => <li key={no}><span>{no}</span><div><strong>{title}</strong><p>{body}</p></div></li>)}
          </ol>
          <div className="member-manual-help"><strong>이용 중 도움이 필요하신가요?</strong><p>공지사항과 이용안내를 먼저 확인한 뒤 고객센터 또는 화면의 상담 채널로 문의해 주세요.</p><a href="/guide">상세 이용안내 보기 →</a></div>
        </section>}
        {channelContext && !!channelContext.otherChannels?.length && <OtherChannelShowcase currentChannel={channelContext.channel} channels={channelContext.otherChannels} />}
      </main>

      <footer className="store-footer">
        <a className="brand-lockup footer-brand" href="/" aria-label={`${s.brand_name || "쇼핑몰"} 홈으로 이동`}>
          <span className="brand-symbol">{s.logo_text || "PG"}</span>
          <span className="brand-copy">
            <strong>{s.brand_name}</strong>
            <small>{s.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small>
          </span>
        </a>
        <p>{s.footer_notice || "리워드 쇼핑몰 · 1P = 1원 · 입금 확인 후 주문 처리"}</p>
        <p>고객센터 {s.support_phone} · {s.support_hours || "평일 09:00–18:00"}</p>
        <p>{s.company_name} · 대표 {s.representative_name} · 사업자번호 {s.business_number}</p>
        <p>{s.company_address}</p>
        <nav aria-label="약관 및 안내">
          <a href="/guide">이용안내</a>
          <a href="/notices">공지사항</a>
          <a href="/terms">이용약관</a>
          <a href="/privacy">개인정보처리방침</a>
          <a href="/admin/login">관리자 로그인</a>
        </nav>
      </footer>

      <nav className="mobile-shop-nav" aria-label="모바일 빠른 메뉴">
        <a href="/" aria-label="홈으로 이동"><span aria-hidden="true">⌂</span><b>홈</b></a>
        <a href={isYoutubeSkin ? "#youtube-live" : "#products"} onClick={() => isYoutubeSkin && selectYoutubeMenu("live")} aria-label={isYoutubeSkin ? "생방송으로 이동" : "추천 상품으로 이동"}><span aria-hidden="true">▶</span><b>{isYoutubeSkin ? "방송" : "추천"}</b></a>
        <button
          type="button"
          aria-label={isYoutubeSkin ? "상품 메뉴 열기 또는 닫기" : "상품 메뉴 보기"}
          aria-expanded={isYoutubeSkin ? activeYoutubeMenu === "products" && youtubeCategoriesOpen : undefined}
          aria-controls={isYoutubeSkin ? "youtube-product-categories" : undefined}
          onClick={() => {
            if (isYoutubeSkin) {
              selectYoutubeMenu("products");
              return;
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        ><span aria-hidden="true">▦</span><b>상품</b></button>
        <button type="button" onClick={() => {
          if (isGuest) { window.location.href = signInPath; return; }
          setAccountTab("wishlist");
          setAccountOpen(true);
        }} aria-label="찜한 상품 열기"><span aria-hidden="true">♡</span><b>찜</b>{!isGuest && data.wishlist.length > 0 && <i>{data.wishlist.length}</i>}</button>
        <button type="button" onClick={() => {
          if (isGuest) { window.location.href = signInPath; return; }
          setAccountOpen(true);
        }} aria-label={isGuest ? "로그인" : "마이페이지 열기"}><span aria-hidden="true">○</span><b>{isGuest ? "로그인" : "MY"}</b></button>
      </nav>

      {cartOpen && (
        <CartPanel
          data={data}
          pointName={pointName}
          busy={busy}
          close={() => setCartOpen(false)}
          act={act}
        />
      )}

      {accountOpen && (
        <AccountPanel
          data={data}
          pointName={pointName}
          tab={accountTab}
          setTab={setAccountTab}
          busy={busy}
          close={() => setAccountOpen(false)}
          act={act}
        />
      )}

      {popupOpen && data.popups[0] && !isGuest && (
        <div
          className="modal-backdrop"
          style={{
            alignItems: Number(data.popups[0].position_y || 50) < 34
              ? "start"
              : Number(data.popups[0].position_y || 50) > 66
                ? "end"
                : "center",
            justifyItems: Number(data.popups[0].position_x || 50) < 34
              ? "start"
              : Number(data.popups[0].position_x || 50) > 66
                ? "end"
                : "center",
          }}
        >
          <section
            className="welcome-popup"
            style={{
              backgroundColor: data.popups[0].background_color,
              backgroundImage: data.popups[0].image_url
                ? `linear-gradient(rgba(17,36,62,.35),rgba(17,36,62,.7)),url(${data.popups[0].image_url})`
                : undefined,
              width: `min(calc(100% - 32px), ${Number(data.popups[0].width || 420)}px)`,
              minHeight: `${Number(data.popups[0].height || 460)}px`,
            }}
          >
            <button
              className="modal-close light"
              onClick={dismissPopup}
              aria-label="팝업 닫고 다시 보지 않기"
            >
              ×
            </button>
            <span>YOUTUBE LIVE · REWARD</span>
            <h2>{data.popups[0].title}</h2>
            <p>{data.popups[0].content}</p>
            <div className="popup-benefits" aria-label="생방송 쇼핑 혜택">
              <b>LIVE 방송 상품</b>
              <b>리워드 사용</b>
              <b>현금 혼합결제</b>
            </div>
            <a
              className="popup-cta"
              href={data.popups[0].link_url || "/"}
              target={
                String(data.popups[0].button_text ?? "")
                  .replace(/\s/g, "")
                  .includes("상품둘러보기")
                  ? "_self"
                  : data.popups[0].target === "_blank"
                    ? "_blank"
                    : "_self"
              }
              onClick={openPopupDestination}
            >
              {data.popups[0].button_text}
            </a>
            <small className="popup-dismiss-note">
              닫으면 이 안내는 다시 표시되지 않습니다.
            </small>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      <FloatingContact settings={s} />
    </div>
  );
}

function OtherChannelShowcase({ currentChannel, channels }: { currentChannel: any; channels: any[] }) {
  const channelTrackRef = useRef<HTMLDivElement>(null);
  const moveChannels = (direction: number) => channelTrackRef.current?.scrollBy({ left: direction * Math.max(320, channelTrackRef.current.clientWidth * .82), behavior: "smooth" });
  return <section className="other-channel-showcase" id="other-channels" aria-labelledby="other-channel-title">
    <div className="other-channel-intro"><span>DISCOVER MORE</span><h2 id="other-channel-title">다른 채널도 만나보세요</h2><p>{currentChannel.name}의 상품을 모두 살펴보셨다면, 새로운 진행자와 다른 취향의 방송 상품도 자유롭게 둘러보세요.</p><b>채널을 이동해도 장바구니와 리워드는 그대로 유지됩니다.</b>{channels.length > 2 && <div className="other-channel-controls"><button type="button" onClick={() => moveChannels(-1)} aria-label="이전 채널">←</button><span>{channels.length}개 채널</span><button type="button" onClick={() => moveChannels(1)} aria-label="다음 채널">→</button></div>}</div>
    <div className="other-channel-grid" ref={channelTrackRef}>{channels.map((channel) => <a key={channel.id} href={`/channel/${channel.slug}?from=${currentChannel.slug}`} style={{ "--other-channel-color": channel.primary_color || "#6750c9" } as React.CSSProperties}>
      <span className="other-channel-thumb">{channel.avatar_image_url || channel.image_url || channel.product_image_url ? <img src={channel.avatar_image_url || channel.image_url || channel.product_image_url} alt={`${channel.name} 채널`} /> : String(channel.name || "CH").slice(0, 2)}</span>
      <div className="other-channel-copy"><small>SHOPPING CHANNEL</small><strong>{channel.name}</strong><em>{channel.description || `${channel.operator_name || "진행자"}와 함께 만나는 라이브 쇼핑 채널입니다.`}</em></div>
      <div className="other-channel-meta"><b>{Number(channel.product_count || 0)}개 상품</b><i>채널 둘러보기 <span aria-hidden="true">→</span></i></div>
    </a>)}</div>
  </section>;
}

function ChannelShowcase({ channels, products }: { channels: any[]; products: any[] }) {
  const [activeChannelIndex, setActiveChannelIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const normalizedIndex = channels.length ? ((activeChannelIndex % channels.length) + channels.length) % channels.length : 0;
  const moveChannel = (direction: number) => setActiveChannelIndex((current) => channels.length ? (current + direction + channels.length) % channels.length : 0);

  useEffect(() => {
    if (channels.length <= 1 || carouselPaused) return;
    const timer = window.setInterval(() => moveChannel(1), 5000);
    return () => window.clearInterval(timer);
  }, [channels.length, carouselPaused]);

  return <section className="channel-showcase" aria-label="판매 채널">
    <div className="channel-showcase-heading"><div><span>LIVE SHOPPING CHANNELS</span><h2>오늘의 HOT 채널</h2><p>좋아하는 채널에서 방송과 추천 상품을 함께 만나보세요.</p></div><b>{channels.length}개 채널</b></div>
    <div className="channel-showcase-carousel" onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onFocus={() => setCarouselPaused(true)} onBlur={() => setCarouselPaused(false)}>
      {channels.length > 1 && <button className="channel-showcase-nav is-prev" type="button" aria-label="이전 채널" onClick={() => moveChannel(-1)}>‹</button>}
      <div className="channel-showcase-track" style={{ "--active-channel-index": normalizedIndex } as React.CSSProperties}>{channels.map((channel, index) => {
      const productIds = String(channel.product_ids || "").split(",").map(Number).filter(Boolean);
      const linkedProducts = productIds.map((id) => products.find((product) => Number(product.id) === id)).filter(Boolean).slice(0, 3);
      const rawDistance = Math.abs(index - normalizedIndex);
      const distance = Math.min(rawDistance, channels.length - rawDistance);
      const directOffset = index - normalizedIndex;
      const channelOffset = Math.abs(directOffset) <= channels.length / 2 ? directOffset : directOffset > 0 ? directOffset - channels.length : directOffset + channels.length;
      return <article key={channel.id} className={index === normalizedIndex ? "is-active" : distance === 1 ? "is-nearby" : "is-distant"} aria-hidden={distance > 1} style={{ "--channel-color": channel.theme_color || "#111827", "--channel-offset": channelOffset } as React.CSSProperties}>
        <div className="channel-showcase-image">{channel.image_url ? <img src={channel.image_url} alt={`${channel.name} 채널`} /> : <span>{String(channel.name || "CH").slice(0, 2)}</span>}</div>
        <div className="channel-showcase-copy"><small>SHOPPING CHANNEL</small><h3>{channel.name}</h3><p>{channel.description || `${channel.operator_name || channel.name}의 추천 상품과 라이브 방송을 만나보세요.`}</p><em>{channel.operator_name || "채널 운영자"}</em></div>
        {!!linkedProducts.length && <div className="channel-showcase-products">{linkedProducts.map((product) => <a key={product.id} href={`/products/${product.id}`}><SafeProductImage src={product.image_url} alt={product.name} /><span>{product.name}</span></a>)}</div>}
        <a className="channel-showcase-action" href={`/channel/${channel.slug}`}>채널 둘러보기 →</a>
      </article>;
      })}</div>
      {channels.length > 1 && <button className="channel-showcase-nav is-next" type="button" aria-label="다음 채널" onClick={() => moveChannel(1)}>›</button>}
    </div>
    {channels.length > 1 && <div className="channel-showcase-dots" aria-label="채널 선택">{channels.map((channel, index) => <button key={channel.id} type="button" className={index === normalizedIndex ? "active" : ""} aria-label={`${channel.name} 채널 보기`} aria-current={index === normalizedIndex ? "true" : undefined} onClick={() => setActiveChannelIndex(index)} />)}</div>}
  </section>;
}

function YoutubeLiveChat({ videoId, watchUrl }: { videoId: string; watchUrl: string }) {
  const [canEmbed, setCanEmbed] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setCanEmbed(host !== "localhost" && host !== "127.0.0.1");
  }, []);
  if (canEmbed) {
    return <div className="youtube-chat-frame"><iframe src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}`} title="유튜브 실시간 채팅" /></div>;
  }
  return <div className="youtube-chat-unavailable"><span aria-hidden="true">●</span><strong>생방송이 종료되어 채팅이 불가능합니다.</strong><p>지난 방송은 영상으로 편하게 시청할 수 있으며, 채팅은 다음 생방송에서 다시 열립니다.</p><a href={watchUrl} target="_blank" rel="noreferrer">유튜브에서 방송 확인하기</a></div>;
}

function YoutubeCommerceHome({ settings, products, currentLiveProduct, introducedProducts, replays, shorts, pointName, productMeta, channelId = 0, isGuest = true }: { settings: Record<string, string>; products: any[]; currentLiveProduct: any; introducedProducts: any[]; replays: any[]; shorts: any[]; pointName: string; productMeta: (product: any) => any; channelId?: number; isGuest?: boolean }) {
  const liveVideoId = youtubeVideoId(settings.youtube_live_url);
  // The URL can remain saved for the next broadcast. It must never create a
  // YouTube video or chat iframe while this channel is hidden.
  const liveVisible = isCustomerLiveBroadcastVisible(settings, liveVideoId);
  const liveOrientation = settings.youtube_live_orientation === "vertical" ? "vertical" : "horizontal";
  const previousLiveProducts = introducedProducts.filter((product) => Number(product?.id) !== Number(currentLiveProduct?.id)).slice(-3).reverse();
  const youtubeWatchUrl = liveVideoId ? `https://www.youtube.com/watch?v=${liveVideoId}` : "https://www.youtube.com";
  return <div className="youtube-commerce-home" id="youtube-home">
    <section className={`youtube-live-stage ${liveVisible ? "is-live" : "is-offline"} live-${liveOrientation}`} id="youtube-live">
      <div className="youtube-stage-heading"><div><span>{liveVisible ? "● LIVE NOW" : "NEXT LIVE"}</span><h1>{settings.youtube_live_title || "유튜브 라이브 쇼핑"}</h1><p>{settings.youtube_live_notice || "방송에서 소개한 상품을 사이트에서 바로 주문할 수 있습니다."}</p></div><a href="#products">전체 상품 보기 →</a></div>
      {liveVisible ? liveOrientation === "vertical" ? <div className="youtube-vertical-live-grid">
        <aside className="vertical-live-next"><span>INTRODUCED PRODUCTS</span><strong>소개된 상품</strong><p>방송에서 앞서 소개한 상품을 다시 확인하세요.</p><div>{previousLiveProducts.length ? previousLiveProducts.map((product) => <VideoProductCard key={product.id} product={product} meta={productMeta(product)} pointName={pointName} channelId={channelId} />) : <div className="vertical-live-empty">아직 소개된 상품이 없습니다.</div>}</div></aside>
        <div className="youtube-video-frame vertical-video"><iframe src={`https://www.youtube.com/embed/${liveVideoId}?autoplay=0&rel=0`} title={settings.youtube_live_title || "유튜브 세로 생방송"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
        <aside className="vertical-live-side"><div className="vertical-current-product"><span>지금 방송 중인 상품</span>{currentLiveProduct ? <VideoProductCard product={currentLiveProduct} meta={productMeta(currentLiveProduct)} pointName={pointName} channelId={channelId} /> : <div className="vertical-live-empty">현재 상품을 연결해 주세요.</div>}</div><YoutubeLiveChat videoId={liveVideoId} watchUrl={youtubeWatchUrl} /></aside>
      </div> : <div className="youtube-live-grid"><div className="youtube-video-frame"><iframe src={`https://www.youtube.com/embed/${liveVideoId}?autoplay=0&rel=0`} title={settings.youtube_live_title || "유튜브 생방송"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><YoutubeLiveChat videoId={liveVideoId} watchUrl={youtubeWatchUrl} /></div> : <div className="youtube-offline-card"><span>방송 준비 중</span><strong>생방송이 시작되면 이곳에서 바로 시청할 수 있습니다.</strong><p>생방송이 종료되어 지금은 채팅에 참여할 수 없습니다. 아래 재방송과 쇼츠를 확인해 보세요.</p><a href="#youtube-replays">재방송 보기</a></div>}
      {liveVisible && <a className="mobile-youtube-chat-link" href={youtubeWatchUrl} target="_blank" rel="noreferrer">유튜브에서 채팅 참여하기</a>}
      {!!introducedProducts.length && (liveOrientation !== "vertical" || !liveVisible) && <div className="live-product-row"><div className="live-product-row-title"><span>INTRODUCED PRODUCTS</span><strong>방송에서 소개된 상품</strong></div>{introducedProducts.slice(-3).reverse().map((product) => <VideoProductCard key={product.id} product={product} meta={productMeta(product)} pointName={pointName} channelId={channelId} />)}</div>}
    </section>

    <section className="youtube-replay-section" id="youtube-replays"><div className="youtube-section-heading"><div><span>REPLAY SHOPPING</span><h2>지난 방송을 보며 바로 주문하세요</h2><p>영상 시간에 맞춰 소개 상품이 자동으로 바뀝니다.</p></div><b>{replays.length}개 방송</b></div>{replays.length ? <ReplayShopping replays={replays} products={products} productMeta={productMeta} pointName={pointName} channelId={channelId} /> : <div className="youtube-content-empty"><strong>공개된 재방송을 준비 중입니다.</strong><p>관리자가 상품 타임라인까지 완료한 방송만 이곳에 표시됩니다.</p></div>}</section>

    <section className="youtube-shorts-section" id="youtube-shorts"><div className="youtube-section-heading"><div><span>YOUTUBE SHORTS</span><h2>짧게 보고 빠르게 고르는 상품</h2><p>쇼츠에서 마음에 든 상품을 바로 확인하고 구매할 수 있습니다.</p></div><b>{shorts.length}개 쇼츠</b></div>{shorts.length ? <div className="youtube-shorts-grid">{shorts.map((short) => { const id = youtubeVideoId(short.youtubeUrl); const product = products.find((item) => Number(item.id) === Number(short.productId)); const href = product ? `/products/${product.id}${channelId ? `?channel=${channelId}` : ""}` : "#products"; return <article key={short.id}><div className="short-video"><iframe loading="lazy" src={`https://www.youtube.com/embed/${id}?rel=0`} title={short.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><div><span>SHORTS</span><strong>{short.title}</strong>{product ? <><p>{product.name} · {fmt(productMeta(product).salePrice)}원</p><div className="short-product-actions"><a href={href}>상품 보기</a><a className="buy" href={`${href}#purchase`}>{isGuest ? "로그인 후 구매" : "바로 구매"}</a></div></> : <><p className="short-product-pending">연결 상품을 준비 중입니다.</p><a className="short-catalog-link" href="#products">채널 전체 상품 보기 →</a></>}</div></article>; })}</div> : <div className="youtube-content-empty compact"><strong>등록된 쇼츠가 없습니다.</strong><p>새 쇼츠가 공개되면 이곳에 함께 표시됩니다.</p></div>}</section>
  </div>;
}

function VideoProductCard({ product, meta, pointName, channelId = 0 }: { product: any; meta: any; pointName: string; channelId?: number }) {
  const href = `/products/${product.id}${channelId ? `?channel=${channelId}` : ""}`;
  return <article className="video-product-card"><a href={href}><SafeProductImage src={product.image_url} alt={product.name} /></a><div><span>{product.badge || product.category}</span><strong>{product.name}</strong><p>{fmt(meta.salePrice)}원</p><small>{meta.paymentLabel}{meta.rewardPoints > 0 ? ` · ${fmt(meta.rewardPoints)} ${pointName} 적립` : ""}</small><a className="video-product-action" href={href}>상품보기 <b aria-hidden="true">→</b></a></div></article>;
}

export function isCustomerLiveBroadcastVisible(settings: Record<string, string>, videoId?: string) {
  return settings.youtube_live_enabled === "true" && Boolean(videoId);
}

function ReplayShopping({ replays, products, productMeta, pointName, channelId = 0 }: { replays: any[]; products: any[]; productMeta: (product: any) => any; pointName: string; channelId?: number }) {
  const orderedReplays = useMemo(() => [...replays].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || ""))), [replays]);
  const [selectedId, setSelectedId] = useState(String(orderedReplays[0]?.id || ""));
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const replay = orderedReplays.find((item) => String(item.id) === selectedId);
  const replayOrientation = replay?.orientation === "vertical" ? "vertical" : "horizontal";
  const timeline = [...(replay?.timeline || [])].filter((entry) => Number(entry.productId) > 0).sort((a, b) => timelineSeconds(a.time) - timelineSeconds(b.time));
  const activeEntry = [...timeline].reverse().find((entry) => timelineSeconds(entry.time) <= currentTime) || timeline[0];
  const activeProduct = products.find((product) => Number(product.id) === Number(activeEntry?.productId));
  const playerElementId = `replay-player-${String(replay?.id || "none").replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    setCurrentTime(0);
    pendingSeekRef.current = null;
    playerReadyRef.current = false;
    if (timerRef.current) window.clearInterval(timerRef.current);
    playerRef.current?.destroy?.();
    playerRef.current = null;
    const videoId = youtubeVideoId(replay?.youtubeUrl);
    if (!videoId) return;
    const create = async () => {
      try {
        await loadYoutubePlayerApi();
      } catch {
        return;
      }
      if (cancelled || playerRef.current) return;
      const YT = (window as any).YT;
      if (!YT?.Player || !document.getElementById(playerElementId)) return;
      playerRef.current = new YT.Player(playerElementId, {
        videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerReadyRef.current = true;
            const queuedSeconds = pendingSeekRef.current;
            if (queuedSeconds !== null) {
              try {
                if (typeof playerRef.current?.loadVideoById === "function") {
                  playerRef.current.loadVideoById({ videoId, startSeconds: queuedSeconds });
                } else {
                  playerRef.current?.seekTo?.(queuedSeconds, true);
                  playerRef.current?.playVideo?.();
                }
              } catch {
                playerRef.current?.seekTo?.(queuedSeconds, true);
                playerRef.current?.playVideo?.();
              }
              pendingSeekRef.current = null;
            }
            timerRef.current = window.setInterval(() => {
              const value = Number(playerRef.current?.getCurrentTime?.() || 0);
              setCurrentTime(value);
            }, 500);
          },
          onError: () => { playerReadyRef.current = false; },
        },
      });
    };
    void create();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      playerReadyRef.current = false;
      pendingSeekRef.current = null;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [selectedId, replay?.youtubeUrl, playerElementId]);

  const seek = (seconds: number) => {
    const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    setCurrentTime(safeSeconds);
    pendingSeekRef.current = safeSeconds;
    if (!playerReadyRef.current || !playerRef.current?.seekTo) {
      return;
    }
    const videoId = youtubeVideoId(replay?.youtubeUrl);
    try {
      if (typeof playerRef.current.loadVideoById === "function") {
        playerRef.current.loadVideoById({ videoId, startSeconds: safeSeconds });
      } else {
        playerRef.current.seekTo(safeSeconds, true);
        playerRef.current.playVideo?.();
      }
    } catch {
      playerRef.current.seekTo(safeSeconds, true);
      playerRef.current.playVideo?.();
    }
    pendingSeekRef.current = null;
  };
  return <div className="replay-accordion" aria-label="지난 방송 목록">{orderedReplays.map((item, index) => {
    const itemId = String(item.id);
    const expanded = itemId === selectedId;
    const itemTimelineCount = (item.timeline || []).filter((entry: any) => Number(entry.productId) > 0).length;
    return <article key={item.id} className={`replay-accordion-item ${expanded ? "open" : ""}`}>
      <button type="button" className="replay-accordion-toggle" aria-expanded={expanded} onClick={() => setSelectedId(expanded ? "" : itemId)}>
        <span className="replay-accordion-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="replay-accordion-title"><small><b>REPLAY</b>{item.date || "지난 방송"}</small><strong>{item.title}</strong></span>
        <span className="replay-accordion-meta"><small>{item.orientation === "vertical" ? "세로 9:16" : "가로 16:9"}</small><b>상품 {itemTimelineCount}개</b></span>
        <span className="replay-accordion-action">{expanded ? "접기" : "방송 보기"}<i aria-hidden="true">⌄</i></span>
      </button>
      {expanded && replay && <div className={`replay-shopping replay-${replayOrientation}`}><div className="replay-archive-head"><div><span>지난 방송 다시보기</span><strong>{replay.title}</strong></div><p><b>{replay.date || "방송일 미등록"}</b><span>{replayOrientation === "vertical" ? "세로 방송 9:16" : "가로 방송 16:9"}</span><span>상품 구간 {timeline.length}개</span></p></div><div className={`replay-experience replay-experience-${replayOrientation}`}><div className="replay-video-column"><div className={`youtube-video-frame replay-video-frame ${replayOrientation === "vertical" ? "vertical-video" : ""}`}><div id={playerElementId} /></div><div className="replay-timeline"><span><b>상품 장면 바로가기</b><small>원하는 상품을 누르면 영상이 해당 장면으로 이동합니다</small></span><div>{timeline.map((entry, index) => { const seconds = timelineSeconds(entry.time); const product = products.find((productItem) => Number(productItem.id) === Number(entry.productId)); return <button type="button" key={entry.id} className={entry.id === activeEntry?.id ? "active" : ""} onClick={() => seek(seconds)} aria-label={`${timeLabel(seconds)} ${product?.name || "상품"} 장면부터 재생`}><span className="replay-chapter-number">{String(index + 1).padStart(2, "0")}</span><span className="replay-chapter-copy"><b>{timeLabel(seconds)}</b><small>{product?.name || "상품"}</small></span><i aria-hidden="true">▶</i></button>; })}</div></div></div><aside className="replay-current-product"><span>REPLAY · 지금 영상에 나온 상품</span>{activeProduct ? <VideoProductCard product={activeProduct} meta={productMeta(activeProduct)} pointName={pointName} channelId={channelId} /> : <div className="youtube-content-empty compact"><strong>연결 상품을 기다리는 중입니다.</strong><p>영상의 상품 등장 시간에 맞춰 자동으로 표시됩니다.</p></div>}</aside></div></div>}
    </article>;
  })}</div>;
}

function AddressFields({
  value,
  onChange,
  showLabel = false,
  showDefault = false,
}: {
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
  showLabel?: boolean;
  showDefault?: boolean;
}) {
  const [postcodeError, setPostcodeError] = useState("");
  const [customDelivery, setCustomDelivery] = useState(
    Boolean(
      value.deliveryRequest &&
        !deliveryRequests.includes(value.deliveryRequest),
    ),
  );
  const deliveryChoice = customDelivery
    ? "직접 입력"
    : deliveryRequests.includes(value.deliveryRequest)
      ? value.deliveryRequest
      : "";
  const update = (key: keyof AddressDraft, next: string | boolean) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="address-fields">
      {showLabel && (
        <div className="address-label-row">
          <label>
            배송지 이름
            <input
              value={value.label}
              maxLength={20}
              placeholder="집, 회사, 부모님댁"
              onChange={(event) => update("label", event.target.value)}
            />
          </label>
          {showDefault && (
            <label className="address-default-check">
              <input
                type="checkbox"
                checked={value.isDefault}
                onChange={(event) => update("isDefault", event.target.checked)}
              />
              기본 배송지로 설정
            </label>
          )}
        </div>
      )}
      <div className="two-cols">
        <label>
          받는 분
          <input
            value={value.recipient}
            maxLength={40}
            autoComplete="shipping name"
            onChange={(event) => update("recipient", event.target.value)}
            required
          />
        </label>
        <label>
          연락처
          <input
            value={value.phone}
            inputMode="tel"
            autoComplete="shipping tel"
            placeholder="010-0000-0000"
            onChange={(event) => update("phone", formatPhone(event.target.value))}
            required
          />
        </label>
      </div>
      <label>
        주소
        <div className="postcode-row">
          <input
            value={value.postalCode}
            inputMode="numeric"
            placeholder="우편번호"
            maxLength={10}
            onChange={(event) => update("postalCode", event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setPostcodeError("");
              openPostcode(
                (postalCode, address) => {
                  onChange({
                    ...value,
                    postalCode,
                    address1: address,
                  });
                  window.setTimeout(() => {
                    document
                      .querySelector<HTMLInputElement>(
                        'input[data-address-detail="true"]',
                      )
                      ?.focus();
                  }, 80);
                },
                () =>
                  setPostcodeError(
                    "주소 검색창을 열지 못했습니다. 아래 주소를 직접 입력해 주세요.",
                  ),
              );
            }}
          >
            주소 검색
          </button>
        </div>
      </label>
      <label>
        도로명·지번 주소
        <input
          value={value.address1}
          autoComplete="shipping street-address"
          placeholder="주소 검색 또는 직접 입력"
          onChange={(event) => update("address1", event.target.value)}
          required
        />
      </label>
      <label>
        상세 주소
        <input
          data-address-detail="true"
          value={value.addressDetail}
          autoComplete="shipping address-line2"
          placeholder="동·호수, 건물명 등"
          onChange={(event) => update("addressDetail", event.target.value)}
        />
      </label>
      {postcodeError && <p className="address-inline-error">{postcodeError}</p>}
      <label>
        배송 요청사항
        <select
          value={deliveryChoice}
          onChange={(event) => {
            const next = event.target.value;
            setCustomDelivery(next === "직접 입력");
            update("deliveryRequest", next === "직접 입력" ? "" : next);
          }}
        >
          <option value="">요청사항 없음</option>
          {deliveryRequests.map((request) => (
            <option key={request}>{request}</option>
          ))}
        </select>
      </label>
      {deliveryChoice === "직접 입력" && (
        <label>
          요청사항 직접 입력
          <input
            value={value.deliveryRequest}
            maxLength={120}
            placeholder="배송 기사님께 전달할 내용을 입력해 주세요"
            onChange={(event) => update("deliveryRequest", event.target.value)}
          />
        </label>
      )}
      <fieldset className="customs-code-fields">
        <legend>해외직구 통관정보</legend>
        <p>수취인 이름·휴대전화·개인통관고유부호는 관세청 등록정보와 같아야 합니다.</p>
        <label>
          개인통관고유부호
          <input
            value={value.customsCode}
            inputMode="text"
            autoComplete="off"
            maxLength={13}
            placeholder={value.customsMasked || "P로 시작하는 13자리"}
            onChange={(event) => update("customsCode", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            required={!value.customsMasked}
          />
        </label>
        {value.customsMasked && <small>저장된 번호 {value.customsMasked} · 새 번호를 입력하면 교체됩니다.</small>}
        <a href="https://unipass.customs.go.kr/per/persIndex.do?qryIssTp=1" target="_blank" rel="noreferrer">관세청 UNI-PASS(유니패스: 통관번호 발급·조회)에서 확인하기 →</a>
        <label className="address-default-check">
          <input type="checkbox" checked={value.customsNameConfirmed} onChange={(event) => update("customsNameConfirmed", event.target.checked)} required />
          수취인 정보와 관세청 등록정보가 일치함을 확인했습니다.
        </label>
        <label className="address-default-check">
          <input type="checkbox" checked={value.saveCustomsCode} onChange={(event) => update("saveCustomsCode", event.target.checked)} />
          암호화하여 다음 주문에도 사용 (확인기간 1년)
        </label>
      </fieldset>
    </div>
  );
}

function CartPanel({
  data,
  pointName,
  busy,
  close,
  act,
}: {
  data: Data;
  pointName: string;
  busy: string;
  close: () => void;
  act: (body: Record<string, unknown>, success?: string) => Promise<any | null>;
}) {
  const [checkout, setCheckout] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [buyNowCartId] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Math.max(0, Number(new URLSearchParams(window.location.search).get("buy_now_cart_id") || 0));
  });
  const selectedCart = buyNowCartId
    ? data.cart.filter((item) => Number(item.id) === buyNowCartId)
    : data.cart;
  const orderCart = selectedCart.length ? selectedCart : data.cart;
  const orderSubtotal = orderCart.reduce((sum, item) => sum + Number(item.point_price) * Number(item.quantity), 0);
  const pointLimit = orderCart.reduce((sum, item) => {
    const mode = String(item.point_usage_mode || "full");
    const percent = mode === "none"
      ? 0
      : Math.max(0, Math.min(100, Number(item.point_max_percent ?? (mode === "partial" ? 50 : 100))));
    return sum + Math.floor((Number(item.point_price) * Number(item.quantity) * percent) / 100);
  }, 0);
  const availablePoints = Number(data.member.available_points ?? data.member.points ?? 0);
  const cashAllowed = orderCart.every((item) => Boolean(item.cash_payment_enabled));
  const [cashPaymentChannel, setCashPaymentChannel] = useState<"bank_transfer" | "kakao_transfer">("bank_transfer");
  const [selectedCouponId, setSelectedCouponId] = useState(0);
  const cashChannelLabel = cashPaymentChannel === "kakao_transfer" ? "카카오톡 송금" : "무통장입금";
  const preferredAddress =
    data.addresses.find((item) => Boolean(item.is_default)) ?? data.addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(
    Number(preferredAddress?.id ?? 0),
  );
  const [newAddress, setNewAddress] = useState(!preferredAddress);
  const [saveAddress, setSaveAddress] = useState(true);
  const [draft, setDraft] = useState<AddressDraft>(
    addressDraft(preferredAddress, data.member),
  );
  const [customDelivery, setCustomDelivery] = useState(
    Boolean(
      preferredAddress?.delivery_request &&
        !deliveryRequests.includes(String(preferredAddress.delivery_request)),
    ),
  );
  const discountEnabled = data.settings.feature_discount_enabled === "true";
  const now = new Date();
  const periodStart = data.settings.period_discount_starts_at ? new Date(`${data.settings.period_discount_starts_at}T00:00:00+09:00`) : null;
  const periodEnd = data.settings.period_discount_ends_at ? new Date(`${data.settings.period_discount_ends_at}T23:59:59+09:00`) : null;
  const periodActive = discountEnabled && Number(data.settings.period_discount_rate || 0) > 0 && (!periodStart || now >= periodStart) && (!periodEnd || now <= periodEnd);
  const periodCategory = data.settings.period_discount_category || "전체";
  const periodBase = periodActive ? orderCart.filter((item) => periodCategory === "전체" || item.category === periodCategory).reduce((sum, item) => sum + Number(item.point_price) * Number(item.quantity), 0) : 0;
  const periodDiscount = Math.floor(periodBase * Number(data.settings.period_discount_rate || 0) / 100);
  const selectedCoupon = (data.discountCoupons || []).find((item) => Number(item.id) === selectedCouponId);
  const couponBase = selectedCoupon ? orderCart.filter((item) => String(selectedCoupon.target_category || "전체") === "전체" || item.category === selectedCoupon.target_category).reduce((sum, item) => sum + Number(item.point_price) * Number(item.quantity), 0) : 0;
  const couponEligible = selectedCoupon && orderSubtotal >= Number(selectedCoupon.minimum_order || 0);
  const couponDiscount = couponEligible ? (selectedCoupon.discount_kind === "percent" ? Math.floor(couponBase * Number(selectedCoupon.discount_value || 0) / 100) : Math.min(couponBase, Number(selectedCoupon.discount_value || 0))) : 0;
  const shippingEnabled = data.settings.feature_shipping_enabled === "true";
  const freeThreshold = Number(data.settings.shipping_free_threshold || 0);
  const baseShippingFee = shippingEnabled && (freeThreshold < 1 || orderSubtotal - periodDiscount - couponDiscount < freeThreshold) ? Number(data.settings.shipping_base_fee || 0) : 0;
  const remotePrefixes = String(data.settings.shipping_remote_prefixes || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const remoteShippingFee = shippingEnabled && remotePrefixes.some((prefix) => draft.postalCode.startsWith(prefix)) ? Number(data.settings.shipping_remote_fee || 0) : 0;
  const shippingFee = baseShippingFee + remoteShippingFee;
  const totalDiscount = Math.min(orderSubtotal, periodDiscount + couponDiscount);
  const orderTotal = Math.max(0, orderSubtotal - totalDiscount + shippingFee);
  const maxUsablePoints = Math.min(orderTotal, pointLimit + shippingFee, availablePoints);
  const [usedPoints, setUsedPoints] = useState(maxUsablePoints);
  const normalizedUsedPoints = Math.max(0, Math.min(maxUsablePoints, Number(usedPoints || 0)));
  const cashAmount = orderTotal - normalizedUsedPoints;

  useEffect(() => {
    if (
      data.addresses.length &&
      !data.addresses.some(
        (item) => Number(item.id) === Number(selectedAddressId),
      )
    ) {
      const next =
        data.addresses.find((item) => Boolean(item.is_default)) ??
        data.addresses[0];
      setSelectedAddressId(Number(next.id));
      setDraft(addressDraft(next, data.member));
      setCustomDelivery(
        Boolean(
          next.delivery_request &&
            !deliveryRequests.includes(String(next.delivery_request)),
        ),
      );
      setNewAddress(false);
    }
  }, [data.addresses, data.member, selectedAddressId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idempotencyKey = crypto.randomUUID().replaceAll("-", "");
    const result = await act(
      {
        action: "order.create",
        idempotencyKey,
        cartIds: orderCart.map((item) => Number(item.id)),
        usedPoints: normalizedUsedPoints,
        cashPaymentChannel,
        couponId: selectedCouponId || 0,
        shippingAddressId: newAddress ? 0 : selectedAddressId,
        label: draft.label,
        recipient: draft.recipient,
        phone: draft.phone,
        postalCode: draft.postalCode,
        address1: draft.address1,
        addressDetail: draft.addressDetail,
        deliveryRequest: draft.deliveryRequest,
        isDefault: draft.isDefault,
        saveAddress: newAddress && saveAddress,
        customsCode: draft.customsCode,
        customsNameConfirmed: draft.customsNameConfirmed,
        saveCustomsCode: draft.saveCustomsCode,
      },
      cashAmount > 0
        ? `주문이 접수되었습니다. ${cashChannelLabel} 후 관리자의 입금 확인을 기다려 주세요.`
        : "리워드 주문이 정상 접수되었습니다.",
    );
    if (result) {
      const created = (result.orders || []).find((item: any) => item.idempotency_key === idempotencyKey);
      setCompletedOrder(created || {
        order_no: "주문 접수 완료",
        total_points: orderTotal,
        used_reward_points: normalizedUsedPoints,
        used_charge_points: 0,
        cash_amount: cashAmount,
        cash_payment_channel: cashPaymentChannel,
        payment_status: cashAmount > 0 ? "awaiting_cash" : "paid",
      });
      setCheckout(false);
    }
  }

  return (
    <div className="panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="side-panel">
        <div className="panel-header">
          <div><span>POINT ORDER</span><h2>장바구니</h2></div>
          <button className="modal-close" onClick={close}>×</button>
        </div>
        <div className="panel-body">
          {completedOrder ? (
            <section className="order-complete-card" aria-live="polite">
              <span className="order-complete-check">✓</span>
              <small>ORDER COMPLETE</small>
              <h3>주문이 정상적으로 접수되었습니다.</h3>
              <p className="order-complete-number">주문번호 <strong>{completedOrder.order_no}</strong></p>
              <div className="order-complete-summary">
                <p><span>최종 주문금액</span><strong>{fmt(completedOrder.total_points ?? orderTotal)}원</strong></p>
                <p><span>사용 리워드</span><strong>{fmt(Number(completedOrder.used_reward_points || 0) + Number(completedOrder.used_charge_points || 0))}P</strong></p>
                <p><span>남은 결제금액</span><strong>{fmt(completedOrder.cash_amount || 0)}원</strong></p>
              </div>
              {completedOrder.payment_status === "awaiting_cash" && (
                <div className="order-payment-guide">
                  <strong>{completedOrder.cash_payment_channel === "kakao_transfer" ? "카카오톡 송금이 필요합니다." : "무통장입금이 필요합니다."}</strong>
                  <p>{completedOrder.cash_payment_channel === "kakao_transfer" ? "판매자 카카오톡으로 주문금액을 보내면 관리자가 확인합니다." : `${data.settings.bank_name || "은행"} · ${data.settings.bank_account || "주문 안내 계좌"} · ${data.settings.bank_holder || "예금주"}`}</p>
                  {completedOrder.payment_expires_at && <small>입금기한 {new Date(completedOrder.payment_expires_at).toLocaleString("ko-KR")}</small>}
                </div>
              )}
              <div className="order-complete-actions">
                <button type="button" onClick={() => { close(); window.location.href = "/?account=orders"; }}>주문내역 보기</button>
                <button type="button" className="primary" onClick={close}>쇼핑 계속하기</button>
              </div>
            </section>
          ) : orderCart.length ? (
            <>
              <div className="cart-list">
                {orderCart.map((item) => (
                  <article key={item.id}>
                    <SafeProductImage src={item.image_url} alt={item.name} />
                    <div>
                      <h3>{item.name}</h3>
                      {cartOptionLabel(item.selected_options) && <small className="cart-options">{cartOptionLabel(item.selected_options)}</small>}
                      <strong>{fmt(item.point_price)} {pointName}</strong>
                      <small className="cart-options">
                        {String(item.point_usage_mode || "full") === "none"
                          ? "리워드 사용 불가 · 현금 결제"
                          : String(item.point_usage_mode || "full") === "partial"
                            ? `리워드 최대 ${Number(item.point_max_percent || 0)}% 사용`
                            : "리워드 100%까지 사용 가능"}
                      </small>
                      <div className="quantity-control">
                        <button onClick={() => act({ action: "cart.update", cartId: item.id, quantity: item.quantity - 1 })}>−</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => act({ action: "cart.update", cartId: item.id, quantity: item.quantity + 1 })}>+</button>
                        <button className="remove" onClick={() => act({ action: "cart.update", cartId: item.id, quantity: 0 }, "상품을 삭제했습니다.")}>삭제</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="cart-summary">
                <div><span>사용 가능 리워드</span><strong>{fmt(availablePoints)} {pointName}</strong></div>
                <div><span>리워드 사용</span><strong>− {fmt(normalizedUsedPoints)} {pointName}</strong></div>
                <div><span>{cashAmount > 0 ? cashChannelLabel : "현금 결제"}</span><strong>{fmt(cashAmount)}원</strong></div>
                <div className="balance"><span>주문 후 사용 가능</span><strong>{fmt(availablePoints - normalizedUsedPoints)} {pointName}</strong></div>
              </div>
              {!checkout ? (
                <button
                  className="panel-primary"
                  onClick={() => setCheckout(true)}
                >
                  주문서 작성하기
                </button>
              ) : (
                <form className="checkout-form" onSubmit={submit}>
                  <div className="checkout-heading">
                    <div>
                      <span>SHIPPING ADDRESS</span>
                      <h3>배송지 선택</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewAddress(true);
                        setSelectedAddressId(0);
                        setDraft(addressDraft(undefined, data.member));
                        setCustomDelivery(false);
                      }}
                    >
                      + 새 배송지
                    </button>
                  </div>
                  <aside className="overseas-checkout-notice">
                    <strong>중국 판매자 해외직구 상품</strong>
                    <p>플랫폼이 결제와 배송 진행, 통관 안내, 고객상담 및 취소·반품·환불 절차를 관리합니다. 일반 배송은 영업일 기준 {data.settings.overseas_delivery_min_days || "7"}~{data.settings.overseas_delivery_max_days || "14"}일이며 세관 검사에 따라 늦어질 수 있습니다.</p>
                  </aside>
                  {data.addresses.length > 0 && (
                    <div className="checkout-address-list" aria-label="저장된 배송지">
                      {data.addresses.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={
                            !newAddress &&
                            Number(selectedAddressId) === Number(item.id)
                              ? "selected"
                              : ""
                          }
                          onClick={() => {
                            setNewAddress(false);
                            setSelectedAddressId(Number(item.id));
                            setDraft(addressDraft(item, data.member));
                            setCustomDelivery(
                              Boolean(
                                item.delivery_request &&
                                  !deliveryRequests.includes(
                                    String(item.delivery_request),
                                  ),
                              ),
                            );
                          }}
                        >
                          <span>
                            <strong>{item.label}</strong>
                            {Boolean(item.is_default) && <b>기본</b>}
                          </span>
                          <small>{item.recipient} · {item.phone}</small>
                          <p>{fullAddress(item)}</p>
                          <i aria-hidden="true">✓</i>
                        </button>
                      ))}
                    </div>
                  )}
                  {newAddress ? (
                    <>
                      <div className="new-address-card">
                        <AddressFields
                          value={draft}
                          onChange={setDraft}
                          showLabel
                          showDefault
                        />
                      </div>
                      <label className="save-address-check">
                        <input
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(event) =>
                            setSaveAddress(event.target.checked)
                          }
                        />
                        이 배송지를 다음 주문에도 사용
                      </label>
                    </>
                  ) : (
                    <div className="selected-address-summary">
                      <span>
                        <strong>{draft.label}</strong>
                        {draft.isDefault && <b>기본 배송지</b>}
                      </span>
                      <h4>{draft.recipient} · {draft.phone}</h4>
                      <p>
                        {[
                          draft.postalCode ? `[${draft.postalCode}]` : "",
                          draft.address1,
                          draft.addressDetail,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                      <label>
                        배송 요청사항
                        <select
                          value={
                            customDelivery
                              ? "직접 입력"
                              : deliveryRequests.includes(draft.deliveryRequest)
                              ? draft.deliveryRequest
                              : ""
                          }
                          onChange={(event) => {
                            setCustomDelivery(
                              event.target.value === "직접 입력",
                            );
                            setDraft({
                              ...draft,
                              deliveryRequest:
                                event.target.value === "직접 입력"
                                  ? ""
                                  : event.target.value,
                            });
                          }}
                        >
                          <option value="">요청사항 없음</option>
                          {deliveryRequests.map((request) => (
                            <option key={request}>{request}</option>
                          ))}
                        </select>
                      </label>
                      {customDelivery && (
                          <label>
                            요청사항 직접 입력
                            <input
                              value={draft.deliveryRequest}
                              maxLength={120}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  deliveryRequest: event.target.value,
                                })
                              }
                            />
                          </label>
                        )}
                    </div>
                  )}
                  <section className="checkout-payment-card">
                    <div className="checkout-heading">
                      <div><span>PAYMENT</span><h3>결제수단 선택</h3></div>
                      <small>1P = 1원</small>
                    </div>
                    <label>
                      사용할 리워드
                      <div className="input-suffix">
                        <input
                          type="number"
                          min="0"
                          max={maxUsablePoints}
                          step="1"
                          value={usedPoints}
                          onChange={(event) => setUsedPoints(Number(event.target.value || 0))}
                        />
                        <span>P</span>
                      </div>
                    </label>
                    {discountEnabled && !!(data.discountCoupons || []).length && <label>할인쿠폰<select value={selectedCouponId} onChange={(event) => setSelectedCouponId(Number(event.target.value))}><option value="0">사용하지 않음</option>{(data.discountCoupons || []).map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.name} · {coupon.discount_kind === "percent" ? `${fmt(coupon.discount_value)}%` : `${fmt(coupon.discount_value)}원`}</option>)}</select>{selectedCoupon && !couponEligible && <small className="warning-text">최소 주문금액 {fmt(selectedCoupon.minimum_order)}원 이상부터 사용할 수 있습니다.</small>}</label>}
                    {(shippingFee > 0 || totalDiscount > 0) && <div className="checkout-benefit-summary"><p><span>상품금액</span><strong>{fmt(orderSubtotal)}원</strong></p>{periodDiscount > 0 && <p><span>{data.settings.period_discount_name || "기간 할인"}</span><strong>-{fmt(periodDiscount)}원</strong></p>}{couponDiscount > 0 && <p><span>쿠폰 할인</span><strong>-{fmt(couponDiscount)}원</strong></p>}{shippingFee > 0 && <p><span>배송비</span><strong>+{fmt(shippingFee)}원</strong></p>}<p className="total"><span>최종 주문금액</span><strong>{fmt(orderTotal)}원</strong></p></div>}
                    <div className="payment-quick-actions">
                      {cashAllowed && <button type="button" onClick={() => setUsedPoints(0)}>리워드 사용 안 함</button>}
                      <button type="button" onClick={() => setUsedPoints(maxUsablePoints)}>사용 가능 리워드 전액</button>
                    </div>
                    {cashAmount > 0 && (
                      <fieldset className="cash-payment-channels">
                        <legend>남은 금액을 보낼 방법</legend>
                        <label className={cashPaymentChannel === "bank_transfer" ? "selected" : ""}>
                          <input
                            type="radio"
                            name="cashPaymentChannel"
                            value="bank_transfer"
                            checked={cashPaymentChannel === "bank_transfer"}
                            onChange={() => setCashPaymentChannel("bank_transfer")}
                          />
                          <span><strong>무통장입금</strong><small>{data.settings.bank_name || "은행"} · {data.settings.bank_account || "주문 후 계좌 안내"} · {data.settings.bank_holder || "예금주"}</small></span>
                        </label>
                        <label className={cashPaymentChannel === "kakao_transfer" ? "selected" : ""}>
                          <input
                            type="radio"
                            name="cashPaymentChannel"
                            value="kakao_transfer"
                            checked={cashPaymentChannel === "kakao_transfer"}
                            onChange={() => setCashPaymentChannel("kakao_transfer")}
                          />
                          <span><strong>카카오톡 송금</strong><small>카카오페이 결제 연동이 아닌 판매자 카카오톡으로 직접 송금</small></span>
                        </label>
                      </fieldset>
                    )}
                    <div className="payment-result-line">
                      <span>{cashAmount === 0 ? "리워드 전액 결제" : normalizedUsedPoints > 0 ? `리워드 + ${cashChannelLabel}` : cashChannelLabel}</span>
                      <strong>{fmt(normalizedUsedPoints)}P + {fmt(cashAmount)}원</strong>
                    </div>
                    {!cashAllowed && cashAmount > 0 && <p className="address-inline-error">현금 결제가 제한된 상품이 포함되어 리워드 전액 결제만 가능합니다.</p>}
                  </section>
                  <p className="no-payment-note">무통장입금과 카카오톡 송금은 자동 결제가 아닙니다. 주문 후 관리자가 실제 입금을 확인하면 결제완료로 처리됩니다. 확인 전까지 리워드와 재고는 예약되며, 미입금·취소 시 자동으로 돌아갑니다.</p>
                  <div className="form-actions">
                    <button type="button" onClick={() => setCheckout(false)}>이전</button>
                    <button className="primary" disabled={Boolean(busy) || (!cashAllowed && cashAmount > 0)}>주문 확정</button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="empty-state tall"><span>▢</span><h3>장바구니가 비어 있습니다.</h3><p>원하는 상품을 리워드로 담아보세요.</p></div>
          )}
        </div>
      </aside>
    </div>
  );
}

const memberChannelStatusLabels: Record<string, string> = {
  pending: "개설 신청 검토 중",
  revision_requested: "보완 필요",
  approved: "개설 승인 · 작성 중",
  publication_review: "공개 검토 중",
  published: "공개 중",
  rejected: "신청 거절",
  suspended: "운영 정지",
};

export function MemberChannelPanel({ channel, products, draft, setDraft, busy, apply, save, requestPublication, requestCategories }: {
  channel: any | null | undefined; products: any[]; draft: any; setDraft: (value: any) => void; busy: string;
  apply: (event: FormEvent<HTMLFormElement>) => Promise<void>; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; requestPublication: () => unknown;
  requestCategories?: () => unknown;
}) {
  const [section, setSection] = useState("overview");
  const [productSearch, setProductSearch] = useState("");
  const [newSlotNumber, setNewSlotNumber] = useState("");
  if (!channel) return <section className="member-channel-center"><header><span>CREATOR CHANNEL</span><h3>내 방송 채널</h3><p>직접 상품을 소개하고 싶다면 방송 채널을 신청해 주세요.</p></header><ol className="channel-application-steps"><li><b>1</b><span><strong>개설 신청</strong><small>채널과 운영 계획 작성</small></span></li><li><b>2</b><span><strong>관리자 검토</strong><small>승인 또는 보완 요청</small></span></li><li><b>3</b><span><strong>채널 준비</strong><small>방송·상품·상담 설정</small></span></li><li><b>4</b><span><strong>공개 승인</strong><small>관리자 확인 후 공개</small></span></li></ol><form className="member-channel-form" onSubmit={apply}><label>희망 채널명<input name="name" minLength={2} maxLength={80} required /></label><label>방송 내용과 운영 계획<textarea name="applicationMessage" minLength={10} maxLength={1000} rows={5} required /></label><button className="panel-primary" disabled={Boolean(busy)}>채널 개설 신청하기</button></form></section>;
  const status = String(channel.application_status || "pending");
  const editable = ["approved", "revision_requested", "publication_review", "published"].includes(status);
  const update = (key: string, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  const updateContact = (key: string, value: any) => update("contactSettings", { ...(draft.contactSettings || {}), [key]: value });
  const selectedIds = new Set((draft.productIds || []).map(Number));
  const visibleProducts = products.filter((item) => item.status === "active" && `${item.name} ${item.style_number || ""} ${item.brand || ""}`.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 80);
  const toggleProduct = (id: number) => update("productIds", selectedIds.has(id) ? [...selectedIds].filter((value) => value !== id) : [...selectedIds, id]);
  const addRow = (key: "replays" | "shorts" | "categorySettings", value: any) => update(key, [...(draft[key] || []), value]);
  const patchRow = (key: "replays" | "shorts" | "categorySettings", index: number, patch: any) => update(key, (draft[key] || []).map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...patch } : item));
  const removeRow = (key: "replays" | "shorts" | "categorySettings", index: number) => update(key, (draft[key] || []).filter((_: any, itemIndex: number) => itemIndex !== index));
  const addLiveSlot = () => {
    const used = (draft.liveSlotNumbers || []).map(Number);
    const number = Math.floor(Number(newSlotNumber)) || Math.max(0, ...used) + 1;
    if (number < 1 || number > 9999 || used.includes(number)) return;
    update("liveSlotNumbers", [...used, number].sort((a, b) => a - b)); setNewSlotNumber("");
  };
  const setLiveSlotProduct = (number: number, productId: number) => update("liveSlots", [...(draft.liveSlots || []).filter((slot: any) => Number(slot.number) !== number), ...(productId ? [{ number, productId }] : [])]);
  const removeLiveSlot = (number: number) => { update("liveSlotNumbers", (draft.liveSlotNumbers || []).filter((value: number) => Number(value) !== number)); update("liveSlots", (draft.liveSlots || []).filter((slot: any) => Number(slot.number) !== number)); };
  const panelHeader = (number: string, title: string, description: string) => <header className="member-admin-section-head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></header>;
  return <section className="member-channel-center member-admin-workspace"><header className="member-admin-title"><div><span>MY CREATOR CHANNEL</span><h3>{channel.name}</h3><p>최고 관리자와 같은 순서로 채널 방송과 상품을 관리합니다.</p></div><div className={`member-channel-status status-${status}`}>{memberChannelStatusLabels[status] || status}</div></header>
    {channel.admin_review_note && <aside className="member-channel-review-note"><strong>관리자 안내</strong><p>{channel.admin_review_note}</p></aside>}
    {!editable ? <div className="member-channel-wait"><strong>{memberChannelStatusLabels[status] || "관리자 확인 중"}</strong><p>관리자가 신청 내용을 확인하고 있습니다. 승인되면 채널 관리 기능이 열립니다.</p></div> : <>
      <nav className="member-channel-nav" aria-label="내 방송 채널 관리 메뉴">{[["overview","채널 홈"],["basic","기본정보"],["live","생방송"],["products","방송 상품"],["replays","다시보기"],["shorts","쇼츠"],["catalog","상품·카테고리"],["assistant","방송 보조창"],["contact","상담"],["stats","통계"]].map(([key,label]) => <button type="button" key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)}>{label}</button>)}</nav>
      <form className="member-channel-form" onSubmit={save}>
        {section === "overview" && <section className="settings-card member-admin-card">{panelHeader("HOME", `${channel.name} 방송 운영 현황`, "지금 방송 상태와 필요한 작업을 한눈에 확인합니다.")}<div className="member-channel-dashboard"><article><span>연결 상품</span><strong>{selectedIds.size}개</strong></article><article><span>공개 상태</span><strong>{channel.status === "active" ? "고객 공개" : "준비 중"}</strong></article><article><span>다시보기</span><strong>{(draft.replays || []).length}개</strong></article><article><span>쇼츠</span><strong>{(draft.shorts || []).length}개</strong></article></div><div className="member-channel-home-actions"><button type="button" onClick={() => setSection("live")}>생방송 설정</button><button type="button" onClick={() => setSection("products")}>방송 상품 관리</button><button type="button" onClick={() => setSection("replays")}>다시보기 관리</button><a href={`/channel/${channel.slug}`} target="_blank" rel="noreferrer">채널 미리보기 ↗</a></div></section>}
        {section === "basic" && <section className="settings-card member-admin-card">{panelHeader("01", "채널 기본정보", "채널 고객 화면에 표시되는 이름과 소개를 관리합니다.")}<div className="settings-fields"><label>채널명<input value={draft.name || ""} maxLength={80} required onChange={(e) => update("name", e.target.value)} /></label><label>운영자 표시명<input value={draft.operatorName || ""} maxLength={80} onChange={(e) => update("operatorName", e.target.value)} /></label><label className="wide">채널 소개<textarea value={draft.description || ""} minLength={10} maxLength={500} rows={5} required onChange={(e) => update("description", e.target.value)} /></label><label className="wide">채널 주소<input value={`/channel/${channel.slug}`} readOnly /></label></div></section>}
        {section === "live" && <section className="settings-card member-admin-card">{panelHeader("02", "생방송 설정", "최고 관리자 화면과 같은 방식으로 방송 노출·화면 비율·주소를 설정합니다.")}<button type="button" className={`feature-switch ${draft.liveEnabled ? "on" : ""}`} onClick={() => update("liveEnabled", !draft.liveEnabled)}>{draft.liveEnabled ? "방송 노출 중" : "방송 숨김"}</button><div className="settings-fields"><fieldset className="wide live-orientation-field"><legend>방송 화면 비율</legend><div className="live-orientation-options"><button type="button" className={(draft.liveOrientation || "horizontal") === "horizontal" ? "active" : ""} onClick={() => update("liveOrientation", "horizontal")}><span className="orientation-shape horizontal" /><strong>가로 방송 (16:9)</strong><small>영상과 채팅을 넓게 표시합니다.</small></button><button type="button" className={draft.liveOrientation === "vertical" ? "active" : ""} onClick={() => update("liveOrientation", "vertical")}><span className="orientation-shape vertical" /><strong>세로 방송 (9:16)</strong><small>세로 영상과 상품을 함께 표시합니다.</small></button></div></fieldset><label className="wide">생방송 제목<input value={draft.broadcastTitle || ""} maxLength={120} onChange={(e) => update("broadcastTitle", e.target.value)} /></label><label className="wide">유튜브 생방송 주소<input type="url" value={draft.youtubeUrl || ""} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => update("youtubeUrl", e.target.value)} /></label><label className="wide">방송 안내문<textarea value={draft.broadcastNotice || ""} maxLength={500} rows={3} onChange={(e) => update("broadcastNotice", e.target.value)} /></label></div></section>}
        {section === "products" && <section className="settings-card member-admin-card">{panelHeader("03", "방송 상품과 번호표", "전체 상품에서 판매 상품을 고르고 방송 중 사용할 번호를 연결합니다.")}<label className="member-channel-wide">상품명·품번·브랜드 검색<input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="예: 나이키 또는 HF0263-001" /></label><div className="member-product-picker">{visibleProducts.map((product) => <label key={product.id} className={selectedIds.has(Number(product.id)) ? "selected" : ""}><input type="checkbox" checked={selectedIds.has(Number(product.id))} onChange={() => toggleProduct(Number(product.id))} /><span>{product.image_url ? <img src={product.image_url} alt="" /> : null}<b>{product.name}</b><small>{product.style_number || product.brand}</small></span></label>)}</div><div className="member-live-slot-toolbar"><div><strong>방송 번호표 {(draft.liveSlotNumbers || []).length}개</strong><span>선택한 채널 상품만 번호에 연결할 수 있습니다.</span></div><div><input type="number" min="1" max="9999" value={newSlotNumber} onChange={(e) => setNewSlotNumber(e.target.value)} placeholder="번호" /><button type="button" onClick={addLiveSlot}>+ 번호 추가</button></div></div><div className="member-live-slot-grid">{(draft.liveSlotNumbers || []).map((number: number) => { const slot = (draft.liveSlots || []).find((item: any) => Number(item.number) === Number(number)); return <article key={number}><b>{number}</b><select value={Number(slot?.productId || 0)} onChange={(e) => setLiveSlotProduct(number, Number(e.target.value))}><option value="0">상품 선택</option>{products.filter((product) => selectedIds.has(Number(product.id))).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" onClick={() => removeLiveSlot(number)}>번호 삭제</button></article>; })}</div></section>}
        {section === "catalog" && <section className="settings-card member-admin-card">{panelHeader("07", "채널 상품·카테고리", "채널에서 사용할 상품 묶음과 표시 메뉴를 정리하고 관리자 검토를 요청합니다.")}<p className="member-channel-safety">카테고리는 최고 관리자의 확인 후 고객 화면에 반영됩니다.</p>{(draft.categorySettings || []).map((category: any, index: number) => <div className="member-config-row" key={index}><input value={category.label || ""} placeholder="예: 스니커즈" onChange={(e) => patchRow("categorySettings", index, { label: e.target.value })} /><select multiple value={(category.productIds || []).map(String)} onChange={(e) => patchRow("categorySettings", index, { productIds: Array.from(e.target.selectedOptions).map((option) => Number(option.value)) })}>{products.filter((item) => selectedIds.has(Number(item.id))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => removeRow("categorySettings", index)}>요청에서 빼기</button></div>)}<div className="member-category-request-actions"><button type="button" onClick={() => addRow("categorySettings", { label: "", productIds: [] })}>+ 카테고리 요청 추가</button><button type="button" className="panel-primary" onClick={requestCategories} disabled={Boolean(busy) || !requestCategories}>관리자에게 검토 요청</button></div></section>}
        {section === "replays" && <section className="settings-card member-admin-card">{panelHeader("04", "다시보기 관리", "방송별 영상 주소·화면 비율·상품 등장 시간을 관리합니다.")}<button type="button" className="admin-primary member-add-content" onClick={() => addRow("replays", { id: `member-replay-${Date.now()}`, title: "새 다시보기", youtubeUrl: "", date: "", orientation: "horizontal", completed: false, timeline: [] })}>+ 다시보기 추가</button>{!(draft.replays || []).length && <p className="live-empty-admin">등록된 다시보기가 없습니다.</p>}{(draft.replays || []).map((item: any, index: number) => <article className="member-replay-editor" key={item.id || index}><div className="member-config-row"><input value={item.title || ""} placeholder="방송 제목" onChange={(e) => patchRow("replays", index, { title: e.target.value })} /><input type="url" value={item.youtubeUrl || ""} placeholder="유튜브 주소" onChange={(e) => patchRow("replays", index, { youtubeUrl: e.target.value })} /><input type="date" value={item.date || ""} onChange={(e) => patchRow("replays", index, { date: e.target.value })} /><select value={item.orientation || "horizontal"} onChange={(e) => patchRow("replays", index, { orientation: e.target.value })}><option value="horizontal">가로 16:9</option><option value="vertical">세로 9:16</option></select><label><input type="checkbox" checked={item.completed === true} onChange={(e) => patchRow("replays", index, { completed: e.target.checked })} /> 고객 공개</label><button type="button" className="danger" onClick={() => removeRow("replays", index)}>삭제</button></div><div className="member-timeline-head"><strong>상품 시간표 {(item.timeline || []).length}개</strong><button type="button" onClick={() => patchRow("replays", index, { timeline: [...(item.timeline || []), { id: `member-time-${Date.now()}`, time: 0, broadcastNumber: 0, productId: 0, needsReview: true }] })}>+ 상품 구간 추가</button></div>{(item.timeline || []).map((entry: any, timelineIndex: number) => <div className="member-timeline-row" key={entry.id || timelineIndex}><label>시작(초)<input type="number" min="0" value={entry.time || 0} onChange={(e) => patchRow("replays", index, { timeline: item.timeline.map((row: any, rowIndex: number) => rowIndex === timelineIndex ? { ...row, time: Number(e.target.value) } : row) })} /></label><label>방송번호<input type="number" min="0" value={entry.broadcastNumber || 0} onChange={(e) => patchRow("replays", index, { timeline: item.timeline.map((row: any, rowIndex: number) => rowIndex === timelineIndex ? { ...row, broadcastNumber: Number(e.target.value) } : row) })} /></label><label>연결 상품<select value={entry.productId || 0} onChange={(e) => patchRow("replays", index, { timeline: item.timeline.map((row: any, rowIndex: number) => rowIndex === timelineIndex ? { ...row, productId: Number(e.target.value) } : row) })}><option value="0">상품 선택</option>{products.filter((product) => selectedIds.has(Number(product.id))).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button type="button" onClick={() => patchRow("replays", index, { timeline: item.timeline.filter((_: any, rowIndex: number) => rowIndex !== timelineIndex) })}>삭제</button></div>)}</article>)}</section>}
        {section === "shorts" && <section className="settings-card member-admin-card">{panelHeader("05", "유튜브 쇼츠", "짧은 영상을 등록하고 고객이 바로 이동할 상품을 연결합니다.")}<button type="button" className="admin-primary member-add-content" onClick={() => addRow("shorts", { id: `member-short-${Date.now()}`, title: "새 쇼츠", youtubeUrl: "", productId: 0, visible: true })}>+ 쇼츠 추가</button>{!(draft.shorts || []).length && <p className="live-empty-admin">등록된 쇼츠가 없습니다.</p>}{(draft.shorts || []).map((item: any, index: number) => <div className="member-config-row" key={item.id || index}><input value={item.title || ""} placeholder="쇼츠 제목" onChange={(e) => patchRow("shorts", index, { title: e.target.value })} /><input type="url" value={item.youtubeUrl || ""} placeholder="유튜브 주소" onChange={(e) => patchRow("shorts", index, { youtubeUrl: e.target.value })} /><select value={Number(item.productId || 0)} onChange={(e) => patchRow("shorts", index, { productId: Number(e.target.value) })}><option value="0">연결 상품 없음</option>{products.filter((product) => selectedIds.has(Number(product.id))).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><label><input type="checkbox" checked={item.visible !== false} onChange={(e) => patchRow("shorts", index, { visible: e.target.checked })} /> 고객 공개</label><button type="button" className="danger" onClick={() => removeRow("shorts", index)}>삭제</button></div>)}</section>}
        {section === "assistant" && <section className="settings-card member-admin-card live-assistant-launch">{panelHeader("08", "방송 진행 보조창", "방송 중 상품 번호만 입력해 고객 화면의 현재 상품을 바꿉니다.")}<div><p>방송 상품 번호표를 저장한 뒤 보조창을 여세요. 이 창은 {channel.name} 채널에만 영향을 줍니다.</p><a className="admin-primary" href={`/my-channel/live-assistant?channel=${encodeURIComponent(channel.slug)}`} target="_blank" rel="noreferrer">{channel.name} 방송 보조창 열기 ↗</a></div></section>}
        {section === "contact" && <section className="settings-card member-admin-card">{panelHeader("09", "채널 전용 상담", "채널 고객에게 표시할 상담 담당자와 상담 주소를 관리합니다.")}<div className="settings-fields"><label>상담 담당자명<input value={draft.contactSettings?.contact_counselor_name || ""} onChange={(e) => updateContact("contact_counselor_name", e.target.value)} /></label><label>카카오톡 주소<input type="url" value={draft.contactSettings?.contact_kakao_url || ""} onChange={(e) => updateContact("contact_kakao_url", e.target.value)} /></label><label>텔레그램 주소<input type="url" value={draft.contactSettings?.contact_telegram_url || ""} onChange={(e) => updateContact("contact_telegram_url", e.target.value)} /></label><label>라인 주소<input type="url" value={draft.contactSettings?.contact_line_url || ""} onChange={(e) => updateContact("contact_line_url", e.target.value)} /></label><label className="wide">실시간 상담 주소<input type="url" value={draft.contactSettings?.contact_live_url || ""} onChange={(e) => updateContact("contact_live_url", e.target.value)} /></label></div></section>}
        {section === "stats" && <section className="settings-card member-admin-card">{panelHeader("10", "채널 운영 통계", "채널 콘텐츠와 상품 운영 현황을 확인합니다.")}<div className="member-channel-dashboard"><article><span>연결 상품</span><strong>{selectedIds.size}개</strong></article><article><span>공개 상태</span><strong>{channel.status === "active" ? "고객 공개" : "준비 중"}</strong></article><article><span>다시보기</span><strong>{(draft.replays || []).length}개</strong></article><article><span>쇼츠</span><strong>{(draft.shorts || []).length}개</strong></article></div><p className="member-channel-safety">주문·판매액·정산 자료는 검증이 끝난 뒤 이 화면에 추가됩니다.</p></section>}
        {!['overview', 'stats'].includes(section) && <div className="member-channel-actions"><button className="panel-primary" disabled={Boolean(busy)}>현재 설정 저장</button>{["approved", "revision_requested"].includes(status) && <button type="button" onClick={requestPublication} disabled={Boolean(busy)}>공개 검수 요청</button>}{status === "published" && <a href={`/channel/${channel.slug}`}>내 채널 보기 →</a>}</div>}<p className="member-channel-safety">회원은 자기 채널만 관리할 수 있습니다. 상품 가격·재고·주문·정산과 최종 공개는 최고 관리자가 담당합니다.</p>
      </form></>}
  </section>;
}

function LegacyMemberChannelPanel({ channel, draft, setDraft, busy, apply, save, requestPublication }: {
  channel: any | null | undefined;
  draft: Record<string, string>;
  setDraft: (value: any) => void;
  busy: string;
  apply: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  requestPublication: () => unknown;
}) {
  if (!channel) return <section className="member-channel-center"><header><span>CREATOR CHANNEL</span><h3>내 방송 채널</h3><p>일반 회원으로 이용하다가 직접 상품을 소개하고 싶다면 방송 채널을 신청해 주세요.</p></header><ol className="channel-application-steps"><li><b>1</b><span><strong>개설 신청</strong><small>희망 채널과 방송 계획 작성</small></span></li><li><b>2</b><span><strong>관리자 검토</strong><small>승인 또는 보완 요청</small></span></li><li><b>3</b><span><strong>채널 작성</strong><small>방송·상품·상담 정보 준비</small></span></li><li><b>4</b><span><strong>공개 승인</strong><small>관리자 최종 확인 후 공개</small></span></li></ol><form className="member-channel-form" onSubmit={apply}><label>희망 채널명<input name="name" minLength={2} maxLength={80} required placeholder="예: 민준의 슈즈 라이브" /></label><label>방송 내용과 운영 계획<textarea name="applicationMessage" minLength={10} maxLength={1000} rows={5} required placeholder="어떤 상품을 누구에게 소개할지 적어 주세요." /></label><button className="panel-primary" disabled={Boolean(busy)}>채널 개설 신청하기</button></form></section>;
  const status = String(channel.application_status || "pending");
  const editable = ["approved", "revision_requested", "publication_review", "published"].includes(status);
  return <section className="member-channel-center"><header><span>MY CREATOR CHANNEL</span><h3>{channel.name}</h3><div className={`member-channel-status status-${status}`}>{memberChannelStatusLabels[status] || status}</div></header>{channel.admin_review_note && <aside className="member-channel-review-note"><strong>관리자 안내</strong><p>{channel.admin_review_note}</p></aside>}{!editable ? <div className="member-channel-wait"><strong>{memberChannelStatusLabels[status] || "관리자 확인 중"}</strong><p>{status === "pending" ? "신청 내용을 관리자가 확인하고 있습니다. 승인되면 이곳에 채널 관리 기능이 열립니다." : status === "rejected" ? "관리자 안내를 확인한 뒤 고객센터로 문의해 주세요." : "현재는 채널 내용을 수정할 수 없습니다."}</p></div> : <form className="member-channel-form" onSubmit={save}><div className="member-channel-dashboard"><article><span>연결 상품</span><strong>{Number(channel.product_count || 0)}개</strong></article><article><span>공개 상태</span><strong>{channel.status === "active" ? "고객 공개" : "준비 중"}</strong></article></div><h4>채널 기본정보</h4><label>채널명<input value={draft.name} maxLength={80} required onChange={(event) => setDraft((current: any) => ({ ...current, name: event.target.value }))} /></label><label>운영자 표시명<input value={draft.operatorName} maxLength={80} onChange={(event) => setDraft((current: any) => ({ ...current, operatorName: event.target.value }))} /></label><label>채널 소개<textarea value={draft.description} minLength={10} maxLength={500} rows={4} required onChange={(event) => setDraft((current: any) => ({ ...current, description: event.target.value }))} /></label><h4>생방송 설정</h4><label>방송 제목<input value={draft.broadcastTitle} maxLength={120} onChange={(event) => setDraft((current: any) => ({ ...current, broadcastTitle: event.target.value }))} /></label><label>유튜브 방송 주소<input type="url" value={draft.youtubeUrl} placeholder="https://www.youtube.com/..." onChange={(event) => setDraft((current: any) => ({ ...current, youtubeUrl: event.target.value }))} /></label><label>방송 안내문<textarea value={draft.broadcastNotice} maxLength={500} rows={3} onChange={(event) => setDraft((current: any) => ({ ...current, broadcastNotice: event.target.value }))} /></label><div className="member-channel-actions"><button className="panel-primary" disabled={Boolean(busy)}>작성 내용 저장</button>{["approved", "revision_requested"].includes(status) && <button type="button" onClick={requestPublication} disabled={Boolean(busy)}>공개 검수 요청</button>}{status === "published" && <a href={`/channel/${channel.slug}`}>내 채널 보기 →</a>}</div><p className="member-channel-safety">상품 선택·카테고리·다시보기·쇼츠·상담 설정은 다음 관리 영역에서 순차적으로 연결됩니다. 상품 원본·가격·재고와 실제 공개 처리는 최고 관리자가 담당합니다.</p></form>}</section>;
}

function AccountPanel({
  data,
  pointName,
  tab,
  setTab,
  busy,
  close,
  act,
}: {
  data: Data;
  pointName: string;
  tab: string;
  setTab: (tab: string) => void;
  busy: string;
  close: () => void;
  act: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  const reviewCandidates = data.reviewableItems.filter((item) => item.review_eligible);
  const [selectedReviewItemId, setSelectedReviewItemId] = useState(
    Number(reviewCandidates[0]?.order_item_id ?? 0),
  );
  const [orderFilter, setOrderFilter] = useState("all");
  const [pointFilter, setPointFilter] = useState<"all" | "earn" | "use">("all");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const reviewSubmitLockRef = useRef(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState<ReviewPhoto[]>([]);
  const [draggedReviewPhotoId, setDraggedReviewPhotoId] = useState("");
  const [calendarNow] = useState(() => Date.now());
  const [addressEditorId, setAddressEditorId] = useState<number | null>(null);
  const [addressFormDraft, setAddressFormDraft] = useState<AddressDraft>(
    addressDraft(undefined, data.member),
  );
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [orderAddressDraft, setOrderAddressDraft] = useState<AddressDraft>(
    addressDraft(undefined, data.member),
  );
  const [channelDraft, setChannelDraft] = useState<any>(() => ({
    name: String(data.memberChannel?.name || ""),
    operatorName: String(data.memberChannel?.operator_name || data.member.name || ""),
    description: String(data.memberChannel?.description || ""),
    youtubeUrl: String(data.memberChannel?.youtube_url || ""),
    broadcastTitle: "",
    broadcastNotice: "",
    productIds: [], categorySettings: [], replays: [], shorts: [], contactSettings: {},
  }));
  useEffect(() => {
    let broadcast: Record<string, any> = {};
    let categorySettings: any[] = [];
    let contactSettings: Record<string, any> = {};
    try { broadcast = JSON.parse(String(data.memberChannel?.broadcast_settings || "{}")); } catch { broadcast = {}; }
    try { categorySettings = JSON.parse(String(data.memberChannel?.category_settings || "[]")); } catch { categorySettings = []; }
    try { contactSettings = JSON.parse(String(data.memberChannel?.contact_settings || "{}")); } catch { contactSettings = {}; }
    const parseNested = (value: unknown) => { try { return Array.isArray(value) ? value : JSON.parse(String(value || "[]")); } catch { return []; } };
    setChannelDraft({
      name: String(data.memberChannel?.name || ""),
      operatorName: String(data.memberChannel?.operator_name || data.member.name || ""),
      description: String(data.memberChannel?.description || ""),
      youtubeUrl: String(data.memberChannel?.youtube_url || ""),
      broadcastTitle: String(broadcast.youtube_live_title || ""),
      broadcastNotice: String(broadcast.youtube_live_notice || ""),
      productIds: String(data.memberChannel?.product_ids || "").split(",").map(Number).filter(Boolean),
      categorySettings: Array.isArray(categorySettings) ? categorySettings : [],
      replays: parseNested(broadcast.youtube_replays),
      shorts: parseNested(broadcast.youtube_shorts),
      contactSettings,
    });
  }, [data.memberChannel, data.member.name]);
  const selectedReviewItem =
    reviewCandidates.find(
      (item) => Number(item.order_item_id) === selectedReviewItemId,
    ) ?? reviewCandidates[0];
  const reviewTextPoints = Number(data.settings.review_text_points || 300);
  const reviewPhotoPoints = Number(data.settings.review_photo_points || 500);
  const reviewMinLength = Number(data.settings.review_min_length || 20);
  const reviewMaxImages = Number(data.settings.review_max_images || 4);
  const reviewPhotosBusy = reviewPhotos.some(
    (photo) => photo.status === "optimizing" || photo.status === "uploading",
  );
  const writtenReviews = data.reviews.filter(
    (review) => Number(review.member_id) === Number(data.member.id),
  );
  const itemsByOrder = data.reviewableItems.reduce<Record<string, any[]>>(
    (groups, item) => {
      const key = String(item.order_id);
      groups[key] = [...(groups[key] ?? []), item];
      return groups;
    },
    {},
  );
  const orderCounts = {
    all: data.orders.length,
    shipping: data.orders.filter((order) =>
      ["결제확인대기", "접수", "상품준비", "배송중"].includes(String(order.status)),
    ).length,
    complete: data.orders.filter((order) =>
      ["배송완료", "완료"].includes(String(order.status)),
    ).length,
    review: data.orders.filter((order) =>
      (itemsByOrder[String(order.id)] ?? []).some((item) => item.review_eligible),
    ).length,
  };
  const visibleOrders = data.orders.filter((order) => {
    if (orderFilter === "shipping") {
      return ["결제확인대기", "접수", "상품준비", "배송중"].includes(String(order.status));
    }
    if (orderFilter === "complete") {
      return ["배송완료", "완료"].includes(String(order.status));
    }
    if (orderFilter === "review") {
      return (itemsByOrder[String(order.id)] ?? []).some((item) => item.review_eligible);
    }
    return true;
  });
  const visiblePointLogs = data.pointLogs.filter((log) => {
    if (pointFilter === "earn") return Number(log.amount) > 0;
    if (pointFilter === "use") return Number(log.amount) < 0;
    return true;
  });
  const attendance = data.attendance ?? {
    enabled: true,
    todayChecked: false,
    today: null,
    streak: 0,
    dailyPoints: 100,
    streakDays: 7,
    streakBonus: 500,
    history: [],
  };
  const attendanceDates = new Set(
    attendance.history.map((item) => String(item.attendance_date)),
  );
  const attendanceCalendar = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(calendarNow - (6 - index) * 24 * 60 * 60 * 1000);
    const key = seoulDateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        weekday: "short",
      }).format(date),
      day: Number(key.slice(-2)),
      checked: attendanceDates.has(key),
      today: key === seoulDateKey(),
    };
  });

  useEffect(() => {
    if (
      reviewCandidates.length &&
      !reviewCandidates.some(
        (item) => Number(item.order_item_id) === selectedReviewItemId,
      )
    ) {
      setSelectedReviewItemId(Number(reviewCandidates[0].order_item_id));
    }
  }, [reviewCandidates, selectedReviewItemId]);

  function openReview(item: any) {
    setSelectedReviewItemId(Number(item.order_item_id));
    setTab("reviews");
    window.requestAnimationFrame(() => {
      document
        .getElementById("member-review-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateReviewPhoto(id: string, values: Partial<ReviewPhoto>) {
    setReviewPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...values } : photo)),
    );
  }

  async function addReviewPhotos(files: File[]) {
    setReviewError("");
    const available = Math.max(0, reviewMaxImages - reviewPhotos.length);
    if (!available) {
      setReviewError(`사진은 최대 ${reviewMaxImages}장까지 첨부할 수 있습니다.`);
      return;
    }

    const existing = new Set(
      reviewPhotos.map(
        (photo) => `${photo.sourceName}:${photo.sourceSize}:${photo.file.lastModified}`,
      ),
    );
    const accepted: ReviewPhoto[] = [];
    let rejectedMessage = "";
    for (const file of files) {
      if (accepted.length >= available) {
        rejectedMessage = `사진은 최대 ${reviewMaxImages}장까지 첨부할 수 있습니다.`;
        break;
      }
      if (!REVIEW_IMAGE_TYPES.has(file.type)) {
        rejectedMessage = "JPG, PNG, WEBP 사진만 첨부할 수 있습니다.";
        continue;
      }
      if (file.size < 1 || file.size > REVIEW_SOURCE_MAX_BYTES) {
        rejectedMessage = "원본 사진은 한 장당 20MB 이하만 선택할 수 있습니다.";
        continue;
      }
      const signature = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(signature)) {
        rejectedMessage = "이미 선택한 사진은 제외했습니다.";
        continue;
      }
      existing.add(signature);
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        sourceName: file.name,
        sourceSize: file.size,
        status: "optimizing",
      });
    }
    if (!accepted.length) {
      if (rejectedMessage) setReviewError(rejectedMessage);
      return;
    }

    setReviewPhotos((current) => [...current, ...accepted]);
    if (rejectedMessage) setReviewError(rejectedMessage);
    await Promise.all(
      accepted.map(async (photo) => {
        try {
          const optimized = await optimizeReviewPhoto(photo.file);
          updateReviewPhoto(photo.id, { file: optimized, status: "ready", error: "" });
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : "사진을 준비하지 못했습니다.";
          updateReviewPhoto(photo.id, { status: "error", error: message });
        }
      }),
    );
  }

  function removeReviewPhoto(id: string) {
    setReviewPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((photo) => photo.id !== id);
    });
    setReviewError("");
  }

  function moveReviewPhoto(id: string, direction: -1 | 1) {
    setReviewPhotos((current) => {
      const index = current.findIndex((photo) => photo.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function dropReviewPhoto(targetId: string) {
    if (!draggedReviewPhotoId || draggedReviewPhotoId === targetId) return;
    setReviewPhotos((current) => {
      const sourceIndex = current.findIndex(
        (photo) => photo.id === draggedReviewPhotoId,
      );
      const targetIndex = current.findIndex((photo) => photo.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
    setDraggedReviewPhotoId("");
  }

  async function removeUploadedReviewPhotos(urls: string[]) {
    await Promise.allSettled(
      urls.map((url) =>
        fetch(url, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        }),
      ),
    );
  }

  async function reviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewSubmitLockRef.current) return;
    if (!selectedReviewItem) return;
    if (reviewPhotos.some((photo) => photo.status === "error")) {
      setReviewError("등록할 수 없는 사진을 삭제하거나 다시 선택해 주세요.");
      return;
    }
    if (reviewPhotosBusy) {
      setReviewError("사진 준비가 끝난 뒤 후기를 등록해 주세요.");
      return;
    }
    const formElement = event.currentTarget;
    reviewSubmitLockRef.current = true;
    setReviewSubmitting(true);
    setReviewError("");
    const form = new FormData(formElement);
    const uploadedUrls: string[] = [];
    try {
      for (const photo of reviewPhotos) {
        updateReviewPhoto(photo.id, { status: "uploading", error: "" });
        const upload = new FormData();
        upload.append("image", photo.file);
        const response = await fetch("/api/review-image", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          body: upload,
        });
        const payload = await responsePayload(response);
        if (!response.ok) throw new Error(payload.error ?? "사진을 등록하지 못했습니다.");
        uploadedUrls.push(String(payload.url));
        updateReviewPhoto(photo.id, { status: "uploaded" });
      }
      const reward = uploadedUrls.length ? reviewPhotoPoints : reviewTextPoints;
      const success = await act(
        {
          action: "review.create",
          orderItemId: Number(selectedReviewItem.order_item_id),
          rating: reviewRating,
          title: form.get("title"),
          content: form.get("content"),
          imageUrls: uploadedUrls,
        },
        `상품 후기가 등록되고 ${fmt(reward)} ${pointName}가 적립되었습니다.`,
      );
      if (success) {
        reviewPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        setReviewPhotos([]);
        setReviewRating(5);
        setReviewError("");
        formElement.reset();
      } else {
        await removeUploadedReviewPhotos(uploadedUrls);
        setReviewPhotos((current) =>
          current.map((photo) => ({ ...photo, status: "ready" })),
        );
      }
    } catch (cause) {
      await removeUploadedReviewPhotos(uploadedUrls);
      setReviewPhotos((current) =>
        current.map((photo) => ({
          ...photo,
          status: photo.status === "error" ? "error" : "ready",
        })),
      );
      setReviewError(
        cause instanceof Error ? cause.message : "후기를 등록하지 못했습니다.",
      );
    } finally {
      reviewSubmitLockRef.current = false;
      setReviewSubmitting(false);
    }
  }

  async function couponSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const success = await act(
      { action: "coupon.redeem", code: form.get("code") },
      "쿠폰 리워드가 지급되었습니다.",
    );
    if (success) event.currentTarget.reset();
  }

  async function inquirySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const success = await act(
      {
        action: "inquiry.create",
        category: form.get("category"),
        title: form.get("title"),
        content: form.get("content"),
      },
      "문의가 접수되었습니다.",
    );
    if (success) event.currentTarget.reset();
  }

  async function profileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(
      { action: "profile.update", name: form.get("name"), phone: form.get("phone") },
      "회원정보를 수정했습니다.",
    );
  }

  async function channelApplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act({ action: "channel.apply", name: form.get("name"), applicationMessage: form.get("applicationMessage") }, "방송 채널 신청을 접수했습니다.");
  }

  async function memberChannelSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await act({ action: "channel.member.save", ...channelDraft }, "내 방송 채널을 저장했습니다.");
  }

  function editAddress(item?: any) {
    setAddressEditorId(item ? Number(item.id) : 0);
    setAddressFormDraft(addressDraft(item, data.member));
  }

  async function addressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await act(
      {
        action: "address.save",
        addressId: Number(addressEditorId ?? 0),
        ...addressFormDraft,
      },
      addressEditorId ? "배송지 정보를 수정했습니다." : "새 배송지를 저장했습니다.",
    );
    if (success) setAddressEditorId(null);
  }

  function startOrderAddressEdit(order: any) {
    setEditingOrderId(Number(order.id));
    setOrderAddressDraft(addressDraft(order, data.member));
  }

  async function orderAddressSubmit(
    event: FormEvent<HTMLFormElement>,
    orderId: number,
  ) {
    event.preventDefault();
    const success = await act(
      {
        action: "order.address.update",
        orderId,
        ...orderAddressDraft,
      },
      "주문의 배송지를 변경했습니다.",
    );
    if (success) setEditingOrderId(null);
  }

  async function requestOrderCancel(order: any) {
    const unpaid = ["awaiting_cash", "awaiting_kakao"].includes(String(order.payment_status));
    const message = unpaid
      ? "아직 입금 확인 전인 주문입니다. 지금 취소하면 예약된 리워드·재고·쿠폰이 바로 복구됩니다. 취소할까요?"
      : "주문 취소를 요청할까요? 관리자가 확인한 뒤 사용 리워드를 복원하고 현금 결제분을 환불 안내합니다.";
    if (!window.confirm(message)) return;
    await act(
      { action: "order.cancel.request", orderId: Number(order.id) },
      unpaid ? "주문을 취소하고 예약 내역을 복구했습니다." : "주문 취소를 요청했습니다.",
    );
  }

  async function requestOrderClaim(order: any) {
    const reasonType = window.prompt("반품 사유를 입력해 주세요: defect(하자), wrong_item(오배송), damaged(파손), change_mind(단순변심)", "defect")?.trim();
    if (!reasonType) return;
    const reasonDetail = window.prompt("상품 상태와 요청 내용을 10자 이상 자세히 적어 주세요.", "")?.trim();
    if (!reasonDetail) return;
    await act({ action: "order.claim.request", orderId: Number(order.id), claimType: "return", reasonType, reasonDetail }, "반품 신청이 접수되었습니다. 플랫폼 담당자가 확인 후 안내합니다.");
  }

  const memberChannelApplicationStatus = String(data.memberChannel?.application_status || "");
  const channelManagementReady = Boolean(data.memberChannel) && ["approved", "revision_requested", "publication_review", "published"].includes(memberChannelApplicationStatus);
  const channelAccountMenuLabel = channelManagementReady ? "채널 관리" : "채널 신청";

  return (
    <div className="panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="side-panel account-panel">
        <div className="panel-header">
          <div><span>MY POINT MALL</span><h2>마이페이지</h2></div>
          <button className="modal-close" onClick={close}>×</button>
        </div>
        <div className="member-card">
          <button type="button" className={`member-profile-trigger ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")} aria-label={`${data.member.name} 회원정보 보기`}><span>{data.member.name.slice(0, 1)}</span><p><strong>{data.member.name}{data.memberTier?.name ? <i className="member-tier-badge">{data.memberTier.name}</i> : null}</strong><small>{data.member.email}</small><em>회원정보 보기 →</em></p></button>
          <p><span>사용 가능</span><strong>{fmt(data.member.points)} <em>{pointName}</em></strong></p>
        </div>
        <nav className="panel-tabs" aria-label="마이페이지 메뉴">
          {[
            ["orders", "주문"],
            ["wishlist", "관심상품"],
            ["reviews", "후기"],
            ["reward", "리워드"],
            ["addresses", "배송지"],
            ["support", "쿠폰·상담"],
            ["channel", channelAccountMenuLabel],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <div className="panel-body account-body">
          {tab === "reward" && data.reward && (
            <RewardCenterPanel
              reward={data.reward}
              pointName={pointName}
              setTab={setTab}
            />
          )}
          {tab === "profile" && (
            <form className="stack-form" onSubmit={profileSubmit}>
              <h3>개인정보 수정</h3>
              <label>이메일<input value={data.member.email} readOnly /></label>
              <label>이름<input name="name" defaultValue={data.member.name} required /></label>
              <label>휴대전화<input name="phone" defaultValue={data.member.phone} required /></label>
              <button className="panel-primary" disabled={Boolean(busy)}>회원정보 저장</button>
            </form>
          )}
          {tab === "channel" && (!data.memberChannel
            ? <MemberChannelPanel channel={null} products={data.products} draft={channelDraft} setDraft={setChannelDraft} busy={busy} apply={channelApplySubmit} save={memberChannelSave} requestPublication={() => undefined} />
            : channelManagementReady
              ? <section className="member-channel-entry member-channel-account-summary"><span>MY CREATOR CHANNEL</span><div className="member-channel-summary-title"><div><h3>{data.memberChannel.name}</h3><p>{data.memberChannel.operator_name || data.member.name}님의 방송 판매 채널</p></div><b className={`member-channel-status status-${memberChannelApplicationStatus}`}>{memberChannelStatusLabels[memberChannelApplicationStatus] || memberChannelApplicationStatus}</b></div><dl><div><dt>채널 주소</dt><dd>/channel/{data.memberChannel.slug}</dd></div><div><dt>연결 상품</dt><dd>{Number(data.memberChannel.product_count || 0)}개</dd></div><div><dt>고객 공개</dt><dd>{data.memberChannel.status === "active" ? "공개 중" : "준비 중"}</dd></div><div><dt>채널 소개</dt><dd>{data.memberChannel.description || "채널 소개를 입력해 주세요."}</dd></div></dl><p>기본 현황은 여기서 확인하고, 방송·상품·다시보기·쇼츠·상담 설정은 넓은 채널 관리 화면에서 진행하세요.</p><div><a className="panel-primary" href="/my-channel">큰 채널 관리 화면으로 이동 →</a>{data.memberChannel.slug && <a href={`/channel/${data.memberChannel.slug}`}>내 채널 보기 ↗</a>}</div></section>
              : <MemberChannelPanel channel={data.memberChannel} products={data.products} draft={channelDraft} setDraft={setChannelDraft} busy={busy} apply={channelApplySubmit} save={memberChannelSave} requestPublication={() => undefined} />)}
          {tab === "addresses" && (
            <div className="address-book">
              <div className="account-section-heading">
                <div>
                  <span>SHIPPING ADDRESS BOOK</span>
                  <h3>배송지 관리</h3>
                </div>
                <button
                  type="button"
                  className="address-add-button"
                  onClick={() => editAddress()}
                >
                  + 새 배송지
                </button>
              </div>
              <p className="address-book-guide">
                주문할 때 기본 배송지가 먼저 선택됩니다. 배송지 목록을 바꿔도
                이미 접수된 주문의 주소는 자동으로 바뀌지 않습니다.
              </p>
              {addressEditorId !== null && (
                <form className="address-editor-card" onSubmit={addressSubmit}>
                  <header>
                    <div>
                      <span>{addressEditorId ? "EDIT ADDRESS" : "NEW ADDRESS"}</span>
                      <h4>{addressEditorId ? "배송지 수정" : "새 배송지 추가"}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddressEditorId(null)}
                    >
                      닫기
                    </button>
                  </header>
                  <AddressFields
                    value={addressFormDraft}
                    onChange={setAddressFormDraft}
                    showLabel
                    showDefault
                  />
                  <div className="form-actions">
                    <button
                      type="button"
                      onClick={() => setAddressEditorId(null)}
                    >
                      취소
                    </button>
                    <button className="primary" disabled={Boolean(busy)}>
                      배송지 저장
                    </button>
                  </div>
                </form>
              )}
              <div className="address-book-list">
                {data.addresses.map((item) => (
                  <article key={item.id} className={item.is_default ? "default" : ""}>
                    <header>
                      <span>
                        <strong>{item.label}</strong>
                        {Boolean(item.is_default) && <b>기본 배송지</b>}
                        {item.last_used_at && !item.is_default && <em>최근 사용</em>}
                      </span>
                      <div>
                        <button type="button" onClick={() => editAddress(item)}>
                          수정
                        </button>
                        <button
                          type="button"
                          className="delete"
                          onClick={() => {
                            if (
                              confirm(
                                `${item.label} 배송지를 목록에서 삭제할까요? 기존 주문 내역의 주소는 유지됩니다.`,
                              )
                            ) {
                              act(
                                { action: "address.delete", addressId: item.id },
                                "배송지를 삭제했습니다.",
                              );
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </header>
                    <h4>{item.recipient} · {item.phone}</h4>
                    <p>{fullAddress(item)}</p>
                    {item.delivery_request && (
                      <small>요청: {item.delivery_request}</small>
                    )}
                    {!Boolean(item.is_default) && (
                      <button
                        type="button"
                        className="make-default"
                        onClick={() =>
                          act(
                            { action: "address.default", addressId: item.id },
                            "기본 배송지를 변경했습니다.",
                          )
                        }
                      >
                        기본 배송지로 설정
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!data.addresses.length && addressEditorId === null && (
                <div className="address-empty">
                  <span>⌂</span>
                  <h4>저장된 배송지가 없습니다.</h4>
                  <p>자주 받는 주소를 저장하면 다음 주문이 더 빨라집니다.</p>
                  <button type="button" onClick={() => editAddress()}>
                    첫 배송지 추가
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "orders" && (
            <div className="member-orders">
              <div className="account-section-heading">
                <div>
                  <span>ORDER HISTORY</span>
                  <h3>주문·배송 내역</h3>
                </div>
                <small>상품별 배송상태와 후기 작성 여부를 확인하세요.</small>
              </div>
              <div className="order-filter-tabs" aria-label="주문 내역 필터">
                {[
                  ["all", "전체", orderCounts.all],
                  ["shipping", "진행 중", orderCounts.shipping],
                  ["complete", "배송완료", orderCounts.complete],
                  ["review", "후기 가능", orderCounts.review],
                ].map(([key, label, count]) => (
                  <button
                    type="button"
                    key={String(key)}
                    className={orderFilter === key ? "active" : ""}
                    onClick={() => setOrderFilter(String(key))}
                  >
                    {label}<b>{count}</b>
                  </button>
                ))}
              </div>
              <div className="order-card-list">
                {visibleOrders.map((order) => {
                  const orderItems = itemsByOrder[String(order.id)] ?? [];
                  return (
                    <article className="member-order-card" key={order.id}>
                      <header>
                        <div>
                          <strong>{new Date(order.created_at).toLocaleDateString("ko-KR")}</strong>
                          <span>{order.order_no}</span>
                        </div>
                        <b className={`status status-${order.status}`}>{order.status}</b>
                      </header>
                      {orderTemplate(data.settings, String(order.status)) && <p className="order-status-message">{orderTemplate(data.settings, String(order.status))}</p>}
                      <div className="member-order-products">
                        {orderItems.map((item) => (
                          <div className="member-order-product" key={item.order_item_id}>
                            <a href={`/products/${item.product_id}`} className="order-product-image" aria-label={`${item.product_name} 상품 보기`}>
                              {item.image_url ? (
                                <SafeProductImage src={item.image_url} alt={item.product_name} />
                              ) : (
                                <span>상품</span>
                              )}
                            </a>
                            <div className="order-product-copy">
                              <a href={`/products/${item.product_id}`}>{item.product_name}</a>
                              <span>{cartOptionLabel(item.selected_options) || "기본 옵션"} · 수량 {item.quantity}</span>
                              <strong>{fmt(Number(item.point_price) * Number(item.quantity))} {pointName}</strong>
                            </div>
                            <div className="order-product-action">
                              {item.review_eligible ? (
                                <button type="button" className="primary" onClick={() => openReview(item)}>
                                  후기 작성
                                </button>
                              ) : item.review_id ? (
                                <span className={item.deleted_at ? "deleted" : "done"}>
                                  {item.deleted_at ? "후기 삭제됨" : "작성 완료"}
                                </span>
                              ) : item.review_expired ? (
                                <span>작성 기간 종료</span>
                              ) : (
                                <span>배송완료 후 작성</span>
                              )}
                              <a href={`/products/${item.product_id}`}>상품 보기</a>
                            </div>
                          </div>
                        ))}
                      </div>
                      <section className="order-address-snapshot">
                        <header>
                          <div>
                            <span>배송지</span>
                            {order.address_updated_at && <b>변경됨</b>}
                          </div>
                          {["결제확인대기", "접수"].includes(String(order.status)) ? (
                            <button
                              type="button"
                              onClick={() =>
                                editingOrderId === Number(order.id)
                                  ? setEditingOrderId(null)
                                  : startOrderAddressEdit(order)
                              }
                            >
                              {editingOrderId === Number(order.id)
                                ? "변경 닫기"
                                : "배송지 변경"}
                            </button>
                          ) : (
                            <small>상품준비 이후 변경 제한</small>
                          )}
                        </header>
                        <strong>{order.recipient} · {order.phone}</strong>
                        <p>{fullAddress(order)}</p>
                        {order.memo && <small>요청: {order.memo}</small>}
                        <small>개인통관고유부호 {order.customs_code_masked || "확인 대기"}</small>
                      </section>
                      <ol className="overseas-delivery-timeline" aria-label="해외직구 배송 단계">
                        {[["payment_confirmed","결제 확인"],["china_preparing","중국 출고 준비"],["china_warehouse","중국 물류센터"],["inspection","검수"],["international_shipping","국제 운송"],["korea_arrival","한국 도착"],["customs","통관"],["domestic_shipping","국내 배송"],["delivered","배송 완료"]].map(([stage,label], index, stages) => { const current = Math.max(0, stages.findIndex(([value]) => value === String(order.delivery_stage || "payment_confirmed"))); return <li key={stage} className={index <= current ? "complete" : ""}><span>{index + 1}</span><small>{label}</small></li>; })}
                      </ol>
                      {editingOrderId === Number(order.id) && (
                        <form
                          className="order-address-editor"
                          onSubmit={(event) =>
                            orderAddressSubmit(event, Number(order.id))
                          }
                        >
                          <div className="order-address-editor-head">
                            <div>
                              <span>접수 상태에서만 변경 가능</span>
                              <strong>새 배송지를 확인해 주세요</strong>
                            </div>
                            {data.addresses.length > 0 && (
                              <small>저장된 배송지를 눌러 불러올 수 있습니다.</small>
                            )}
                          </div>
                          {data.addresses.length > 0 && (
                            <div className="order-saved-addresses">
                              {data.addresses.map((item) => (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() =>
                                    setOrderAddressDraft(
                                      addressDraft(item, data.member),
                                    )
                                  }
                                >
                                  <strong>{item.label}</strong>
                                  <span>{item.recipient} · {fullAddress(item)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <AddressFields
                            value={orderAddressDraft}
                            onChange={setOrderAddressDraft}
                          />
                          <p>
                            배송지가 바뀌면 관리자 주문 화면에도 즉시 반영됩니다.
                            상품준비가 시작된 뒤에는 고객센터로 문의해 주세요.
                          </p>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() => setEditingOrderId(null)}
                            >
                              취소
                            </button>
                            <button className="primary" disabled={Boolean(busy)}>
                              변경 완료
                            </button>
                          </div>
                        </form>
                      )}
                      <footer>
                        <div>
                          {["awaiting_cash", "awaiting_kakao"].includes(String(order.payment_status)) ? (
                            String(order.cash_payment_channel || "kakao_transfer") === "kakao_transfer" ? (
                              order.kakao_payment_url ? (
                                <a className="kakao-payment-button" href={order.kakao_payment_url} target="_blank" rel="noreferrer">카카오톡 송금 안내 열기</a>
                              ) : (
                                <span>카카오톡 송금 안내를 준비 중입니다.</span>
                              )
                            ) : (
                              <span className="bank-transfer-guide">무통장입금 · {data.settings.bank_name} {data.settings.bank_account} · 예금주 {data.settings.bank_holder}</span>
                            )
                          ) : order.tracking_no ? (
                            <span className="order-tracking">{order.courier} · {order.tracking_no}</span>
                          ) : (
                            <span>배송정보 준비 중</span>
                          )}
                        </div>
                        <p>총 주문금액 <strong>{fmt(order.total_points)}원</strong><small>{fmt(Number(order.used_charge_points || 0) + Number(order.used_reward_points || 0))}P + {fmt(order.cash_amount || 0)}원</small></p>
                        {["결제확인대기", "접수", "상품준비"].includes(String(order.status)) && <button type="button" className="order-cancel-request" onClick={() => requestOrderCancel(order)}>주문 취소</button>}
                        {order.status === "취소요청" && <span className="cancel-requested">취소 확인 중</span>}
                        {["배송중", "해외배송중", "통관중", "국내배송중", "배송완료"].includes(String(order.status)) && <button type="button" className="order-cancel-request" onClick={() => requestOrderClaim(order)}>반품·교환 신청</button>}
                      </footer>
                    </article>
                  );
                })}
              </div>
              {!visibleOrders.length && (
                <div className="empty-state tall">
                  {data.orders.length ? "선택한 조건의 주문이 없습니다." : "아직 주문 내역이 없습니다."}
                </div>
              )}
            </div>
          )}
          {tab === "wishlist" && (
            <div className="wishlist-panel">
              {data.products.filter((product) => data.wishlist.includes(Number(product.id))).map((product) => (
                <article key={product.id}>
                  <SafeProductImage src={product.image_url} alt={product.name} />
                  <div><span>{product.category}{product.brand ? ` · ${product.brand}` : ""}</span><strong>{product.name}</strong><small>{fmt(product.point_price)} {pointName}</small></div>
                  <a href={`/products/${product.id}`}>보기</a>
                  <button onClick={() => act({ action: "wishlist.toggle", productId: product.id }, "관심상품에서 삭제했습니다.")}>삭제</button>
                </article>
              ))}
              {!data.wishlist.length && <div className="empty-state tall">관심상품이 없습니다.</div>}
            </div>
          )}
          {tab === "reward" && (
            <div className="member-point-ledger">
              <div className="account-section-heading">
                <div>
                  <span>REWARD LEDGER</span>
                  <h3>전체 리워드 내역</h3>
                </div>
                <small>적립과 사용 내역을 모두 확인할 수 있습니다.</small>
              </div>
              <div className="point-summary-grid">
                <article className="balance">
                  <span>사용 가능</span>
                  <strong>{fmt(data.member.points)}</strong>
                  <small>결제 시 바로 사용</small>
                </article>
                <article className="earned">
                  <span>혜택 리워드</span>
                  <strong>{fmt(data.reward?.balances?.reward ?? 0)}</strong>
                  <small>현금환급·양도 불가</small>
                </article>
                <article className="used">
                  <span>적립 대기</span>
                  <strong>{fmt(data.reward?.balances?.pending ?? 0)}</strong>
                  <small>조건 확정 후 지급</small>
                </article>
                <article className="earned">
                  <span>총 적립</span>
                  <strong>+{fmt(data.pointSummary?.earned ?? 0)}</strong>
                  <small>{pointName}</small>
                </article>
                <article className="used">
                  <span>총 사용</span>
                  <strong>-{fmt(data.pointSummary?.used ?? 0)}</strong>
                  <small>{pointName}</small>
                </article>
              </div>
              <div className="point-ledger-filters" aria-label="리워드 내역 필터">
                {[
                  ["all", "전체", data.pointSummary?.count ?? data.pointLogs.length],
                  [
                    "earn",
                    "적립",
                    data.pointLogs.filter((log) => Number(log.amount) > 0).length,
                  ],
                  [
                    "use",
                    "사용",
                    data.pointLogs.filter((log) => Number(log.amount) < 0).length,
                  ],
                ].map(([key, label, count]) => (
                  <button
                    type="button"
                    key={String(key)}
                    className={pointFilter === key ? "active" : ""}
                    onClick={() => setPointFilter(key as "all" | "earn" | "use")}
                  >
                    {label} <b>{count}</b>
                  </button>
                ))}
              </div>
              <div className="point-history">
                {visiblePointLogs.map((log) => (
                  <article key={log.id}>
                    <span className={Number(log.amount) > 0 ? "plus" : "minus"}>
                      {Number(log.amount) > 0 ? "+" : ""}
                      {fmt(log.amount)}
                    </span>
                    <div>
                      <b>{String(log.type).replaceAll("포인트", "리워드")}</b>
                      <strong>{String(log.memo).replaceAll("포인트", "리워드")}</strong>
                      <small>{new Date(log.created_at).toLocaleString("ko-KR")}</small>
                    </div>
                    <em>잔액 {fmt(log.balance_after)}</em>
                  </article>
                ))}
                {!visiblePointLogs.length && (
                  <div className="empty-state tall">
                    {pointFilter === "earn"
                      ? "아직 적립된 리워드가 없습니다."
                      : pointFilter === "use"
                        ? "아직 사용한 리워드가 없습니다."
                        : "리워드 변동 내역이 없습니다."}
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "attendance" && (
            <div className="attendance-panel">
              <div className="account-section-heading">
                <div>
                  <span>DAILY CHECK-IN</span>
                  <h3>매일 출석체크</h3>
                </div>
                <small>한국 시간 자정마다 새로운 출석이 시작됩니다.</small>
              </div>
              <section className={`attendance-hero ${attendance.todayChecked ? "complete" : ""}`}>
                <div className="attendance-hero-copy">
                  <span>{attendance.todayChecked ? "TODAY COMPLETE" : "TODAY'S REWARD"}</span>
                  <h4>
                    {attendance.todayChecked
                      ? "오늘 출석을 완료했습니다"
                      : `오늘 출석하고 ${fmt(attendance.dailyPoints)} ${pointName} 받기`}
                  </h4>
                  <p>
                    현재 <strong>{attendance.streak}일 연속</strong> 출석 중 ·{" "}
                    {attendance.streakDays}일마다 보너스{" "}
                    <strong>{fmt(attendance.streakBonus)} {pointName}</strong>
                  </p>
                </div>
                <div className="attendance-stamp" aria-hidden="true">
                  {attendance.todayChecked ? "✓" : "P"}
                </div>
              </section>
              <div className="attendance-week" aria-label="최근 7일 출석 현황">
                {attendanceCalendar.map((day) => (
                  <article
                    key={day.key}
                    className={`${day.checked ? "checked" : ""} ${day.today ? "today" : ""}`}
                  >
                    <span>{day.label}</span>
                    <strong>{day.checked ? "✓" : day.day}</strong>
                    <small>{day.today ? "오늘" : day.checked ? "출석" : ""}</small>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="attendance-check-button"
                disabled={
                  Boolean(busy) ||
                  attendance.todayChecked ||
                  !attendance.enabled
                }
                onClick={() =>
                  act(
                    { action: "attendance.check" },
                    "출석체크가 완료되어 리워드가 적립되었습니다.",
                  )
                }
              >
                {!attendance.enabled
                  ? "현재 출석체크 운영 중지"
                  : attendance.todayChecked
                    ? `오늘 적립 완료 +${fmt(attendance.today?.total_points ?? attendance.dailyPoints)}`
                    : `오늘 출석하고 +${fmt(attendance.dailyPoints)}`}
              </button>
              <div className="attendance-guide">
                <strong>출석 리워드도 전체 리워드 내역에 자동 기록됩니다.</strong>
                <p>같은 회원은 하루 한 번만 참여할 수 있으며, 연속 출석이 끊기면 다음 출석부터 1일차로 다시 시작합니다.</p>
              </div>
            </div>
          )}
          {tab === "reviews" && (
            <>
              <div className="account-section-heading review-heading">
                <div>
                  <span>MY REVIEWS</span>
                  <h3>상품 후기</h3>
                </div>
                <small>작성 가능 {reviewCandidates.length}개 · 작성 완료 {writtenReviews.length}개</small>
              </div>
              <div className="review-policy-card">
                <strong>배송완료 후 {data.settings.review_write_days || 90}일 이내 작성</strong>
                <span>
                  텍스트 {fmt(reviewTextPoints)} {pointName} · 사진 {fmt(reviewPhotoPoints)} {pointName}
                </span>
                <small>주문상품별 최초 1회만 적립되며, 취소·반품 시 자동 회수됩니다.</small>
              </div>
              {reviewCandidates.length ? (
                <>
                  <section className="review-product-picker" aria-labelledby="review-product-picker-title">
                    <div className="review-picker-title">
                      <div>
                        <span>1</span>
                        <strong id="review-product-picker-title">후기를 작성할 상품을 선택하세요</strong>
                      </div>
                      <small>{reviewCandidates.length}개 작성 가능</small>
                    </div>
                    <div className="review-candidate-list">
                      {reviewCandidates.map((item) => (
                        <button
                          type="button"
                          key={item.order_item_id}
                          className={Number(item.order_item_id) === Number(selectedReviewItem?.order_item_id) ? "selected" : ""}
                          onClick={() => setSelectedReviewItemId(Number(item.order_item_id))}
                          aria-pressed={Number(item.order_item_id) === Number(selectedReviewItem?.order_item_id)}
                        >
                          <span className="review-candidate-image">
                            {item.image_url ? (
                              <SafeProductImage src={item.image_url} alt={item.product_name} />
                            ) : (
                              <em>상품</em>
                            )}
                          </span>
                          <span className="review-candidate-copy">
                            <strong>{item.product_name}</strong>
                            <small>{cartOptionLabel(item.selected_options) || "기본 옵션"} · 수량 {item.quantity}</small>
                            <em>{item.order_no}</em>
                          </span>
                          <span className="review-candidate-meta">
                            <b>+{fmt(reviewPhotoPoints)} {pointName}</b>
                            <small>{new Date(item.review_deadline).toLocaleDateString("ko-KR")}까지</small>
                          </span>
                          <i aria-hidden="true">✓</i>
                        </button>
                      ))}
                    </div>
                  </section>
                  <form id="member-review-form" className="stack-form member-review-form" onSubmit={reviewSubmit}>
                    <div className="review-form-title">
                      <span>2</span>
                      <div>
                        <h3>선택한 상품의 후기를 작성하세요</h3>
                        <small>사진을 첨부하면 {fmt(reviewPhotoPoints)} {pointName}가 적립됩니다.</small>
                      </div>
                    </div>
                    {selectedReviewItem && (
                      <div className="selected-review-product">
                        <span>
                          {selectedReviewItem.image_url ? (
                            <SafeProductImage
                              src={selectedReviewItem.image_url}
                              alt={selectedReviewItem.product_name}
                            />
                          ) : (
                            "상품"
                          )}
                        </span>
                        <div>
                          <strong>{selectedReviewItem.product_name}</strong>
                          <small>{cartOptionLabel(selectedReviewItem.selected_options) || "기본 옵션"} · 수량 {selectedReviewItem.quantity}</small>
                          <em>작성 기한 {new Date(selectedReviewItem.review_deadline).toLocaleDateString("ko-KR")}</em>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            document
                              .querySelector(".review-product-picker")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                        >
                          상품 변경
                        </button>
                      </div>
                    )}
                    <fieldset className="review-rating-field">
                      <legend>별점</legend>
                      <div>
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            type="button"
                            key={rating}
                            className={rating <= reviewRating ? "active" : ""}
                            onClick={() => setReviewRating(rating)}
                            aria-label={`${rating}점`}
                          >
                            ★
                          </button>
                        ))}
                        <strong>{reviewRating}점</strong>
                      </div>
                    </fieldset>
                    <label>제목<input name="title" required placeholder="후기를 한 문장으로 요약해 주세요." /></label>
                    <label>후기<textarea name="content" minLength={reviewMinLength} required placeholder={`상품을 사용한 경험을 ${reviewMinLength}자 이상 적어주세요.`} /></label>
                    <section className="review-photo-manager" aria-labelledby="review-photo-title">
                      <div className="review-photo-heading">
                        <div>
                          <strong id="review-photo-title">사진 첨부</strong>
                          <small>선택한 사진을 확인하고 순서를 바꿀 수 있습니다.</small>
                        </div>
                        <b>{reviewPhotos.length}/{reviewMaxImages}</b>
                      </div>
                      <div
                        className={`review-photo-dropzone ${reviewPhotos.length ? "compact" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          void addReviewPhotos(Array.from(event.dataTransfer.files));
                        }}
                      >
                        <input
                          id="review-photo-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={(event) => {
                            void addReviewPhotos(Array.from(event.currentTarget.files ?? []));
                            event.currentTarget.value = "";
                          }}
                        />
                        <label htmlFor="review-photo-input">
                          <span aria-hidden="true">＋</span>
                          <strong>{reviewPhotos.length ? "사진 더 추가" : "사진 선택"}</strong>
                          <small>클릭하거나 사진을 끌어놓으세요</small>
                        </label>
                        <p>
                          JPG · PNG · WEBP · 원본 한 장당 최대 20MB
                          <br />
                          큰 사진은 화질을 유지하며 자동으로 줄여 전송합니다.
                        </p>
                      </div>
                      {!!reviewPhotos.length && (
                        <div className="review-photo-grid" aria-live="polite">
                          {reviewPhotos.map((photo, index) => (
                            <article
                              key={photo.id}
                              className={`review-photo-card ${photo.status}`}
                              draggable={photo.status === "ready"}
                              onDragStart={() => setDraggedReviewPhotoId(photo.id)}
                              onDragEnd={() => setDraggedReviewPhotoId("")}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                dropReviewPhoto(photo.id);
                              }}
                            >
                              <img src={photo.previewUrl} alt={`후기 사진 ${index + 1}`} />
                              {index === 0 && <b className="review-photo-cover">대표</b>}
                              <button
                                type="button"
                                className="review-photo-remove"
                                onClick={() => removeReviewPhoto(photo.id)}
                                disabled={reviewSubmitting}
                                aria-label={`${index + 1}번째 사진 삭제`}
                              >
                                ×
                              </button>
                              <div className="review-photo-state">
                                {photo.status === "optimizing" && "사진 최적화 중"}
                                {photo.status === "ready" &&
                                  `${formatFileSize(photo.file.size)} · 준비 완료`}
                                {photo.status === "uploading" &&
                                  `업로드 중 ${index + 1}/${reviewPhotos.length}`}
                                {photo.status === "uploaded" && "업로드 완료"}
                                {photo.status === "error" && (photo.error || "확인 필요")}
                              </div>
                              <div className="review-photo-order">
                                <button
                                  type="button"
                                  onClick={() => moveReviewPhoto(photo.id, -1)}
                                  disabled={index === 0 || reviewSubmitting}
                                  aria-label={`${index + 1}번째 사진을 앞으로 이동`}
                                >
                                  ←
                                </button>
                                <span>{index + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => moveReviewPhoto(photo.id, 1)}
                                  disabled={index === reviewPhotos.length - 1 || reviewSubmitting}
                                  aria-label={`${index + 1}번째 사진을 뒤로 이동`}
                                >
                                  →
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      <div className="review-photo-reward">
                        <span>
                          {reviewPhotos.length
                            ? `사진 후기 ${fmt(reviewPhotoPoints)} ${pointName}`
                            : `텍스트 후기 ${fmt(reviewTextPoints)} ${pointName}`}
                        </span>
                        <small>
                          사진은 후기 등록 버튼을 누를 때 안전하게 업로드됩니다.
                        </small>
                      </div>
                    </section>
                    <button
                      className="panel-primary"
                      disabled={
                        Boolean(busy) ||
                        reviewSubmitting ||
                        reviewPhotosBusy ||
                        reviewPhotos.some((photo) => photo.status === "error")
                      }
                    >
                      {reviewSubmitting
                        ? reviewPhotos.length
                          ? `사진 업로드 중 ${reviewPhotos.filter((photo) => photo.status === "uploaded").length}/${reviewPhotos.length}`
                          : "후기 등록 중..."
                        : reviewPhotosBusy
                          ? "사진을 준비하고 있습니다..."
                          : `후기 등록하고 ${fmt(
                              reviewPhotos.length ? reviewPhotoPoints : reviewTextPoints,
                            )} ${pointName} 받기`}
                    </button>
                    {reviewError && <p className="form-error">{reviewError}</p>}
                  </form>
                </>
              ) : (
                <div className="empty-state review-empty">
                  <span>✓</span>
                  <h3>현재 작성 가능한 후기가 없습니다.</h3>
                  <p>배송완료된 주문상품이 생기면 상품 사진과 함께 이곳에 표시됩니다.</p>
                  <button type="button" onClick={() => setTab("orders")}>주문내역 확인</button>
                </div>
              )}
              <section className="written-review-section">
                <div className="written-review-heading">
                  <div>
                    <span>작성한 후기</span>
                    <b>{writtenReviews.length}</b>
                  </div>
                  <small>내가 작성한 후기와 적립 상태를 확인할 수 있습니다.</small>
                </div>
                <div className="review-list">
                  {writtenReviews.map((review) => (
                    <article key={review.id}>
                      <header>
                        <span>{"★".repeat(review.rating)}</span>
                        <b>{review.deleted_at ? "삭제됨" : review.visible ? "공개" : "숨김"}</b>
                      </header>
                      <small>{review.product_name} · {review.order_no || "기존 후기"}</small>
                      <h4>{review.title}</h4>
                      <p>{review.content}</p>
                      {!!reviewImageList(review.image_urls).length && (
                        <div className="member-review-images">
                          {reviewImageList(review.image_urls).map((url: string) => (
                            <img src={url} alt="" key={url} />
                          ))}
                        </div>
                      )}
                      <footer>
                        <span>{review.reward_status === "회수" ? "적립 회수" : `+${fmt(review.reward_points || 0)} ${pointName}`}</span>
                        {review.admin_reply && <p><strong>관리자 답변</strong>{review.admin_reply}</p>}
                      </footer>
                    </article>
                  ))}
                  {!writtenReviews.length && <div className="empty-state">아직 작성한 후기가 없습니다.</div>}
                </div>
              </section>
            </>
          )}
          {tab === "support" && (
            <>
              <form className="stack-form" onSubmit={couponSubmit}>
                <h3>리워드 쿠폰 등록</h3>
                <label>쿠폰 코드<input name="code" placeholder="PG-XXXXXXXXXXXX" required /></label>
                <button className="panel-primary" disabled={Boolean(busy)}>쿠폰 등록</button>
              </form>
              <form className="stack-form" onSubmit={inquirySubmit}>
                <h3>고객상담·쪽지 보내기</h3>
                <label>문의 유형<select name="category"><option>이용문의</option><option>주문·배송</option><option>리워드</option><option>상품</option></select></label>
                <label>제목<input name="title" required /></label>
                <label>문의 내용<textarea name="content" required /></label>
                <button className="panel-primary" disabled={Boolean(busy)}>쪽지 보내기</button>
              </form>
              <div className="inquiry-history">
                {data.inquiries.map((item) => (
                  <article key={item.id}>
                    <header><span>{item.category}</span><b>{item.status}</b></header>
                    <h4>{item.title}</h4>
                    <p>{item.content}</p>
                    {item.answer && <div><strong>관리자 답변</strong><p>{item.answer}</p></div>}
                  </article>
                ))}
                {!data.inquiries.length && <div className="empty-state">보낸 상담 쪽지가 없습니다.</div>}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function RewardCenterPanel({
  reward,
  pointName,
  setTab,
}: {
  reward: any;
  pointName: string;
  setTab: (tab: string) => void;
}) {
  const [copied, setCopied] = useState("");
  const shareText = `이 링크를 통해 가입하거나 구매하면 저와 친구에게 리워드가 지급됩니다.\n${reward.url}`;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: "친구추천 혜택",
        text: "이 링크를 통해 가입하거나 구매하면 저와 친구에게 리워드가 지급됩니다.",
        url: reward.url,
      });
      return;
    }
    await copy(shareText, "공유문구");
  }

  if (reward.policy?.enabled === false) {
    return <div className="reward-center-panel"><div className="account-section-heading"><div><span>MY REWARD CENTER</span><h3>리워드</h3></div><small>출석·후기 보상과 사용 내역을 확인합니다.</small></div><div className="reward-balance-grid"><article className="main"><span>혜택 리워드</span><strong>{fmt(reward.balances.reward)}</strong><small>{pointName}</small></article><article><span>지급 예정</span><strong>{fmt(reward.balances.pending)}</strong><small>{pointName}</small></article></div><section className="reward-policy-note"><strong>친구추천은 현재 운영하지 않습니다.</strong><p>기존 리워드는 그대로 사용할 수 있으며 출석체크와 상품후기 혜택은 각 메뉴에서 확인할 수 있습니다.</p></section><section className="reward-missions"><header><span>TODAY&apos;S MISSIONS</span><h4>리워드 미션</h4></header><div><button type="button" onClick={() => setTab("attendance")}><span>출석체크</span><strong>매일 참여</strong><em>참여하기 →</em></button><button type="button" onClick={() => setTab("reviews")}><span>상품후기</span><strong>구매 후 적립</strong><em>작성하기 →</em></button></div></section></div>;
  }

  return (
    <div className="reward-center-panel">
      <div className="account-section-heading">
        <div><span>MY REWARD CENTER</span><h3>리워드</h3></div>
        <small>친구추천·출석·후기 보상을 한곳에서 확인합니다.</small>
      </div>

      <div className="reward-balance-grid">
        <article className="main"><span>혜택 리워드</span><strong>{fmt(reward.balances.reward)}</strong><small>{pointName}</small></article>
        <article><span>지급 예정</span><strong>{fmt(reward.balances.pending)}</strong><small>{pointName}</small></article>
        <article><span>이번 달 적립</span><strong>{fmt(reward.stats.monthEarned)}</strong><small>{pointName}</small></article>
        <article><span>누적 적립</span><strong>{fmt(reward.stats.totalEarned)}</strong><small>{pointName}</small></article>
      </div>

      <section className="referral-share-card">
        <div className="referral-share-copy">
          <span>MY INVITE LINK</span>
          <h4>친구와 함께 받는 첫 구매 혜택</h4>
          <p>친구는 가입 인증 시 {fmt(reward.policy.joinReward)}P, 첫 구매 완료 시 {fmt(reward.policy.friendOrderReward)}P를 받습니다. 추천한 회원은 친구의 첫 구매 확정 후 {fmt(reward.policy.inviterOrderReward)}P를 받습니다.</p>
          <label>개인 추천주소<div><input value={reward.url} readOnly /><button type="button" onClick={() => copy(reward.url, "주소")}>{copied === "주소" ? "복사됨" : "주소 복사"}</button></div></label>
          <label>추천코드<div><input value={reward.code} readOnly /><button type="button" onClick={() => copy(reward.code, "코드")}>{copied === "코드" ? "복사됨" : "코드 복사"}</button></div></label>
          <div className="reward-share-actions">
            <button type="button" onClick={share}>카카오톡 공유</button>
            <button type="button" onClick={share}>휴대폰 공유</button>
            <button type="button" onClick={() => copy(shareText, "공유문구")}>{copied === "공유문구" ? "복사됨" : "공유문구 복사"}</button>
          </div>
        </div>
        <div className="referral-qr"><QRCodeSVG value={reward.url} size={132} level="M" /><small>QR코드로 초대</small></div>
      </section>

      <div className="reward-funnel-grid">
        <article><span>링크 방문</span><strong>{fmt(reward.stats.visits)}</strong></article>
        <article><span>가입</span><strong>{fmt(reward.stats.joined)}</strong></article>
        <article><span>첫 구매</span><strong>{fmt(reward.stats.firstPurchased)}</strong></article>
        <article><span>보상 확정</span><strong>{fmt(reward.stats.confirmed)}</strong></article>
      </div>

      <section className="reward-progress-card">
        <header><div><span>REFERRAL STATUS</span><h4>추천회원 진행상태</h4></div><small>이름은 개인정보 보호를 위해 가려서 표시됩니다.</small></header>
        <div className="reward-progress-list">
          {reward.referrals.map((item: any) => (
            <article key={item.id}>
              <div><strong>{item.invitee_name}</strong><small>{shortDate(item.joined_at)} 가입</small></div>
              <span className={`reward-status ${item.status}`}>{item.status}</span>
              <p>{item.hold_reason || (item.eligible_at ? `예상 지급일 ${new Date(item.eligible_at).toLocaleDateString("ko-KR")}` : "정상 진행 중")}</p>
            </article>
          ))}
          {!reward.referrals.length && <div className="empty-state">아직 추천으로 가입한 회원이 없습니다.</div>}
        </div>
      </section>

      <section className="reward-missions">
        <header><span>TODAY&apos;S MISSIONS</span><h4>오늘의 리워드 미션</h4></header>
        <div>
          <button type="button" onClick={() => setTab("attendance")}><span>출석체크</span><strong>매일 +100P</strong><em>참여하기 →</em></button>
          <button type="button" onClick={() => setTab("reviews")}><span>상품후기</span><strong>최대 +500P</strong><em>작성하기 →</em></button>
          <button type="button" onClick={() => copy(reward.url, "주소")}><span>친구추천</span><strong>첫 구매 +1,000P</strong><em>초대하기 →</em></button>
        </div>
      </section>

      <section className="reward-policy-note">
        <strong>보상 조건 안내</strong>
        <p>추천정보는 링크 방문 후 {reward.policy.cookieDays}일간 보관됩니다. 직접 초대한 친구 한 단계만 보상하며, 첫 구매 {fmt(reward.policy.minOrderPoints)}P 이상·배송완료 후 {reward.policy.holdDays}일 뒤 확정됩니다.</p>
        <p>추천·출석·후기로 받은 혜택 리워드는 자사몰 상품 구매에만 사용할 수 있고 현금환급·양도할 수 없습니다. 취소·반품 시 지급 예정 보상은 취소되고 이미 지급된 보상은 회수될 수 있습니다.</p>
      </section>
    </div>
  );
}
