"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-html-link-for-pages, @next/next/no-img-element, react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AdminProductEditor from "./AdminProductEditor";
import SafeProductImage from "./SafeProductImage";
import { parseCategoryConfig, productMatchesCategory, selectableCategoryNames, type StoreCategoryConfig } from "../lib/category-config";
import { brandMatchesChannelRule, inferChannelBrandRuleCategory } from "../lib/channel-category-rules";
import { CANONICAL_PRODUCT_BRANDS, canonicalBrandAliases } from "../lib/canonical-brands";

type AdminData = {
  admin: any;
  settings: Record<string, string>;
  summary: Record<string, number>;
  statistics?: Record<string, any>;
  members: any[];
  products: any[];
  salesChannels: any[];
  channelOwnerCandidates: any[];
  orders: any[];
  finance: any[];
  reviews: any[];
  popups: any[];
  pointLogs: any[];
  adminAccounts: any[];
  notices: any[];
  coupons: any[];
  inquiries: any[];
  auditLogs: any[];
  referrals: any[];
  rewardEvents: any[];
  referralFlags: any[];
  testData: { members: number; orders: number; reviews: number; attendance: number; createdAt: string | null; password: string } | null;
};

const fmt = (value: number | string) => Number(value ?? 0).toLocaleString("ko-KR");
const date = (value: string) => new Date(value).toLocaleDateString("ko-KR");
const DEFAULT_ADMIN_PAGE_SIZE = 20;
const CHANNEL_IMAGE_UPLOAD_TARGET = 850 * 1024;
const ADMIN_SCOPE_FIELDS: Record<string, string[]> = {
  dashboard: [],
  self: ["admin", "adminAccounts"],
  administrators: ["admin", "adminAccounts"],
  settings: ["settings", "testData"],
  products: ["products"],
  operations: ["products"],
  live: ["settings", "products", "salesChannels", "channelOwnerCandidates"],
  members: ["members"],
  points: ["members", "pointLogs"],
  rewards: ["members", "pointLogs", "referrals", "rewardEvents", "referralFlags"],
  orders: ["orders"],
  reviews: ["reviews"],
  notices: ["notices"],
  coupons: ["coupons"],
  inquiries: ["inquiries"],
  popups: ["popups"],
  audit: ["auditLogs"],
};

async function prepareChannelImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("JPG, PNG, WEBP 형식의 사진만 선택할 수 있습니다.");
  if (file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error("사진은 20MB 이하의 파일을 선택해 주세요.");
  if (file.size <= CHANNEL_IMAGE_UPLOAD_TARGET) return file;
  if (!("createImageBitmap" in window)) throw new Error("사진 용량이 큽니다. 2MB 이하의 사진을 선택해 주세요.");
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  let blob: Blob | null = null;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이 브라우저에서는 사진을 처리할 수 없습니다.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.58, 0.86 - attempt * 0.07);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= CHANNEL_IMAGE_UPLOAD_TARGET) break;
      scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }
  if (!blob || blob.size > CHANNEL_IMAGE_UPLOAD_TARGET) throw new Error("사진 용량을 자동으로 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
  return new File([blob], "channel-cover.webp", { type: "image/webp" });
}

async function channelImageResponse(response: Response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  const message = (await response.text()).trim();
  if (response.status === 413 || /payload too large/i.test(message)) return { error: "사진 용량이 너무 큽니다. 더 작은 사진을 선택해 주세요." };
  return { error: message || "사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요." };
}

type ChannelCropSettings = { zoom: number; positionX: number; positionY: number; rotation: number };

async function cropChannelImage(file: File, settings: ChannelCropSettings, width: number, height: number, filename: string) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("이 브라우저에서는 사진을 편집할 수 없습니다.");
  }
  const fitScale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height) * settings.zoom;
  const drawWidth = bitmap.width * fitScale;
  const drawHeight = bitmap.height * fitScale;
  context.fillStyle = "#eef1f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Keep the saved canvas calculation identical to the editor preview.
  // 50 is centered; the extended -50..150 range allows one full frame of travel.
  const offsetX = ((50 - settings.positionX) / 100) * canvas.width;
  const offsetY = ((50 - settings.positionY) / 100) * canvas.height;
  context.save();
  context.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  context.rotate((settings.rotation * Math.PI) / 180);
  context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("편집한 사진을 만들지 못했습니다.");
  return new File([blob], filename, { type: "image/webp" });
}
const catalogList = (value: string | undefined, fallback: string[]) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) && parsed.length
      ? parsed.map(String).filter(Boolean)
      : fallback;
  } catch {
    return fallback;
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
type AdminMenuItem = [key: string, icon: string, label: string];

const menuGroups: { label: string; items: AdminMenuItem[] }[] = [
  {
    label: "운영 현황",
    items: [["dashboard", "▦", "대시보드"]],
  },
  {
    label: "판매 관리",
    items: [
      ["orders", "▤", "주문·배송"],
      ["live", "▶", "라이브 커머스"],
    ],
  },
  {
    label: "상품 관리",
    items: [["products", "□", "상품 관리"]],
  },
  {
    label: "회원·혜택",
    items: [
      ["members", "♙", "회원 관리"],
      ["rewards", "R", "리워드 관리"],
      ["coupons", "◇", "쿠폰·할인"],
    ],
  },
  {
    label: "고객 소통",
    items: [
      ["inquiries", "?", "고객 문의"],
      ["reviews", "☆", "상품 후기"],
      ["notices", "!", "공지사항"],
      ["popups", "▣", "팝업"],
    ],
  },
  {
    label: "쇼핑몰 설정",
    items: [
      ["operations", "◉", "운영 설정"],
      ["settings", "⚙", "쇼핑몰 설정"],
    ],
  },
  {
    label: "권한·기록",
    items: [
      ["administrators", "♜", "관리자 계정"],
      ["audit", "≡", "관리자 기록"],
    ],
  },
];

const permissionOptions = [
  ["products", "상품 관리", "상품 등록·수정·판매 상태"],
  ["live", "라이브 커머스", "유튜브 스킨·생방송·재방송·쇼츠 관리"],
  ["members", "회원 관리", "회원 등록·정보·이용 상태"],
  ["rewards", "리워드 관리", "잔액·지급·차감·추천 보상을 통합 관리"],
  ["orders", "주문·배송", "주문 상태·배송·취소·환급"],
  ["reviews", "상품 후기", "후기 노출·답변·삭제"],
  ["notices", "공지사항", "공지 등록·수정·노출"],
  ["coupons", "쿠폰·할인", "리워드·할인 쿠폰 생성과 중지"],
  ["inquiries", "고객 문의", "회원 문의와 관리자 답변 관리"],
  ["popups", "팝업", "팝업 등록·노출 설정"],
  ["audit", "관리자 기록", "관리자 작업 기록 열람"],
] as const;

const adminMenuDescriptions: Record<string, string> = {
  dashboard: "오늘 처리할 주문과 회원·매출·리워드 현황을 한눈에 확인합니다.",
  orders: "결제 확인, 상품 준비, 운송장 입력, 배송완료, 취소·환급 순서로 주문을 처리합니다.",
  products: "상품 정보·사진·옵션·재고·가격·카테고리를 등록하고 판매 상태를 관리합니다.",
  live: "생방송 스킨, 방송 상품 번호표, 재방송 타임라인과 쇼츠 노출을 관리합니다.",
  members: "회원 정보와 이용 상태를 확인하고 허용된 경우 리워드를 지급하거나 차감합니다.",
  rewards: "지급·사용 내역, 추천 보상, 이상 징후를 확인하고 리워드 정책을 운영합니다.",
  coupons: "쿠폰의 혜택·사용 조건·기간·상태를 설정하고 발급 현황을 관리합니다.",
  inquiries: "회원 문의를 확인하고 처리 상태와 답변을 남깁니다.",
  reviews: "구매후기 노출, 관리자 답변, 삭제와 리워드 회수 여부를 관리합니다.",
  notices: "회원에게 보여줄 공지사항을 작성하고 노출 상태를 관리합니다.",
  popups: "홈 화면 팝업의 제목·내용·이미지와 노출 여부를 설정합니다.",
  operations: "결제·리워드·추천·출석·주문 처리 등 사이트 운영 정책을 설정합니다.",
  settings: "브랜드·로고·색상·회사정보·SEO·상담 채널과 사이트 기본값을 설정합니다.",
  administrators: "관리자 계정과 기능별 권한을 관리합니다. 일반 관리자는 본인 계정만 확인합니다.",
  audit: "관리자가 변경한 주문·회원·리워드·설정 기록을 확인합니다.",
};

function storedPermissions(item: any) {
  if (!item) return permissionOptions.map(([key]) => key);
  if (item.role === "supervisor") return permissionOptions.map(([key]) => key);
  try {
    const parsed = JSON.parse(String(item.permissions ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    const values = parsed.map(String);
    return Array.from(new Set(values.map((value) => value === "points" ? "rewards" : value)));
  } catch {
    return [];
  }
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [section, setSection] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editor, setEditor] = useState<{ type: string; item?: any } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_ADMIN_PAGE_SIZE);
  const loadedScopes = useRef(new Set<string>());
  const [loadingScope, setLoadingScope] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin?scope=dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "관리자 화면을 불러오지 못했습니다.");
      setData(payload);
      loadedScopes.current.add("dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "관리자 화면을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadScope(scope: string) {
    if (loadedScopes.current.has(scope)) return;
    setLoadingScope(scope);
    setError("");
    try {
      const response = await fetch(`/api/admin?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "선택한 관리 자료를 불러오지 못했습니다.");
      setData((current) => {
        if (!current) return payload;
        const next: any = {
          ...current,
          admin: payload.admin || current.admin,
          settings: { ...current.settings, ...(payload.settings || {}) },
          summary: scope === "dashboard" ? { ...current.summary, ...(payload.summary || {}) } : current.summary,
          statistics: scope === "dashboard" || scope === "operations"
            ? { ...(current.statistics || {}), ...(payload.statistics || {}) }
            : current.statistics,
        };
        for (const field of ADMIN_SCOPE_FIELDS[scope] || []) {
          if (field === "settings") continue;
          if (field in payload) next[field] = payload[field];
        }
        return next;
      });
      loadedScopes.current.add(scope);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "선택한 관리 자료를 불러오지 못했습니다.");
    } finally {
      setLoadingScope("");
    }
  }

  async function act(body: Record<string, unknown>, message = "저장되었습니다.") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "처리하지 못했습니다.");
      if (payload.scope) {
        const fieldsByScope: Record<string, string[]> = {
          self: ["admin", "adminAccounts"],
          administrators: ["admin", "adminAccounts"],
          settings: ["settings", "testData"],
          products: ["products"],
          live: ["settings", "products", "salesChannels", "channelOwnerCandidates"],
          operations: ["products"],
          members: ["members"],
          points: ["members", "pointLogs"],
          rewards: ["members", "pointLogs", "referrals", "rewardEvents", "referralFlags"],
          orders: ["orders"],
          reviews: ["reviews"],
          notices: ["notices"],
          coupons: ["coupons"],
          inquiries: ["inquiries"],
          popups: ["popups"],
          audit: ["auditLogs"],
        };
        setData((current) => {
          if (!current) return payload;
          const next: any = { ...current };
          for (const field of fieldsByScope[String(payload.scope)] || []) {
            if (field === "settings") next.settings = { ...current.settings, ...(payload.settings || {}) };
            else if (field in payload) next[field] = payload[field];
          }
          if (Array.isArray(next.products)) next.summary = { ...next.summary, activeProducts: next.products.filter((item: any) => item.status === "active").length };
          if (Array.isArray(next.members)) next.summary = { ...next.summary, members: next.members.length, issuedPoints: next.members.reduce((sum: number, item: any) => sum + Number(item.points || 0), 0) };
          return next;
        });
      } else {
        setData(payload);
      }
      setToast(String(payload.actionMessage || message));
      window.setTimeout(() => setToast(""), 2400);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "처리하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const source =
      section === "products"
        ? data.products
        : section === "members"
          ? data.members
          : section === "orders"
            ? data.orders
            : section === "reviews"
                ? data.reviews
                : section === "rewards"
                    ? data.referrals
                  : section === "notices"
                    ? data.notices
                    : section === "coupons"
                      ? data.coupons
                      : section === "inquiries"
                        ? data.inquiries
                        : section === "audit"
                          ? data.auditLogs
          : section === "popups"
                    ? data.popups
                    : section === "administrators"
                      ? data.adminAccounts
                    : [];
    const normalized = query.trim().toLowerCase();
    if (section === "orders" && normalized === "__pending__") {
      return source.filter((item) => ["결제확인대기", "접수", "취소요청"].includes(String(item.status)));
    }
    return normalized
      ? source.filter((item) => JSON.stringify(item).toLowerCase().includes(normalized))
      : source;
  }, [data, section, query]);
  const listSections = new Set([
    "products",
    "members",
    "rewards",
    "orders",
    "reviews",
    "notices",
    "coupons",
    "inquiries",
    "popups",
    "audit",
    "administrators",
  ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = listSections.has(section)
    ? filtered.slice((page - 1) * pageSize, page * pageSize)
    : filtered;

  useEffect(() => {
    setPage(1);
  }, [section, query]);

  if (!data && !error) {
    return <main className="admin-loading"><div className="loading-mark">A</div><p>관리 데이터를 불러오는 중입니다</p></main>;
  }
  if (!data) {
    return (
      <main className="error-screen">
        <div className="error-card"><span>ADMIN ACCESS</span><h1>관리자 권한이 필요합니다.</h1><p>{error}</p><a href="/" className="button primary">쇼핑몰로 돌아가기</a></div>
      </main>
    );
  }

  const s = data.settings;
  const pointName = s.point_name || "리워드";
  const legacyCategories = catalogList(s.product_categories, [
    "생활",
    "식품",
    "디지털",
    "주방",
    "뷰티",
    "패션",
    "기타",
  ]);
  const categoryConfig = parseCategoryConfig(s.product_category_config, legacyCategories);
  const categories = selectableCategoryNames(categoryConfig);
  const brands = Array.from(new Map([
    ...data.products.filter((product) => product.status !== "deleted").map((product) => String(product.brand || "").trim()).filter(Boolean),
    ...storedCatalogList(s.product_brands, ["POINT SELECT"]),
  ].map((brand) => [brand.normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("en-US"), brand] as const)).values()).sort((a, b) => a.localeCompare(b, "ko"));
  const brandGroups = mergeBrandGroups(
    parseBrandGroups(s.product_brand_groups),
    inferredBrandGroups(data.products, categoryConfig),
  );
  const allowedSections = new Set<string>([
    "dashboard",
    ...(Array.isArray(data.admin.permissions) ? data.admin.permissions : []),
  ]);
  const allMenuGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => item[0] === "administrators"
      ? [item[0], item[1], data.admin.isSupervisor ? "관리자 계정" : "내 관리자 계정"] as AdminMenuItem
      : item),
  }));
  const canSeeMenu = (key: string) => {
    if (key === "administrators") return true;
    if (key === "operations") return data.admin.isSupervisor;
    if (key === "settings") return data.admin.isSupervisor;
    if (key === "rewards") return data.admin.isSupervisor || allowedSections.has("rewards") || allowedSections.has("points");
    return data.admin.isSupervisor || allowedSections.has(key);
  };
  const visibleMenuGroups = allMenuGroups
    .map((group) => ({ ...group, items: group.items.filter(([key]) => canSeeMenu(key)) }))
    .filter((group) => group.items.length > 0);
  const visibleMenus = visibleMenuGroups.flatMap((group) => group.items);
  const visibleKeys = new Set(visibleMenus.map(([key]) => key));
  const openSection = (key: string) => {
    if (visibleKeys.has(key)) {
      setSection(key);
      setQuery("");
      void loadScope(key);
    }
  };
  const pageTitle = visibleMenus.find(([key]) => key === section)?.[2] ?? "대시보드";

  async function logout() {
    if (data?.admin.authType === "staff") {
      await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      window.location.href = "/admin/login";
      return;
    }
    window.location.href = "/signout-with-chatgpt?return_to=%2Fadmin%2Flogin";
  }

  return (
    <div
      className="admin-shell"
      style={{
        "--brand": s.primary_color,
        "--brand-2": s.secondary_color,
        "--accent": s.accent_color,
      } as React.CSSProperties}
    >
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          {s.logo_url ? <img src={s.logo_url} alt={s.brand_name} /> : <span>{s.logo_text || "PG"}</span>}
          <div><strong>{s.brand_name}</strong><small>{s.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small><em>ADMIN CENTER</em></div>
        </a>
        <nav aria-label="관리자 메뉴">
          {visibleMenuGroups.map((group) => (
            <div className="admin-menu-group" key={group.label}>
              <span className="admin-menu-group-label">{group.label}</span>
              {group.items.map(([key, icon, label]) => (
                <button key={key} className={section === key ? "active" : ""} onClick={() => openSection(key)}>
                  <span>{icon}</span>{label}
                  {key === "orders" && data.summary.pendingOrders > 0 && <b>{data.summary.pendingOrders}</b>}
                  {key === "inquiries" && data.summary.pendingInquiries > 0 && <b>{data.summary.pendingInquiries}</b>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-side-footer">
          <p><span>{data.admin.name.slice(0, 1)}</span><strong>{data.admin.name}<small>{data.admin.isSupervisor ? "슈퍼바이저" : "관리자"}</small></strong></p>
          <a href="/">쇼핑몰 보기 ↗</a>
          <button onClick={logout}>관리자 로그아웃</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div><span>REWARD SHOP OPERATION</span><h1>{pageTitle}</h1></div>
          <div className="admin-top-actions">
            {section !== "dashboard" && section !== "settings" && section !== "operations" && section !== "live" && section !== "products" && (
              <label className="admin-search"><span>⌕</span><input value={query === "__pending__" ? "처리 필요 주문" : query} onFocus={() => query === "__pending__" && setQuery("")} onChange={(event) => setQuery(event.target.value)} placeholder="목록 검색" /></label>
            )}
            {canSeeMenu("orders") && (
              <button
                type="button"
                className="notification"
                onClick={() => {
                  openSection("orders");
                  setQuery(data.summary.pendingOrders > 0 ? "__pending__" : "");
                }}
                aria-label={data.summary.pendingOrders > 0
                  ? `신규 주문 ${data.summary.pendingOrders}건 보기`
                  : "주문·배송 관리 보기"}
                title={data.summary.pendingOrders > 0
                  ? `신규 주문 ${data.summary.pendingOrders}건 보기`
                  : "주문·배송 관리"}
              >
                <span aria-hidden="true">🔔</span>
                {data.summary.pendingOrders > 0 && <b>{data.summary.pendingOrders}</b>}
              </button>
            )}
          </div>
        </header>

        <section className="admin-usage-manual" aria-label={`${pageTitle} 사용 안내`}>
          <div className="admin-current-guide">
            <span>{data.admin.isSupervisor ? "최고 관리자(슈퍼바이저)" : "일반 관리자"}</span>
            <div><strong>{pageTitle} 사용 안내</strong><p>{adminMenuDescriptions[section] || "현재 메뉴의 운영 정보를 확인하고 필요한 작업을 처리합니다."}</p></div>
          </div>
          <details>
            <summary>{data.admin.isSupervisor ? "최고 관리자 전체 메뉴 설명" : "내 권한으로 사용할 수 있는 메뉴 설명"}</summary>
            <div className="admin-manual-menu-list">
              {visibleMenus.map(([key, icon, label]) => <article key={key}><span>{icon}</span><div><strong>{label}</strong><p>{adminMenuDescriptions[key]}</p></div></article>)}
            </div>
          </details>
        </section>

        {loadingScope === section && <div className="admin-loading"><div className="loading-mark">A</div><p>선택한 관리 자료를 불러오는 중입니다.</p></div>}
        {loadingScope !== section && section === "dashboard" && <Dashboard data={data} pointName={pointName} setSection={openSection} visibleKeys={visibleKeys} />}
        {section === "products" && visibleKeys.has("products") && <Products rows={visibleRows} total={filtered.length} query={query} setQuery={setQuery} pointName={pointName} act={act} edit={(item) => setEditor({ type: "product", item })} create={() => setEditor({ type: "product" })} configure={() => setEditor({ type: "catalog" })} />}
        {section === "members" && visibleKeys.has("members") && <Members rows={visibleRows} total={filtered.length} pointName={pointName} act={act} edit={(item) => setEditor({ type: "member", item })} create={() => setEditor({ type: "member" })} point={(item) => setEditor({ type: "point", item })} canManagePoints={data.admin.isSupervisor || allowedSections.has("points") || allowedSections.has("rewards")} />}
        {section === "rewards" && visibleKeys.has("rewards") && <Rewards data={data} rows={visibleRows} total={filtered.length} pointName={pointName} act={act} />}
        {section === "orders" && visibleKeys.has("orders") && <Orders rows={visibleRows} total={filtered.length} pointName={pointName} act={act} shipping={(item: any) => setEditor({ type: "shipping", item })} />}
        {section === "reviews" && visibleKeys.has("reviews") && <Reviews rows={visibleRows} total={filtered.length} act={act} reply={(item: any) => setEditor({ type: "review", item })} />}
        {section === "notices" && visibleKeys.has("notices") && <Notices rows={visibleRows} total={filtered.length} act={act} edit={(item) => setEditor({ type: "notice", item })} create={() => setEditor({ type: "notice" })} />}
        {section === "coupons" && visibleKeys.has("coupons") && <Coupons rows={visibleRows} total={filtered.length} pointName={pointName} act={act} create={() => setEditor({ type: "coupon" })} />}
        {section === "inquiries" && visibleKeys.has("inquiries") && <Inquiries rows={visibleRows} total={filtered.length} act={act} answer={(item) => setEditor({ type: "inquiry", item })} />}
        {section === "popups" && visibleKeys.has("popups") && <Popups rows={visibleRows} total={filtered.length} act={act} edit={(item) => setEditor({ type: "popup", item })} create={() => setEditor({ type: "popup" })} />}
        {section === "audit" && visibleKeys.has("audit") && <AuditLogs rows={visibleRows} total={filtered.length} />}
        {section === "administrators" && data.admin.isSupervisor && <AdminAccounts rows={data.adminAccounts} total={data.adminAccounts.length} act={act} edit={(item) => setEditor({ type: "adminAccount", item })} create={() => setEditor({ type: "adminAccount" })} />}
        {section === "administrators" && !data.admin.isSupervisor && <MyAdminAccount row={data.adminAccounts[0]} edit={(item: any) => setEditor({ type: "adminSelf", item })} />}
        {section === "operations" && data.admin.isSupervisor && <OperationsSettings settings={s} products={data.products} categories={categories} statistics={data.statistics || {}} act={act} />}
        {section === "live" && visibleKeys.has("live") && <ChannelLiveWorkspace channels={data.salesChannels} ownerCandidates={data.channelOwnerCandidates || []} settings={s} products={data.products} act={act} isSupervisor={Boolean(data.admin?.isSupervisor)} />}
        {section === "settings" && data.admin.isSupervisor && <Settings settings={s} testData={data.testData} act={act} />}
        {listSections.has(section) && (filtered.length > pageSize || pageSize !== DEFAULT_ADMIN_PAGE_SIZE) && (
          <AdminPager page={page} totalPages={totalPages} pageSize={pageSize} move={setPage} resize={(size) => { setPageSize(size); setPage(1); }} />
        )}
      </main>

      {editor?.type === "product" && <AdminProductEditor item={editor.item} categoryConfig={categoryConfig} brands={brands} brandGroups={brandGroups} pointName={pointName} variantEnabled={s.feature_variant_stock_enabled === "true"} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "catalog" && <CatalogEditor categoryConfig={categoryConfig} products={data.products} brands={brands} brandGroups={brandGroups} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "shipping" && <ShippingEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "member" && <MemberEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "point" && <PointEditor item={editor.item} pointName={pointName} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "popup" && <PopupEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "notice" && <NoticeEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "coupon" && <CouponEditor categories={categories} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "inquiry" && <InquiryEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "review" && <ReviewEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "adminAccount" && <AdminAccountEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}
      {editor?.type === "adminSelf" && <AdminSelfEditor item={editor.item} close={() => setEditor(null)} act={act} busy={busy} />}

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="error-toast"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    </div>
  );
}

type ChannelCategorySetting = { sourceName: string; label: string; visible: boolean; sortOrder: number; productIds?: number[]; parentSourceName?: string; assignmentMode?: "auto" | "manual"; ruleType?: "brand" | "category"; ruleValue?: string; ruleCategory?: string };
type ChannelContactSettings = {
  use_channel_contact: boolean;
  contact_counselor_name: string;
  contact_counselor_image_url: string;
  contact_kakao_enabled: boolean;
  contact_kakao_url: string;
  contact_telegram_enabled: boolean;
  contact_telegram_url: string;
  contact_line_enabled: boolean;
  contact_line_url: string;
  contact_live_enabled: boolean;
  contact_live_url: string;
};
const storedCatalogList = (value: string | undefined, fallback: string[]) => {
  if (value === undefined) return fallback;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
};
type ProductBrandGroups = Record<string, string[]>;
const parseBrandGroups = (value: string | undefined): ProductBrandGroups => {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([brand, groups]) => [
      brand,
      Array.isArray(groups) ? Array.from(new Set(groups.map(String).filter(Boolean))) : [],
    ]));
  } catch {
    return {};
  }
};
const inferredBrandGroups = (products: any[], categoryConfig: StoreCategoryConfig): ProductBrandGroups => {
  const result: ProductBrandGroups = {};
  products.forEach((product) => {
    const brand = String(product.brand || "").trim();
    if (!brand || product.status === "deleted") return;
    const category = categoryConfig.categories.find((entry) => productMatchesCategory(product, entry.name, categoryConfig));
    if (!category) return;
    result[brand] = Array.from(new Set([...(result[brand] || []), category.name]));
  });
  return result;
};
const mergeBrandGroups = (...sources: ProductBrandGroups[]) => sources.reduce<ProductBrandGroups>((result, source) => {
  Object.entries(source).forEach(([brand, groups]) => {
    result[brand] = Array.from(new Set([...(result[brand] || []), ...groups]));
  });
  return result;
}, {});

const emptyChannelContact: ChannelContactSettings = {
  use_channel_contact: false,
  contact_counselor_name: "",
  contact_counselor_image_url: "",
  contact_kakao_enabled: true,
  contact_kakao_url: "",
  contact_telegram_enabled: true,
  contact_telegram_url: "",
  contact_line_enabled: true,
  contact_line_url: "",
  contact_live_enabled: true,
  contact_live_url: "",
};

export function ChannelManager({ channels, ownerCandidates = [], products, settings, act, initialChannelId = 0, startNew = false, selectedOnly = false, editorScope = "basic", isSupervisor = false, onDone }: { channels: any[]; ownerCandidates?: any[]; products: any[]; settings: Record<string, string>; act: (body: Record<string, unknown>, message?: string) => Promise<boolean>; initialChannelId?: number; startNew?: boolean; selectedOnly?: boolean; editorScope?: "basic" | "catalog"; isSupervisor?: boolean; onDone?: () => void }) {
  const emptyDraft = { id: 0, owner_member_id: 0, name: "", slug: "", operator_name: "", description: "", image_url: "", avatar_image_url: "", original_image_url: "", youtube_url: "", theme_color: "#111827", status: "draft", sort_order: 0, showcase_visible: true, showcase_order: 0, productIds: [] as number[], categorySettings: [] as ChannelCategorySetting[], contactSettings: { ...emptyChannelContact } };
  const [draft, setDraft] = useState(emptyDraft);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("전체");
  const [productBrandFilter, setProductBrandFilter] = useState("전체");
  const [productPickerPage, setProductPickerPage] = useState(1);
  const [activeChannelCategory, setActiveChannelCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [catalogNotice, setCatalogNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState("");
  const [cropMode, setCropMode] = useState<"cover" | "avatar">("cover");
  const [coverCrop, setCoverCrop] = useState<ChannelCropSettings>({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
  const [avatarCrop, setAvatarCrop] = useState<ChannelCropSettings>({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
  const [counselorCropFile, setCounselorCropFile] = useState<File | null>(null);
  const [counselorCropPreviewUrl, setCounselorCropPreviewUrl] = useState("");
  const [counselorCrop, setCounselorCrop] = useState<ChannelCropSettings>({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
  const selectedProductIds = draft.productIds;
  const globalCategoryConfig = useMemo(() => parseCategoryConfig(settings.product_category_config, catalogList(settings.product_categories, [])), [settings.product_category_config, settings.product_categories]);
  const channelCategoryRows = draft.categorySettings;
  const activeCategory = channelCategoryRows.find((entry) => entry.sourceName === activeChannelCategory);
  const availableProducts = products.filter((product) => product.status === "active");
  const availableProductIds = new Set(availableProducts.map((product) => Number(product.id)));
  const productBrands = Array.from(new Set(availableProducts.map((product) => String(product.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
  const filteredPickerProducts = availableProducts
    .filter((product) => {
      const needle = productSearch.trim().toLowerCase();
      const matchesSearch = !needle || `${product.name} ${product.style_number || ""} ${product.brand || ""}`.toLowerCase().includes(needle);
      const matchesCategory = productCategoryFilter === "전체" || productMatchesCategory(product, productCategoryFilter, globalCategoryConfig);
      const matchesBrand = productBrandFilter === "전체" || String(product.brand || "") === productBrandFilter;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  const pickerPageSize = 24;
  const pickerTotalPages = Math.max(1, Math.ceil(filteredPickerProducts.length / pickerPageSize));
  const matchingProducts = filteredPickerProducts.slice((productPickerPage - 1) * pickerPageSize, productPickerPage * pickerPageSize);
  const categoryNames = selectableCategoryNames(globalCategoryConfig);
  const isCuratedCategory = (entry?: ChannelCategorySetting) => Boolean(entry && /추천|한정|협업/i.test(entry.label));
  const parentFor = (entry?: ChannelCategorySetting) => entry?.parentSourceName ? channelCategoryRows.find((parent) => parent.sourceName === entry.parentSourceName) : undefined;
  const isBrandCategory = (entry?: ChannelCategorySetting) => Boolean(entry && /브랜드/i.test(parentFor(entry)?.label || ""));
  const automaticRule = (entry?: ChannelCategorySetting) => {
    if (!entry || isCuratedCategory(entry)) return { type: "manual" as const, value: "" };
    if (entry.ruleType && entry.ruleValue) return { type: entry.ruleType, value: entry.ruleValue };
    if (isBrandCategory(entry)) {
      const brand = productBrands.find((value) => value.toLowerCase() === entry.label.trim().toLowerCase()) || "";
      return { type: "brand" as const, value: brand };
    }
    const category = categoryNames.find((value) => value === entry.label) || "";
    return { type: "category" as const, value: category };
  };
  const brandRuleCategory = (entry?: ChannelCategorySetting) => entry
    ? inferChannelBrandRuleCategory(entry, channelCategoryRows, availableProducts, globalCategoryConfig, selectedProductIds)
    : "";
  const automaticIdsFor = (entry?: ChannelCategorySetting) => {
    const rule = automaticRule(entry);
    if (!entry || rule.type === "manual" || !rule.value) return entry?.productIds || [];
    return availableProducts.filter((product) => rule.type === "brand"
      ? Boolean(brandRuleCategory(entry))
        && brandMatchesChannelRule(product.brand, rule.value)
        && String(product.category || "") === brandRuleCategory(entry)
      : productMatchesCategory(product, rule.value, globalCategoryConfig)).map((product) => Number(product.id));
  };
  const categorizedProductIds = new Set(channelCategoryRows.flatMap((entry) => isCuratedCategory(entry) ? (entry.productIds || []) : automaticIdsFor(entry)));
  const uncategorizedProductIds = selectedProductIds.filter((id) => !categorizedProductIds.has(id));
  const selectedOwner = ownerCandidates.find((member) => Number(member.id) === Number(draft.owner_member_id));
  const ownerMatches = ownerSearch.trim().length < 1 ? [] : ownerCandidates.filter((member) => {
    const needle = ownerSearch.trim().toLowerCase();
    return `${member.email || ""} ${member.name || ""}`.toLowerCase().includes(needle);
  }).slice(0, 12);

  function editChannel(channel: any) {
    const productIds = String(channel.product_ids || "")
      .split(",")
      .map(Number)
      .filter((value) => value > 0);
    const storedContact = jsonSetting<Record<string, unknown>>(String(channel.contact_settings || "{}"), {});
    setDraft({
      id: Number(channel.id),
      owner_member_id: Number(channel.owner_member_id || 0),
      name: String(channel.name || ""),
      slug: String(channel.slug || ""),
      operator_name: String(channel.operator_name || ""),
      description: String(channel.description || ""),
      image_url: String(channel.image_url || ""),
      avatar_image_url: String(channel.avatar_image_url || channel.image_url || ""),
      original_image_url: String(channel.original_image_url || channel.image_url || ""),
      youtube_url: String(channel.youtube_url || ""),
      theme_color: String(channel.theme_color || "#111827"),
      status: String(channel.status || "draft"),
      sort_order: Number(channel.sort_order || 0),
      showcase_visible: Number(channel.showcase_visible ?? 1) === 1,
      showcase_order: Number(channel.showcase_order || 0),
      productIds,
      categorySettings: jsonSetting<ChannelCategorySetting[]>(String(channel.category_settings || "[]"), []).map((entry) => ({ ...entry, productIds: Array.isArray(entry.productIds) ? entry.productIds.map(Number).filter((id) => id > 0) : [] })),
      contactSettings: {
        use_channel_contact: storedContact.use_channel_contact === true || storedContact.use_channel_contact === "true",
        contact_counselor_name: String(storedContact.contact_counselor_name || ""),
        contact_counselor_image_url: String(storedContact.contact_counselor_image_url || ""),
        contact_kakao_enabled: storedContact.contact_kakao_enabled !== false && storedContact.contact_kakao_enabled !== "false",
        contact_kakao_url: String(storedContact.contact_kakao_url || ""),
        contact_telegram_enabled: storedContact.contact_telegram_enabled !== false && storedContact.contact_telegram_enabled !== "false",
        contact_telegram_url: String(storedContact.contact_telegram_url || ""),
        contact_line_enabled: storedContact.contact_line_enabled !== false && storedContact.contact_line_enabled !== "false",
        contact_line_url: String(storedContact.contact_line_url || ""),
        contact_live_enabled: storedContact.contact_live_enabled !== false && storedContact.contact_live_enabled !== "false",
        contact_live_url: String(storedContact.contact_live_url || ""),
      },
    });
    setProductSearch("");
    setOwnerSearch("");
    setProductCategoryFilter("전체");
    setProductBrandFilter("전체");
    setProductPickerPage(1);
    setActiveChannelCategory("");
    setEditing(true);
  }

  function toggleProduct(productId: number) {
    if (!activeChannelCategory) return;
    setDraft((current) => ({ ...current,
      productIds: current.productIds.includes(productId) ? current.productIds : [...current.productIds, productId],
      categorySettings: current.categorySettings.map((entry) => entry.sourceName !== activeChannelCategory ? entry : ({ ...entry, productIds: (entry.productIds || []).includes(productId) ? (entry.productIds || []).filter((id) => id !== productId) : [...(entry.productIds || []), productId] })),
    }));
  }

  function addChannelCategory() {
    const label = newCategoryName.trim();
    if (!label) return;
    const sourceName = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const siblingCount = draft.categorySettings.filter((entry) => String(entry.parentSourceName || "") === newCategoryParent).length;
    setDraft((current) => ({ ...current, categorySettings: [...current.categorySettings, { sourceName, label, visible: true, sortOrder: siblingCount, productIds: [], parentSourceName: newCategoryParent || undefined }] }));
    setNewCategoryName("");
    setNewCategoryParent("");
    setActiveChannelCategory(sourceName);
    setProductPickerPage(1);
  }

  function removeChannelCategory(sourceName: string) {
    setDraft((current) => ({ ...current, categorySettings: current.categorySettings.filter((entry) => entry.sourceName !== sourceName && entry.parentSourceName !== sourceName) }));
    if (activeChannelCategory === sourceName) setActiveChannelCategory("");
  }

  function addCurrentPickerPage() {
    if (!activeChannelCategory) return;
    const pageIds = matchingProducts.map((product) => Number(product.id));
    setDraft((current) => ({ ...current,
      productIds: Array.from(new Set([...current.productIds, ...pageIds])),
      categorySettings: current.categorySettings.map((entry) => entry.sourceName !== activeChannelCategory ? entry : ({ ...entry, productIds: Array.from(new Set([...(entry.productIds || []), ...pageIds])) })),
    }));
    setCatalogNotice(`현재 페이지 상품 ${pageIds.length}개를 추가했습니다.`);
  }

  function addAllFilteredProducts() {
    if (!activeChannelCategory) return;
    const resultIds = filteredPickerProducts.map((product) => Number(product.id)).filter((id) => id > 0);
    const existingCategoryIds = draft.categorySettings.find((entry) => entry.sourceName === activeChannelCategory)?.productIds || [];
    const categoryIds = Array.from(new Set([...existingCategoryIds, ...resultIds])).slice(0, 2000);
    const productIds = Array.from(new Set([...draft.productIds, ...categoryIds])).slice(0, 2000);
    const added = categoryIds.filter((id) => !existingCategoryIds.includes(id)).length;
    const duplicates = resultIds.filter((id) => existingCategoryIds.includes(id)).length;
    const omitted = Math.max(0, resultIds.length - added - duplicates);
    setDraft((current) => ({
      ...current,
      productIds,
      categorySettings: current.categorySettings.map((entry) => entry.sourceName !== activeChannelCategory ? entry : ({ ...entry, productIds: categoryIds })),
    }));
    setCatalogNotice(`검색 결과 ${resultIds.length}개 중 ${added}개를 추가했습니다.${duplicates > 0 ? ` 이미 연결된 ${duplicates}개는 중복 등록하지 않았습니다.` : ""}${omitted > 0 ? ` 안전 한도 때문에 ${omitted}개는 제외했습니다.` : ""}`);
  }

  function categoryCard(entry: ChannelCategorySetting, child = false) {
    const displayedCount = isCuratedCategory(entry) ? (entry.productIds || []).filter((id) => availableProductIds.has(Number(id))).length : automaticIdsFor(entry).length;
    const empty = displayedCount === 0;
    const manuallyHidden = entry.visible === false;
    const customerVisible = !empty && !manuallyHidden;
    return <article key={entry.sourceName} className={`${activeChannelCategory === entry.sourceName ? "active" : ""} ${child ? "child" : ""} ${empty ? "empty" : ""} ${manuallyHidden ? "manually-hidden" : ""}`}>
      <button type="button" className="channel-category-open" onClick={() => { setActiveChannelCategory(entry.sourceName); setProductPickerPage(1); setCatalogNotice(""); }}>
        <span className={customerVisible ? "visible" : "hidden"}>{empty ? "자동 숨김" : manuallyHidden ? "수동 숨김" : "노출 중"}</span>
        <strong>{entry.label}</strong>
        <small>{isCuratedCategory(entry) ? "직접 선택" : "자동 연결"} · 상품 {displayedCount.toLocaleString("ko-KR")}개</small>
      </button>
      <div className="channel-category-controls">
        <label className="channel-category-name"><span>표시 이름</span><input value={entry.label} maxLength={40} onChange={(event) => updateCategorySetting(entry.sourceName, { label: event.target.value })} /></label>
        <label className={`channel-category-hide ${empty ? "automatic" : ""}`} title={empty ? "상품이 등록되면 자동으로 노출됩니다." : "체크하면 상품이 있어도 고객 화면에서 숨깁니다."}><input type="checkbox" checked={empty || manuallyHidden} disabled={empty} onChange={(event) => updateCategorySetting(entry.sourceName, { visible: !event.target.checked })} /><span>{empty ? "상품 없음 · 자동 숨김" : "수동 숨김"}</span></label>
        <label className="channel-category-order"><span>노출 순서</span><input type="number" min="0" max="1000" value={entry.sortOrder} onChange={(event) => updateCategorySetting(entry.sourceName, { sortOrder: Number(event.target.value) })} /></label>
        <button type="button" className="danger" onClick={() => removeChannelCategory(entry.sourceName)}>{child ? "하위 삭제" : "카테고리 삭제"}</button>
      </div>
    </article>;
  }

  function updateCategorySetting(sourceName: string, patch: Partial<ChannelCategorySetting>) {
    setDraft((current) => {
      const existing = current.categorySettings.find((entry) => entry.sourceName === sourceName) || {
        sourceName,
        label: sourceName,
        visible: true,
        sortOrder: current.categorySettings.length,
        productIds: [],
      };
      return {
        ...current,
        categorySettings: [...current.categorySettings.filter((entry) => entry.sourceName !== sourceName), { ...existing, ...patch }],
      };
    });
  }

  useLayoutEffect(() => {
    if (startNew) { setDraft(emptyDraft); setEditing(true); return; }
    const initialChannel = channels.find((channel) => Number(channel.id) === Number(initialChannelId));
    if (initialChannel) editChannel(initialChannel);
  }, [initialChannelId, startNew]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const ok = await act({
      action: "channel.save",
      id: draft.id || undefined,
      ownerMemberId: draft.owner_member_id,
      name: draft.name,
      slug: draft.slug,
      operatorName: draft.operator_name,
      description: draft.description,
      imageUrl: draft.image_url,
      avatarImageUrl: draft.avatar_image_url,
      originalImageUrl: draft.original_image_url,
      youtubeUrl: draft.youtube_url,
      themeColor: draft.theme_color,
      status: draft.status,
      sortOrder: draft.sort_order,
      showcaseVisible: draft.showcase_visible,
      showcaseOrder: draft.showcase_order,
      productIds: draft.productIds,
      categorySettings: channelCategoryRows.map((entry) => {
        const rule = automaticRule(entry);
        return isCuratedCategory(entry) ? { ...entry, assignmentMode: "manual", ruleType: undefined, ruleValue: undefined, ruleCategory: undefined } : { ...entry, assignmentMode: "auto", ruleType: rule.type === "manual" ? undefined : rule.type, ruleValue: rule.value, ruleCategory: rule.type === "brand" ? brandRuleCategory(entry) : undefined, productIds: [] };
      }),
      contactSettings: draft.contactSettings,
    }, draft.id ? "판매 채널을 수정했습니다." : "판매 채널을 만들었습니다.");
    if (ok) {
      if (!selectedOnly) {
        setEditing(false);
        setDraft(emptyDraft);
        setProductSearch("");
        onDone?.();
      }
    }
  }

  async function deleteCurrentChannel() {
    if (!draft.id || !confirm(`${draft.name} 채널을 삭제하시겠습니까? 주문이 있는 채널은 삭제되지 않습니다.`)) return;
    const ok = await act({ action: "channel.delete", id: draft.id }, "판매 채널을 삭제했습니다.");
    if (ok) onDone?.();
  }

  async function uploadChannelImage(file: File) {
    const uploadFile = await prepareChannelImage(file);
    const formData = new FormData();
    formData.append("image", uploadFile);
    const response = await fetch(`/api/channel-image?channelId=${draft.id || "draft"}`, { method: "POST", body: formData });
    const payload = await channelImageResponse(response);
    if (!response.ok) throw new Error(payload.error || "사진을 올리지 못했습니다.");
    return String(payload.url || "");
  }

  function openChannelImageEditor(file: File) {
    if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
    setCropFile(file);
    setCropPreviewUrl(URL.createObjectURL(file));
    setCropMode("cover");
    setCoverCrop({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
    setAvatarCrop({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
    setImageUploadError("");
  }

  function closeChannelImageEditor() {
    if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
    setCropFile(null);
    setCropPreviewUrl("");
  }

  async function editExistingChannelImage() {
    if (!draft.image_url) return;
    setImageUploadError("");
    try {
      const response = await fetch(draft.original_image_url || draft.image_url, { credentials: "include" });
      if (!response.ok) throw new Error("현재 사진을 불러오지 못했습니다.");
      const blob = await response.blob();
      openChannelImageEditor(new File([blob], "current-channel-image", { type: blob.type || "image/webp" }));
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : "현재 사진을 편집할 수 없습니다.");
    }
  }

  async function saveCroppedChannelImage() {
    if (!cropFile) return;
    setImageUploading(true);
    setImageUploadError("");
    try {
      const [coverFile, avatarFile] = await Promise.all([
        cropChannelImage(cropFile, coverCrop, 1170, 690, "channel-cover.webp"),
        cropChannelImage(cropFile, avatarCrop, 800, 800, "channel-avatar.webp"),
      ]);
      const originalFile = await prepareChannelImage(cropFile);
      const [imageUrl, avatarImageUrl, originalImageUrl] = await Promise.all([
        uploadChannelImage(coverFile),
        uploadChannelImage(avatarFile),
        uploadChannelImage(originalFile),
      ]);
      setDraft((current) => ({ ...current, image_url: imageUrl, avatar_image_url: avatarImageUrl, original_image_url: originalImageUrl }));
      closeChannelImageEditor();
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : "사진을 편집하지 못했습니다.");
    } finally {
      setImageUploading(false);
    }
  }

  const activeCrop = cropMode === "cover" ? coverCrop : avatarCrop;
  const updateActiveCrop = (patch: Partial<ChannelCropSettings>) => {
    if (cropMode === "cover") setCoverCrop((current) => ({ ...current, ...patch }));
    else setAvatarCrop((current) => ({ ...current, ...patch }));
  };
  const updateChannelContact = (patch: Partial<ChannelContactSettings>) => setDraft((current) => ({ ...current, contactSettings: { ...current.contactSettings, ...patch } }));
  function openCounselorImageEditor(file: File) {
    if (counselorCropPreviewUrl) URL.revokeObjectURL(counselorCropPreviewUrl);
    setCounselorCropFile(file);
    setCounselorCropPreviewUrl(URL.createObjectURL(file));
    setCounselorCrop({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
    setImageUploadError("");
  }
  function uploadChannelCounselorImage(file: File) {
    openCounselorImageEditor(file);
  }
  function closeCounselorImageEditor() {
    if (counselorCropPreviewUrl) URL.revokeObjectURL(counselorCropPreviewUrl);
    setCounselorCropFile(null);
    setCounselorCropPreviewUrl("");
  }
  async function saveCroppedCounselorImage() {
    if (!counselorCropFile) return;
    setImageUploading(true);
    setImageUploadError("");
    try {
      const squareFile = await cropChannelImage(counselorCropFile, counselorCrop, 800, 800, "channel-counselor.webp");
      const url = await uploadChannelImage(squareFile);
      updateChannelContact({ contact_counselor_image_url: url });
      closeCounselorImageEditor();
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : "상담자 사진을 편집하지 못했습니다.");
    } finally {
      setImageUploading(false);
    }
  }
  const cropTransform = (settings: ChannelCropSettings) => `translate(${50 - settings.positionX}%, ${50 - settings.positionY}%) scale(${settings.zoom}) rotate(${settings.rotation}deg)`;
  const cropPositionLabel = (value: number, negative: string, positive: string) => value === 50 ? "중앙" : value < 50 ? `${positive} ${50 - value}` : `${negative} ${value - 50}`;

  return <section className={`settings-card channel-manager ${selectedOnly ? "selected-channel-editor" : ""}`}>
    {counselorCropFile && counselorCropPreviewUrl && <div className="channel-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="counselor-crop-title"><div className="channel-crop-dialog counselor-crop-dialog"><header><div><span>COUNSELOR IMAGE</span><h3 id="counselor-crop-title">상담자 사진 정사각형 편집</h3><p>상담창에 표시될 얼굴과 인물이 정사각형 안에 자연스럽게 보이도록 맞춰 주세요.</p></div><button type="button" onClick={closeCounselorImageEditor} aria-label="상담자 사진 편집 닫기">×</button></header><div className="channel-crop-preview is-avatar"><img src={counselorCropPreviewUrl} alt="상담자 사진 정사각형 미리보기" style={{ transform: cropTransform(counselorCrop) }} /></div><div className="channel-crop-controls"><label>사진 크기 <input type="range" min="0.55" max="3" step="0.05" value={counselorCrop.zoom} onChange={(event) => setCounselorCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} /><output>{Math.round(counselorCrop.zoom * 100)}%</output></label><label>좌우 위치 <input type="range" min="-50" max="150" value={counselorCrop.positionX} onChange={(event) => setCounselorCrop((current) => ({ ...current, positionX: Number(event.target.value) }))} /><output>{cropPositionLabel(counselorCrop.positionX, "왼쪽", "오른쪽")}</output></label><label>상하 위치 <input type="range" min="-50" max="150" value={counselorCrop.positionY} onChange={(event) => setCounselorCrop((current) => ({ ...current, positionY: Number(event.target.value) }))} /><output>{cropPositionLabel(counselorCrop.positionY, "위", "아래")}</output></label><label>사진 회전 <input type="range" min="-180" max="180" step="1" value={counselorCrop.rotation} onChange={(event) => setCounselorCrop((current) => ({ ...current, rotation: Number(event.target.value) }))} /><output>{counselorCrop.rotation}°</output></label><p className="channel-crop-help">이 정사각형 미리보기 모습 그대로 저장되며, 실제 상담창에서는 원형으로 표시됩니다.</p></div><footer><button type="button" onClick={() => setCounselorCrop({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 })}>처음으로</button><button type="button" className="admin-primary" onClick={saveCroppedCounselorImage} disabled={imageUploading}>{imageUploading ? "사진 저장 중…" : "편집한 사진 사용"}</button></footer></div></div>}
    {cropFile && cropPreviewUrl && <div className="channel-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="channel-crop-title"><div className="channel-crop-dialog"><header><div><span>CHANNEL IMAGE</span><h3 id="channel-crop-title">대표 이미지 두 곳 맞춤 편집</h3><p>가로 카드와 정사각형 로고를 각각 조절한 뒤 한 번에 저장합니다.</p></div><button type="button" onClick={closeChannelImageEditor} aria-label="사진 편집 닫기">×</button></header><div className="channel-crop-tabs" role="tablist"><button type="button" className={cropMode === "cover" ? "active" : ""} onClick={() => setCropMode("cover")}>① 가로 카드 · 1170×690</button><button type="button" className={cropMode === "avatar" ? "active" : ""} onClick={() => setCropMode("avatar")}>② 정사각형 로고 · 800×800</button></div><div className={`channel-crop-preview ${cropMode === "avatar" ? "is-avatar" : ""}`}><img src={cropPreviewUrl} alt={`${cropMode === "cover" ? "가로 카드" : "정사각형 로고"} 편집 미리보기`} style={{ transform: cropTransform(activeCrop) }} /></div><div className="channel-crop-pair-preview"><figure><div className="cover"><img src={cropPreviewUrl} alt="가로 카드 결과" style={{ transform: cropTransform(coverCrop) }} /></div><figcaption>가로 채널 카드</figcaption></figure><figure><div className="avatar"><img src={cropPreviewUrl} alt="정사각형 로고 결과" style={{ transform: cropTransform(avatarCrop) }} /></div><figcaption>상단·목록 로고</figcaption></figure></div><div className="channel-crop-controls"><label>사진 크기 <input type="range" min="0.55" max="3" step="0.05" value={activeCrop.zoom} onChange={(event) => updateActiveCrop({ zoom: Number(event.target.value) })} /><output>{Math.round(activeCrop.zoom * 100)}%</output></label><label>좌우 위치 <input type="range" min="-50" max="150" value={activeCrop.positionX} onChange={(event) => updateActiveCrop({ positionX: Number(event.target.value) })} /><output>{cropPositionLabel(activeCrop.positionX, "왼쪽", "오른쪽")}</output></label><label>상하 위치 <input type="range" min="-50" max="150" value={activeCrop.positionY} onChange={(event) => updateActiveCrop({ positionY: Number(event.target.value) })} /><output>{cropPositionLabel(activeCrop.positionY, "위", "아래")}</output></label><label>사진 회전 <input type="range" min="-180" max="180" step="1" value={activeCrop.rotation} onChange={(event) => updateActiveCrop({ rotation: Number(event.target.value) })} /><output>{activeCrop.rotation}°</output></label><p className="channel-crop-help">상하·좌우 막대는 중앙을 기준으로 양쪽 한 화면만큼 더 움직일 수 있습니다. 아래의 두 결과 미리보기와 저장되는 사진이 같은 위치로 맞춰집니다.</p></div><footer><button type="button" onClick={() => updateActiveCrop({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 })}>현재 규격 처음으로</button><button type="button" className="admin-primary" onClick={saveCroppedChannelImage} disabled={imageUploading}>{imageUploading ? "두 이미지 저장 중…" : "두 이미지 모두 사용"}</button></footer></div></div>}
    {selectedOnly ? <header><span>{editorScope === "catalog" ? "CATALOG" : "CHANNEL INFO"}</span><div><h2>{draft.name || "선택 채널"} {editorScope === "catalog" ? "상품·카테고리" : "기본정보"}</h2><p>{editorScope === "catalog" ? "선택한 채널에서 판매할 상품과 고객 화면의 카테고리만 설정합니다." : "선택한 채널의 이름, 주소, 소개와 공개 상태를 설정합니다."}</p></div>{draft.id ? <a className="channel-editor-preview" href={`/channel/${draft.slug}`} target="_blank" rel="noreferrer">미리보기 ↗</a> : null}</header> : editing ? <header><span>CHANNEL EDITOR</span><div><h2>{draft.id ? `${draft.name} 기본정보 수정` : "새 채널 추가"}</h2><p>{draft.id ? "선택한 채널의 기본 정보만 수정합니다." : "새로운 방송 판매 채널의 기본 정보만 입력합니다."}</p></div><button type="button" onClick={() => { setEditing(false); setDraft(emptyDraft); onDone?.(); }}>← 방송 운영으로</button></header> : <header><span>CHANNELS</span><div><h2>판매 채널 관리</h2><p>등록된 채널을 확인하고 새 채널을 추가하거나 기존 채널을 수정합니다.</p></div><button type="button" className="admin-primary" onClick={() => { setDraft(emptyDraft); setEditing(true); }}>+ 채널 추가하기</button></header>}
    {!selectedOnly && !channels.length && <div className="channel-empty"><p>등록된 판매 채널이 없습니다. 기존 라이브 설정을 안전하게 복사해 첫 채널을 만들 수 있습니다.</p><button type="button" onClick={() => act({ action: "channel.bootstrap" }, "기존 라이브 설정을 기본 채널 초안으로 복사했습니다.")}>기존 라이브 설정으로 시작</button></div>}
    {!selectedOnly && !editing && !!channels.length && <div className="channel-list">{channels.map((channel) => <article key={channel.id} style={{ borderTopColor: channel.theme_color || "#111827" }}><div className="channel-card-media">{channel.image_url ? <img src={channel.image_url} alt="" /> : <span style={{ background: channel.theme_color || "#111827" }}>{String(channel.name || "C").slice(0, 1)}</span>}</div><div className="channel-card-copy"><span>{channel.status === "active" ? "공개" : channel.status === "inactive" ? "숨김" : "초안"}</span><h3>{channel.name}</h3><p>{channel.operator_name || "운영자 미입력"} · 상품 {Number(channel.product_count || 0)}개</p><small>{channel.owner_member_email ? `회원아이디 ${channel.owner_member_email}` : "연결 회원 없음"} · /channel/{channel.slug}</small></div><div className="row-actions"><a href={`/channel/${channel.slug}`} target="_blank" rel="noreferrer">미리보기</a><button type="button" onClick={() => editChannel(channel)}>채널 기본정보 수정</button><button type="button" onClick={() => act({ action: "channel.status", id: channel.id, status: channel.status === "active" ? "inactive" : "active" }, channel.status === "active" ? "채널을 숨겼습니다." : "채널을 공개했습니다.")}>{channel.status === "active" ? "숨기기" : "공개"}</button></div></article>)}</div>}
    {editing && <form className="channel-editor" onSubmit={save}>
      {editorScope === "basic" && <div className="settings-fields">
        <div className="wide channel-owner-picker">
          <span>채널 회원아이디 <b>필수</b></span>
          {selectedOwner ? <div className="channel-owner-selected"><div><strong>{selectedOwner.email}</strong><small>{selectedOwner.name || "이름 미입력"} · 이 회원의 마이페이지에 채널 관리 메뉴가 열립니다.</small></div><button type="button" onClick={() => { setDraft((current) => ({ ...current, owner_member_id: 0 })); setOwnerSearch(""); }}>다른 회원 선택</button></div> : <><input value={ownerSearch} onChange={(event) => setOwnerSearch(event.target.value)} placeholder="회원 아이디(이메일) 또는 이름 검색" autoComplete="off" />{ownerSearch.trim() && <div className="channel-owner-results">{ownerMatches.map((member) => { const usedByAnother = Number(member.channel_id || 0) > 0 && Number(member.channel_id) !== Number(draft.id); return <button type="button" key={member.id} disabled={usedByAnother} onClick={() => { setDraft((current) => ({ ...current, owner_member_id: Number(member.id), operator_name: current.operator_name || String(member.name || "") })); setOwnerSearch(""); }}><span><strong>{member.email}</strong><small>{member.name || "이름 미입력"}</small></span><em>{usedByAnother ? `${member.channel_name}에서 사용 중` : "선택"}</em></button>; })}{!ownerMatches.length && <p>일치하는 가입 회원이 없습니다.</p>}</div>}</>}
          <small>한 회원은 하나의 채널만 운영할 수 있습니다. 이미 다른 채널과 연결된 회원은 선택할 수 없습니다.</small>
        </div>
        <label>채널명<input required maxLength={80} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 오르미르" /></label>
        <label>채널 주소<input required pattern="[a-z0-9-]+" value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} placeholder="예: ormire" /></label>
        <label>운영자 표시명<input maxLength={80} value={draft.operator_name} onChange={(event) => setDraft((current) => ({ ...current, operator_name: event.target.value }))} /></label>
        <label>대표 색상<input type="color" value={draft.theme_color} onChange={(event) => setDraft((current) => ({ ...current, theme_color: event.target.value }))} /></label>
        <label className="wide">유튜브 주소<input type="url" value={draft.youtube_url} onChange={(event) => setDraft((current) => ({ ...current, youtube_url: event.target.value }))} placeholder="https://www.youtube.com/@channel" /></label>
        <div className="wide channel-image-upload"><span>대표 이미지</span><div className="channel-image-current">{draft.image_url ? <figure><img className="cover" src={draft.image_url} alt="현재 가로 채널 카드" /><figcaption>가로 카드</figcaption></figure> : <b style={{ background: draft.theme_color }}>{String(draft.name || "채널").slice(0, 1)}</b>}{draft.avatar_image_url || draft.image_url ? <figure><img className="avatar" src={draft.avatar_image_url || draft.image_url} alt="현재 정사각형 채널 로고" /><figcaption>정사각형 로고</figcaption></figure> : null}<label className="channel-image-file">{imageUploading ? "업로드 중…" : draft.image_url ? "다른 사진 선택" : "사진 선택"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) openChannelImageEditor(file); event.currentTarget.value = ""; }} /></label>{draft.image_url && <button type="button" onClick={editExistingChannelImage}>사진 편집</button>}{draft.image_url && <button type="button" onClick={() => setDraft((current) => ({ ...current, image_url: "", avatar_image_url: "" }))}>사진 제거</button>}</div><small>사진 한 장을 선택하면 가로 카드와 정사각형 로고를 각각 맞춰 저장할 수 있습니다. 이미 잘린 기존 사진은 원본을 다시 선택해야 잘린 부분을 복원할 수 있습니다.</small>{imageUploadError && <em>{imageUploadError}</em>}</div>
        <fieldset className="channel-contact-settings wide"><legend>채널 전용 상담</legend><div className="channel-contact-mode"><button type="button" className={!draft.contactSettings.use_channel_contact ? "active" : ""} onClick={() => updateChannelContact({ use_channel_contact: false })}>전체 홈페이지 상담사 사용</button><button type="button" className={draft.contactSettings.use_channel_contact ? "active" : ""} onClick={() => updateChannelContact({ use_channel_contact: true })}>이 채널 전용 상담사 사용</button></div><p>전용 상담을 선택하면 이 채널에서는 아래 담당자와 상담 주소만 표시됩니다. 전체 홈페이지 상담 설정은 바뀌지 않습니다.</p>{draft.contactSettings.use_channel_contact && <div className="channel-contact-grid"><label>상담 담당자명<input maxLength={80} value={draft.contactSettings.contact_counselor_name} onChange={(event) => updateChannelContact({ contact_counselor_name: event.target.value })} placeholder="예: 오르미르 상담팀" /></label><div className="channel-contact-photo"><span>상담자 사진</span>{draft.contactSettings.contact_counselor_image_url ? <img src={draft.contactSettings.contact_counselor_image_url} alt="채널 상담자" /> : <b>CS</b>}<label className="channel-image-file">{imageUploading ? "업로드 중…" : "사진 선택"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadChannelCounselorImage(file); event.currentTarget.value = ""; }} /></label>{draft.contactSettings.contact_counselor_image_url && <button type="button" onClick={() => updateChannelContact({ contact_counselor_image_url: "" })}>사진 제거</button>}</div>{([['kakao', '카카오톡'], ['telegram', '텔레그램'], ['line', '라인'], ['live', '실시간 상담']] as const).map(([key, label]) => { const enabledKey = `contact_${key}_enabled` as keyof ChannelContactSettings; const urlKey = `contact_${key}_url` as keyof ChannelContactSettings; return <div className="channel-contact-row" key={key}><label><input type="checkbox" checked={Boolean(draft.contactSettings[enabledKey])} onChange={(event) => updateChannelContact({ [enabledKey]: event.target.checked })} /> {label} 사용</label><input type="text" value={String(draft.contactSettings[urlKey])} onChange={(event) => updateChannelContact({ [urlKey]: event.target.value })} placeholder={key === 'live' ? 'https://... 또는 /상담경로' : 'https://...'} /></div>; })}</div>}</fieldset>
        <label className="wide">채널 소개<textarea rows={3} maxLength={500} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        <fieldset className="channel-status-choice"><legend>상태</legend><div>{[["draft", "초안"], ["active", "공개"], ["inactive", "숨김"]].map(([value, label]) => <button type="button" key={value} className={draft.status === value ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, status: value }))}>{label}</button>)}</div></fieldset>
        <label>노출 순서<input type="number" min="0" max="10000" value={draft.sort_order} onChange={(event) => setDraft((current) => ({ ...current, sort_order: Number(event.target.value) }))} /></label>
        {isSupervisor && <fieldset className="channel-showcase-choice wide"><legend>‘다른 채널도 만나보세요’ 노출</legend><div><button type="button" className={draft.showcase_visible ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, showcase_visible: true }))}>추천 영역에 표시</button><button type="button" className={!draft.showcase_visible ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, showcase_visible: false }))}>추천 영역에서 숨김</button><label>추천 순서<input type="number" min="0" max="10000" value={draft.showcase_order} onChange={(event) => setDraft((current) => ({ ...current, showcase_order: Number(event.target.value) }))} /></label></div><small>최고 관리자만 변경할 수 있습니다. 숫자가 작을수록 먼저 나오며, 현재 보고 있는 채널은 자동으로 제외됩니다.</small></fieldset>}
      </div>}
      {editorScope === "catalog" && <div className="channel-catalog-workspace category-first-workspace">
        {/* 이전 상품 우선 화면의 검색어: 전체 상품에서 채널 상품 가져오기, 현재 채널 상품, 채널 상품 카테고리, 채널 표시 이름. */}
        <section className="channel-catalog-box channel-category-builder"><header><span>01</span><div><strong>채널 카테고리 만들기</strong><p>고객에게 보여줄 진열 분류를 먼저 만드세요. 같은 상품을 여러 카테고리에 넣을 수 있습니다.</p></div></header>
          <div className="channel-category-add"><select value={newCategoryParent} onChange={(event) => setNewCategoryParent(event.target.value)} aria-label="카테고리 단계 선택"><option value="">대메뉴로 만들기</option>{channelCategoryRows.filter((entry) => !entry.parentSourceName).map((entry) => <option key={entry.sourceName} value={entry.sourceName}>{entry.label} 아래 2단계로 만들기</option>)}</select><input value={newCategoryName} maxLength={40} onChange={(event) => setNewCategoryName(event.target.value)} placeholder={newCategoryParent ? "하위 메뉴 이름" : "예: 스니커즈, 러닝화, 브랜드"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addChannelCategory(); } }} /><button type="button" className="admin-primary" onClick={addChannelCategory}>+ 카테고리 만들기</button></div>
          {!channelCategoryRows.length && <p className="channel-product-empty">아직 채널 카테고리가 없습니다. 카테고리를 먼저 만들어 주세요.</p>}
          {!!channelCategoryRows.length && <div className="channel-category-cards">{channelCategoryRows.filter((entry) => !entry.parentSourceName).sort((a, b) => a.sortOrder - b.sortOrder).map((entry) => <div className="channel-category-family" key={entry.sourceName}>{categoryCard(entry)}{channelCategoryRows.filter((child) => child.parentSourceName === entry.sourceName).sort((a, b) => a.sortOrder - b.sortOrder).map((child) => categoryCard(child, true))}</div>)}</div>}
        </section>

        <section className="channel-catalog-box channel-product-picker"><header><span>02</span><div><strong>{activeCategory ? `${activeCategory.label}에 상품 가져오기` : "상품을 가져올 카테고리를 선택하세요"}</strong><p>상품명·품번·브랜드와 전체 쇼핑몰 분류로 수천 개 상품을 빠르게 좁힌 뒤 한꺼번에 연결할 수 있습니다.</p></div></header>
          {!activeCategory ? <p className="channel-product-empty">위에서 카테고리를 선택하면 연결 조건을 설정할 수 있습니다.</p> : !isCuratedCategory(activeCategory) ? <div className="channel-auto-rule-panel"><div><strong>{isBrandCategory(activeCategory) ? "브랜드·상품군 자동 연결" : "상품 분류 자동 연결"}</strong><p>{isBrandCategory(activeCategory) ? "상품군과 브랜드가 모두 일치하는 현재 상품과 앞으로 추가되는 상품만 자동으로 나타납니다." : "조건에 맞는 현재 상품과 앞으로 추가되는 상품이 이 메뉴에 자동으로 나타납니다."}</p></div>{isBrandCategory(activeCategory) && <label>연결할 상품군<select value={brandRuleCategory(activeCategory)} onChange={(event) => updateCategorySetting(activeCategory.sourceName, { ruleCategory: event.target.value || undefined, productIds: [] })}><option value="">상품군을 선택하세요</option>{globalCategoryConfig.categories.map((category) => <option value={category.name} key={category.id}>{category.name}</option>)}</select></label>}<label>{isBrandCategory(activeCategory) ? "연결할 브랜드" : "연결할 공식 분류"}<select value={automaticRule(activeCategory).value} onChange={(event) => updateCategorySetting(activeCategory.sourceName, { assignmentMode: "auto", ruleType: isBrandCategory(activeCategory) ? "brand" : "category", ruleValue: event.target.value, productIds: [] })}><option value="">조건을 선택하세요</option>{isBrandCategory(activeCategory) ? productBrands.map((brand) => <option value={brand} key={brand}>{brand}</option>) : categoryNames.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><p className="channel-catalog-notice">현재 조건으로 상품 <b>{automaticIdsFor(activeCategory).length.toLocaleString("ko-KR")}</b>개가 자동 연결됩니다.{isBrandCategory(activeCategory) && !brandRuleCategory(activeCategory) ? " 먼저 상품군을 선택해 주세요." : ""}</p></div> : <><div className="channel-manual-rule-guide"><strong>직접 고르는 진열 메뉴</strong><p>추천상품·한정판·협업 메뉴만 아래 검색 결과에서 직접 상품을 선택합니다.</p></div><div className="channel-product-tools"><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductPickerPage(1); }} placeholder="상품명·품번 검색" /><select value={productBrandFilter} onChange={(event) => { setProductBrandFilter(event.target.value); setProductPickerPage(1); }} aria-label="브랜드 선택"><option value="전체">전체 브랜드</option>{productBrands.map((brand) => <option value={brand} key={brand}>{brand}</option>)}</select><select value={productCategoryFilter} onChange={(event) => { setProductCategoryFilter(event.target.value); setProductPickerPage(1); }} aria-label="전체 상품 카테고리 선택"><option value="전체">전체 분류</option>{globalCategoryConfig.categories.map((category) => <option value={category.name} key={category.name}>{category.name}</option>)}</select></div>
            <div className="channel-product-result-summary"><span>검색 결과 <b>{filteredPickerProducts.length.toLocaleString("ko-KR")}</b>개 · {productPickerPage}/{pickerTotalPages}페이지</span><div><button type="button" onClick={addCurrentPickerPage}>현재 페이지 모두 가져오기</button><button type="button" className="admin-primary" disabled={!filteredPickerProducts.length} onClick={addAllFilteredProducts}>검색 결과 전체 가져오기</button></div></div>
            {catalogNotice && <p className="channel-catalog-notice" role="status">{catalogNotice}</p>}
            <div className="channel-product-results">{matchingProducts.map((product) => { const selected = (activeCategory.productIds || []).includes(Number(product.id)); return <label key={product.id} className={selected ? "selected" : ""}><input type="checkbox" checked={selected} onChange={() => toggleProduct(Number(product.id))} /><SafeProductImage src={product.image_url} alt="" /><span><strong>{product.name}</strong><small>{product.style_number || product.product_code || "품번 없음"} · {product.brand || "브랜드 미지정"}</small></span><b>{selected ? "가져옴" : "가져오기"}</b></label>; })}</div>
            {!matchingProducts.length && <p className="channel-product-empty">조건에 맞는 전체 상품이 없습니다.</p>}
            <nav className="channel-product-pagination" aria-label="전체 상품 페이지"><button type="button" disabled={productPickerPage <= 1} onClick={() => setProductPickerPage((page) => Math.max(1, page - 1))}>← 이전</button><span>{productPickerPage} / {pickerTotalPages}</span><button type="button" disabled={productPickerPage >= pickerTotalPages} onClick={() => setProductPickerPage((page) => Math.min(pickerTotalPages, page + 1))}>다음 →</button></nav></>}
        </section>

        <section className="channel-catalog-box channel-selected-box"><header><span>03</span><div><strong>미분류 채널 상품</strong><p>기존에 연결했지만 새 채널 카테고리에 아직 넣지 않은 상품입니다. 상품은 삭제되지 않으며 위 카테고리에 다시 배치할 수 있습니다.</p></div></header>
          {!!uncategorizedProductIds.length ? <div className="channel-selected-products">{uncategorizedProductIds.map((id) => { const product = products.find((item) => Number(item.id) === id); return product ? <span key={id}>{product.name}</span> : null; })}</div> : <p className="channel-product-empty">모든 채널 상품이 카테고리에 정리되었습니다.</p>}
        </section>
      </div>}
      <div className="editor-actions">{!selectedOnly && <button type="button" onClick={() => { setEditing(false); onDone?.(); }}>취소</button>}{editorScope === "basic" && draft.id && <button type="button" className="danger" onClick={deleteCurrentChannel}>채널 삭제</button>}<button className="admin-primary">{!selectedOnly && !draft.id ? "채널 추가하기" : editorScope === "catalog" ? "상품·카테고리 저장" : "기본정보 저장"}</button></div>
    </form>}
  </section>;
}

function Dashboard({ data, pointName, setSection, visibleKeys }: { data: AdminData; pointName: string; setSection: (key: string) => void; visibleKeys: Set<string> }) {
  const maxOrders = Math.max(...data.products.map((item) => Number(item.sales_count)), 1);
  return (
    <div className="dashboard-content">
      <section className="welcome-admin">
        <div><span>오늘의 운영 현황</span><h2>{data.admin.name}님, 반갑습니다.</h2><p>처리해야 할 주문과 회원 리워드 현황을 확인해 주세요.</p></div>
        <div><strong>{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</strong><span>{new Date().toLocaleDateString("ko-KR", { weekday: "long" })}</span></div>
      </section>
      <section className="metric-grid">
        {[
          ["회원", data.summary.members, "명", "members", "♙"],
          ["판매 상품", data.summary.activeProducts, "개", "products", "□"],
          ["신규 주문", data.summary.pendingOrders, "건", "orders", "▤"],
          ["리워드 회원", data.summary.members, "명", "rewards", "R"],
        ].filter(([, , , key]) => visibleKeys.has(String(key))).map(([label, value, unit, key, icon]) => (
          <button key={String(key)} onClick={() => setSection(String(key))}>
            <span className="metric-icon">{icon}</span>
            <p>{label}</p><strong>{fmt(value as number)}<em>{unit}</em></strong><small>자세히 보기 →</small>
          </button>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="dashboard-card sales-card">
          <header><div><span>누적 리워드 주문</span><h3>{fmt(data.summary.totalOrderPoints)} <em>{pointName}</em></h3></div><button onClick={() => setSection("orders")}>전체 주문</button></header>
          <div className="bar-chart">
            {data.products.slice(0, 6).reverse().map((item, index) => (
              <div key={item.id}><span style={{ height: `${Math.max(12, Number(item.sales_count) / maxOrders * 100)}%` }} /><small>{["월", "화", "수", "목", "금", "토"][index]}</small></div>
            ))}
          </div>
        </article>
        <article className="dashboard-card point-overview">
          <header><div><span>현재 회원 보유 리워드</span><h3>{fmt(data.summary.issuedPoints)} <em>{pointName}</em></h3></div></header>
          <div className="donut" style={{ "--value": `${Math.min(90, 40 + data.summary.members * 5)}%` } as React.CSSProperties}><span><strong>{data.summary.members}</strong><small>members</small></span></div>
          <p><span>정상 회원</span><strong>{data.members.filter((item) => item.status === "active").length}명</strong></p>
          <p><span>계정 구분</span><strong>{data.admin.isSupervisor ? "슈퍼바이저" : "관리자"}</strong></p>
        </article>
      </section>
      <section className="dashboard-grid bottom">
        <article className="dashboard-card recent-orders">
          <header><h3>최근 주문</h3><button onClick={() => setSection("orders")}>전체 보기</button></header>
          {data.orders.slice(0, 5).map((order) => (
            <div key={order.id}><span className={`table-status ${order.status}`}>{order.status}</span><p><strong>{order.items}</strong><small>{order.member_name} · {date(order.created_at)}</small></p><b>{fmt(order.total_points)}</b></div>
          ))}
          {!data.orders.length && <div className="table-empty">아직 주문이 없습니다.</div>}
        </article>
        <article className="dashboard-card low-stock">
          <header><h3>재고 알림</h3><button onClick={() => setSection("products")}>상품 관리</button></header>
          {data.products.sort((a, b) => Number(a.stock) - Number(b.stock)).slice(0, 5).map((product) => (
            <div key={product.id}><SafeProductImage src={product.image_url} alt={product.name} /><p><strong>{product.name}</strong><small>{product.category}</small></p><b className={Number(product.stock) < 10 ? "danger" : ""}>{product.stock}개</b></div>
          ))}
        </article>
      </section>
    </div>
  );
}

function TableShell({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="admin-table-card"><header><div><h2>{title}</h2><span>총 {count}건</span></div>{action}</header>{children}</section>;
}

function AdminPager({ page, totalPages, pageSize, move, resize }: { page: number; totalPages: number; pageSize: number; move: (page: number) => void; resize: (size: number) => void }) {
  const pageNumbers = Array.from(new Set([
    1,
    page - 2,
    page - 1,
    page,
    page + 1,
    page + 2,
    totalPages,
  ].filter((value) => value >= 1 && value <= totalPages))).sort((a, b) => a - b);
  return (
    <nav className="admin-pagination" aria-label="관리 목록 페이지">
      <label>한 페이지 <select aria-label="한 페이지 표시 개수" value={pageSize} onChange={(event) => resize(Number(event.target.value))}><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></label>
      <div className="admin-page-numbers">
        {pageNumbers.map((pageNumber, index) => <span key={pageNumber}>{index > 0 && pageNumber - pageNumbers[index - 1] > 1 && <i>…</i>}<button className={pageNumber === page ? "active" : ""} aria-current={pageNumber === page ? "page" : undefined} onClick={() => move(pageNumber)}>{pageNumber}</button></span>)}
      </div>
      <span>총 {totalPages}페이지</span>
    </nav>
  );
}

function Products({ rows, total, query, setQuery, act, edit, create, configure }: any) {
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkMode, setBulkMode] = useState<"none" | "partial" | "full">("partial");
  const [bulkPercent, setBulkPercent] = useState(50);
  const [bulkCash, setBulkCash] = useState(true);
  const [bulkCashReward, setBulkCashReward] = useState(true);
  const pageIds = rows.map((item: any) => Number(item.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id: number) => selected.includes(id));
  useEffect(() => {
    setSelected((current) => current.filter((id) => pageIds.includes(id)));
  }, [pageIds.join(",")]);
  async function bulkStatus(status: "active" | "inactive") {
    if (await act({ action: "product.bulk_status", ids: selected, status }, "선택 상품의 판매 상태를 변경했습니다.")) {
      setSelected([]);
    }
  }
  async function bulkPaymentPolicy() {
    const percent = bulkMode === "none" ? 0 : bulkMode === "full" ? 100 : Math.max(1, Math.min(99, bulkPercent));
    if (await act({
      action: "product.bulk_payment_policy",
      ids: selected,
      pointUsageMode: bulkMode,
      pointMaxPercent: percent,
      cashPaymentEnabled: bulkCash,
      rewardOnCashOnly: bulkCashReward,
    }, "선택 상품의 리워드·결제 정책을 변경했습니다.")) setSelected([]);
  }
  async function bulkDelete() {
    if (!selected.length) return;
    if (!confirm(`현재 페이지에서 선택한 상품 ${selected.length}개만 삭제합니다. 계속하시겠습니까?`)) return;
    if (await act({ action: "product.bulk_delete", ids: selected }, `선택한 상품 ${selected.length}개를 삭제했습니다.`)) {
      setSelected([]);
    }
  }
  function policyLabel(item: any) {
    const mode = String(item.point_usage_mode || "full");
    if (mode === "none") return "리워드 불가";
    if (mode === "full") return "리워드 100%";
    return `리워드 ${Number(item.point_max_percent || 0)}%`;
  }
  return (
    <TableShell title="상품 목록" count={total} action={<div className="table-tools product-table-tools"><label className="product-list-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명·품번·상품코드 검색" aria-label="상품 검색" />{query && <button type="button" onClick={() => setQuery("")} aria-label="상품 검색어 지우기">×</button>}</label><button onClick={configure}>분류·브랜드 설정</button><button className="admin-primary" onClick={create}>+ 상품 등록</button></div>}>
      {selected.length > 0 && <div className="bulk-toolbar product-policy-bulk"><span>현재 페이지 {selected.length}개 선택</span><button onClick={() => bulkStatus("active")}>판매 시작</button><button onClick={() => bulkStatus("inactive")}>판매 중지</button><select aria-label="리워드 사용 범위" value={bulkMode} onChange={(event) => { const mode = event.target.value as "none" | "partial" | "full"; setBulkMode(mode); if (mode === "none") setBulkCash(true); if (mode === "full") setBulkPercent(100); }}><option value="none">리워드 불가</option><option value="partial">일부 사용</option><option value="full">전액 사용</option></select>{bulkMode === "partial" && <label>최대 <input aria-label="리워드 최대 사용률" type="number" min="1" max="99" value={bulkPercent} onChange={(event) => setBulkPercent(Number(event.target.value || 1))} />%</label>}<label><input type="checkbox" checked={bulkCash} onChange={(event) => { setBulkCash(event.target.checked); if (!event.target.checked) { setBulkMode("full"); setBulkPercent(100); } }} /> 현금 허용</label><label><input type="checkbox" checked={bulkCashReward} onChange={(event) => setBulkCashReward(event.target.checked)} /> 리워드 사용분 적립 제외</label><button className="admin-primary" onClick={bulkPaymentPolicy}>정책 적용</button><button className="danger" onClick={bulkDelete}>선택 상품 삭제</button><button onClick={() => setSelected([])}>선택 해제</button></div>}
      <div className="table-scroll"><table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelected((current) => allSelected ? current.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...current, ...pageIds])))} aria-label="현재 페이지 상품 전체 선택" /></th><th>상품</th><th>분류·브랜드</th><th>판매가</th><th>리워드 정책</th><th>재고</th><th>판매량</th><th>상태</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td><input type="checkbox" checked={selected.includes(Number(item.id))} onChange={() => setSelected((current) => current.includes(Number(item.id)) ? current.filter((id) => id !== Number(item.id)) : [...current, Number(item.id)])} aria-label={`${item.name} 선택`} /></td><td><div className="product-cell"><SafeProductImage src={item.image_url} alt={item.name} /><span><strong>{item.name || "상품명 미입력"}</strong><small>{item.style_number ? `품번 ${item.style_number}` : item.product_code ? `상품코드 ${item.product_code}` : "상품 정보를 작성 중입니다."}</small></span></div></td><td><strong>{item.category}{item.subcategory ? ` › ${item.subcategory}` : ""}</strong><small className="block">{item.brand || "브랜드 미지정"}</small></td><td><b>{fmt(item.point_price)}</b>원</td><td><div className="payment-policy-summary"><strong className={String(item.point_usage_mode) === "none" ? "disabled" : ""}>{policyLabel(item)}</strong><small>{Boolean(item.cash_payment_enabled) ? "현금·혼합 가능" : "리워드 전용"}</small><small>{Boolean(item.reward_on_cash_only) ? "현금 결제액만 적립" : "전체 금액 적립"}</small></div></td><td className={Number(item.stock) < 10 ? "danger-text" : ""}>{item.stock}</td><td>{item.sales_count}</td><td><div className="product-admin-status"><span className={`product-status-badge ${item.status}`}>{item.status === "active" ? "판매 중" : item.status === "draft" ? "임시저장" : "판매 중지"}</span><button aria-label={`${item.name || "상품"} 판매 상태 변경`} className={`switch ${item.status === "active" ? "on" : ""}`} onClick={() => act({ action: "product.status", id: item.id, status: item.status === "active" ? "inactive" : "active" }, "판매 상태를 변경했습니다.")}><span /></button></div></td><td><div className="row-actions"><button onClick={() => edit(item)}>수정</button><button className="danger" onClick={() => confirm(`'${item.name || "이 상품"}' 1개만 삭제합니다. 계속하시겠습니까?`) && act({ action: "product.delete", id: item.id }, "상품 1개를 삭제했습니다.")}>1개 삭제</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Members({ rows, total, pointName, act, edit, create, point, canManagePoints }: any) {
  const [selected, setSelected] = useState<number[]>([]);
  const pageIds = rows.map((item: any) => Number(item.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id: number) => selected.includes(id));
  async function bulkStatus(status: "active" | "suspended") {
    if (await act({ action: "member.bulk_status", ids: selected, status }, "선택 회원의 이용 상태를 변경했습니다.")) {
      setSelected([]);
    }
  }
  return (
    <TableShell title="회원 목록" count={total} action={<button className="admin-primary" onClick={create}>+ 회원 등록</button>}>
      {selected.length > 0 && <div className="bulk-toolbar"><span>{selected.length}명 선택</span><button onClick={() => bulkStatus("active")}>이용 허용</button><button onClick={() => bulkStatus("suspended")}>이용 정지</button><button onClick={() => setSelected([])}>선택 해제</button></div>}
      <div className="table-scroll"><table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelected((current) => allSelected ? current.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...current, ...pageIds])))} aria-label="현재 페이지 회원 전체 선택" /></th><th>회원</th><th>등급</th><th>보유 리워드</th><th>주문</th><th>가입일</th><th>상태</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id} className={item.test_scenario ? "test-data-row" : ""}><td><input type="checkbox" checked={selected.includes(Number(item.id))} onChange={() => setSelected((current) => current.includes(Number(item.id)) ? current.filter((id) => id !== Number(item.id)) : [...current, Number(item.id)])} aria-label={`${item.name} 선택`} /></td><td><div className="member-cell"><span>{item.name.slice(0, 1)}</span><p><strong>{item.name} {item.test_scenario && <em className="test-badge">TEST</em>} {item.reset_requested_at && <em className="reset-badge">비밀번호 재설정 요청</em>}</strong><small>{item.email}</small>{item.test_scenario && <small className="test-scenario">{item.test_scenario}</small>}</p></div></td><td><span className="role-badge member">일반회원</span></td><td><b>{fmt(item.points)}</b> {pointName}</td><td>{item.order_count}건</td><td>{date(item.joined_at)}</td><td><button className={`switch ${item.status === "active" ? "on" : ""}`} onClick={() => act({ action: "member.status", id: item.id, status: item.status === "active" ? "suspended" : "active" }, "회원 상태를 변경했습니다.")}><span /></button></td><td><div className="row-actions">{canManagePoints && <button onClick={() => point(item)}>리워드</button>}<button onClick={() => edit(item)}>{item.reset_requested_at ? "비밀번호 재설정" : "수정"}</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Points({ rows, total, pointName }: any) {
  return (
    <TableShell title="전체 리워드 변동 내역" count={total}>
      <div className="table-scroll"><table><thead><tr><th>일시</th><th>회원</th><th>구분</th><th>변동</th><th>잔액</th><th>내용</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("ko-KR")}</td><td><strong>{item.member_name}</strong><small className="block">{item.member_email}</small></td><td><span className={`point-type ${Number(item.amount) > 0 ? "plus" : "minus"}`}>{String(item.type).replaceAll("포인트", "리워드")}</span></td><td className={Number(item.amount) > 0 ? "plus-text" : "danger-text"}><b>{Number(item.amount) > 0 ? "+" : ""}{fmt(item.amount)}</b></td><td>{fmt(item.balance_after)} {pointName}</td><td>{String(item.memo).replaceAll("포인트", "리워드")}</td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Rewards({ data, rows, total, pointName, act }: any) {
  const settings = data.settings || {};
  const pending = data.rewardEvents.filter((item: any) => item.status === "pending");
  const confirmed = data.rewardEvents.filter((item: any) => item.status === "confirmed");
  const canceled = data.rewardEvents.filter((item: any) => item.status === "revoked");
  const rewardCost = confirmed.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
  const referredOrderPoints = data.orders
    .filter((order: any) => rows.some((referral: any) => Number(referral.first_order_id) === Number(order.id)))
    .reduce((sum: number, order: any) => sum + Number(order.total_points), 0);
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act({
      action: "settings.save",
      values: Object.fromEntries(form.entries()),
    }, "리워드 보상조건을 저장했습니다.");
  }
  return (
    <div className="admin-reward-page">
      <Points rows={data.pointLogs} total={data.pointLogs.length} pointName={pointName} />
      <section className="admin-stat-grid reward-admin-stats">
        <article><span>추천 가입</span><strong>{fmt(total)}</strong><small>명</small></article>
        <article><span>지급 예정</span><strong>{fmt(pending.reduce((sum: number, item: any) => sum + Number(item.amount), 0))}</strong><small>{pointName}</small></article>
        <article><span>누적 지급</span><strong>{fmt(rewardCost)}</strong><small>{pointName}</small></article>
        <article><span>추천 주문액</span><strong>{fmt(referredOrderPoints)}</strong><small>{pointName}</small></article>
      </section>
      <form className="admin-reward-policy" onSubmit={savePolicy}>
        <header><div><span>REWARD POLICY</span><h2>추천 보상조건</h2></div><p>규칙 변경 전 발생한 추천에는 가입 당시 조건이 그대로 보관됩니다.</p></header>
        <div className="settings-grid">
          <label>추천 기능<select name="referral_enabled" defaultValue={settings.referral_enabled === "false" ? "false" : "true"}><option value="true">사용</option><option value="false">사용 안 함</option></select></label>
          <label>가입 인증 보상<input name="referral_join_reward" type="number" min="0" defaultValue={settings.referral_join_reward ?? 500} /></label>
          <label>추천인 첫 구매 보상<input name="referral_first_order_inviter_reward" type="number" min="0" defaultValue={settings.referral_first_order_inviter_reward ?? 1000} /></label>
          <label>신규회원 첫 구매 보상<input name="referral_first_order_friend_reward" type="number" min="0" defaultValue={settings.referral_first_order_friend_reward ?? 1000} /></label>
          <label>최소 구매금액<input name="referral_min_order_points" type="number" defaultValue={settings.referral_min_order_points || 30000} /></label>
          <label>적립 보류기간(일)<input name="referral_hold_days" type="number" defaultValue={settings.referral_hold_days || 7} /></label>
          <label>추천정보 보관(일)<input name="referral_cookie_days" type="number" defaultValue={settings.referral_cookie_days || 30} /></label>
          <label>추천인 월 한도<input name="referral_monthly_cap" type="number" defaultValue={settings.referral_monthly_cap || 30000} /></label>
          <label>리워드 유효기간(일)<input name="referral_reward_expiry_days" type="number" defaultValue={settings.referral_reward_expiry_days || 365} /></label>
        </div>
        <button className="admin-primary">보상조건 저장</button>
      </form>
      <TableShell title="추천회원 진행 현황" count={total}>
        <div className="table-scroll"><table><thead><tr><th>가입일</th><th>추천회원</th><th>가입한 친구</th><th>진행상태</th><th>첫 구매</th><th>지급 예정일·사유</th><th>인증</th></tr></thead><tbody>
          {rows.map((item: any) => <tr key={item.id}>
            <td>{date(item.joined_at)}</td>
            <td><strong>{item.inviter_name}</strong><small className="block">{item.inviter_email}</small></td>
            <td><strong>{item.invitee_name}</strong><small className="block">{item.invitee_email}</small></td>
            <td><span className={`table-status ${item.status}`}>{item.status}</span></td>
            <td>{item.first_order_id ? `주문 #${item.first_order_id}` : "대기"}</td>
            <td>{item.hold_reason || (item.eligible_at ? date(item.eligible_at) : "-")}</td>
            <td><button disabled={Boolean(item.verified_at)} onClick={() => act({ action: "reward.verify_member", memberId: item.invitee_id }, "이메일·휴대전화 인증을 완료했습니다.")}>{item.verified_at ? "인증완료" : "인증 확인"}</button></td>
          </tr>)}
        </tbody></table></div>
      </TableShell>
      {data.referralFlags.length > 0 && (
        <TableShell title="의심 추천 검토" count={data.referralFlags.length}>
          <div className="table-scroll"><table><thead><tr><th>감지일</th><th>추천번호</th><th>감지 사유</th><th>상태</th><th>수동 처리</th></tr></thead><tbody>
            {data.referralFlags.map((flag: any) => <tr key={flag.id}>
              <td>{date(flag.created_at)}</td><td>#{flag.referral_id}</td><td>{flag.reasons}</td><td>{flag.status}</td>
              <td><div className="row-actions"><button disabled={flag.status !== "검토중"} onClick={() => act({ action: "reward.resolve_flag", flagId: flag.id, decision: "approved" }, "의심 추천을 승인했습니다.")}>승인</button><button className="danger" disabled={flag.status !== "검토중"} onClick={() => act({ action: "reward.resolve_flag", flagId: flag.id, decision: "blocked" }, "의심 추천을 차단했습니다.")}>차단</button></div></td>
            </tr>)}
          </tbody></table></div>
        </TableShell>
      )}
      <section className="admin-reward-summary-line"><span>확정 {confirmed.length}건</span><span>대기 {pending.length}건</span><span>취소·회수 {canceled.length}건</span><span>의심 추천 {data.referralFlags.length}건</span></section>
    </div>
  );
}

function Orders({ rows, total, act, shipping }: any) {
  const awaitingCash = (item: any) => ["awaiting_cash", "awaiting_kakao"].includes(String(item.payment_status));
  const paymentLabel = (item: any) => {
    if (item.payment_method === "points") return "리워드 전액";
    const channel = String(item.cash_payment_channel || (item.payment_method === "kakao" ? "kakao_transfer" : "bank_transfer"));
    const cash = channel === "kakao_transfer" ? "카카오톡 송금" : "무통장입금";
    return item.payment_method === "mixed" ? `리워드+${cash}` : cash;
  };
  return (
    <TableShell title="주문·배송 목록" count={total}>
      <div className="table-scroll"><table><thead><tr><th>주문번호</th><th>회원 / 상품</th><th>결제</th><th>배송지</th><th>배송 정보</th><th>주문일</th><th>상태</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td><strong>{item.order_no}</strong></td><td><div className="order-cell"><strong>{item.member_name}</strong><span>{item.items}</span></div></td><td><div className="shipping-cell"><strong>{paymentLabel(item)}</strong><small>{fmt(Number(item.used_charge_points || 0) + Number(item.used_reward_points || 0))}P · {fmt(item.cash_amount || 0)}원</small></div></td><td><span className="ellipsis" title={`${item.recipient} ${item.phone} ${item.address}`}>{item.recipient} · {item.address}<small>통관 {item.customs_code_masked || "미입력"}</small></span></td><td><div className="shipping-cell"><strong>{item.courier || "미등록"}</strong><small>{item.tracking_no || item.international_tracking_no || "운송장 대기"}</small></div></td><td>{date(item.created_at)}</td><td><select className={`status-select ${item.status}`} value={item.status} disabled={["취소", "반품완료"].includes(item.status)} onChange={(event) => { const next = event.target.value; if (["취소", "반품완료"].includes(next) && !confirm(`${next} 처리하면 사용 리워드는 종류대로 복원되고 현금 결제분은 별도 환불 안내가 필요합니다. 계속하시겠습니까?`)) return; act({ action: "order.status", id: item.id, status: next }, "주문 상태를 변경했습니다."); }}>{["결제확인대기", "취소요청", "접수", "상품준비", "해외배송중", "통관중", "국내배송중", "배송완료", "반품요청", "취소", "반품완료"].map((status) => <option key={status}>{status}</option>)}</select></td><td><div className="row-actions">{awaitingCash(item) && <button className="approve" onClick={() => confirm(`${paymentLabel(item)} 입금을 실제로 확인했습니다. 예약 리워드를 차감하고 결제완료 처리할까요?`) && act({ action: "order.payment_confirm", id: item.id }, "입금을 확인하고 상품준비로 변경했습니다.")}>입금 확인</button>}<button onClick={() => shipping(item)} disabled={awaitingCash(item) || ["취소", "취소요청", "반품완료"].includes(item.status)}>배송 등록</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Reviews({ rows, total, act, reply }: any) {
  return (
    <TableShell title="상품 후기 목록" count={total}>
      <div className="review-admin-guide">배송완료 주문상품과 연결된 구매후기입니다. 삭제 시 이미 지급된 후기 리워드도 자동 회수됩니다.</div>
      <div className="table-scroll"><table><thead><tr><th>상품 / 회원</th><th>주문</th><th>평점</th><th>후기 내용</th><th>적립</th><th>작성일</th><th>노출</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td><strong>{item.product_name}</strong><small className="block">{item.member_name} · {item.member_email}</small></td><td><strong>{item.order_no || "기존 후기"}</strong><small className="block">{cartOptionLabel(item.selected_options) || "옵션 정보 없음"}</small></td><td><span className="stars">{"★".repeat(item.rating)}</span></td><td><div className="review-cell"><strong>{item.title}</strong><span>{item.content}</span>{item.admin_reply && <small>답변: {item.admin_reply}</small>}</div></td><td><span className={`reward-status ${item.reward_status}`}>{item.reward_status === "회수" ? "회수" : `+${fmt(item.reward_points || 0)}`}</span></td><td>{date(item.created_at)}</td><td>{item.deleted_at ? <span className="request-status 반려">삭제</span> : <button className={`switch ${item.visible ? "on" : ""}`} onClick={() => act({ action: "review.visible", id: item.id, visible: !item.visible }, "후기 노출 상태를 변경했습니다.")}><span /></button>}</td><td><div className="row-actions"><button onClick={() => reply(item)} disabled={Boolean(item.deleted_at)}>{item.admin_reply ? "답변 수정" : "답변"}</button><button className="danger" disabled={Boolean(item.deleted_at)} onClick={() => confirm("후기를 삭제하면 노출이 중지되고 지급한 후기 포인트가 회수됩니다. 계속하시겠습니까?") && act({ action: "review.delete", id: item.id, reason: "관리자 삭제" }, "후기를 삭제하고 적립 포인트를 회수했습니다.")}>삭제</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Notices({ rows, total, act, edit, create }: any) {
  return (
    <TableShell title="공지사항 목록" count={total} action={<button className="admin-primary" onClick={create}>+ 공지 등록</button>}>
      <div className="table-scroll"><table><thead><tr><th>제목</th><th>내용</th><th>등록일</th><th>노출</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td><strong>{item.title}</strong></td><td><span className="ellipsis" title={item.content}>{item.content}</span></td><td>{date(item.created_at)}</td><td><button className={`switch ${item.active ? "on" : ""}`} onClick={() => act({ action: "notice.active", id: item.id, active: !item.active }, "공지 노출 상태를 변경했습니다.")}><span /></button></td><td><div className="row-actions"><button onClick={() => edit(item)}>수정</button><button className="danger" onClick={() => confirm("공지를 삭제하시겠습니까?") && act({ action: "notice.delete", id: item.id }, "공지를 삭제했습니다.")}>삭제</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Coupons({ rows, total, pointName, act, create }: any) {
  return (
    <TableShell title="쿠폰 관리" count={total} action={<button className="admin-primary" onClick={create}>+ 쿠폰 일괄 생성</button>}>
      <div className="table-scroll"><table><thead><tr><th>쿠폰 코드</th><th>쿠폰명</th><th>혜택</th><th>상태</th><th>사용 회원</th><th>만료일</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td><strong className="coupon-code">{item.code}</strong></td><td>{item.name}<small className="block">{item.coupon_type === "discount" ? "할인쿠폰" : "리워드 쿠폰"}</small></td><td>{item.coupon_type === "discount" ? <><b>{item.discount_kind === "percent" ? `${fmt(item.discount_value)}%` : `${fmt(item.discount_value)}원`}</b><small className="block">{item.target_category || "전체"} · {fmt(item.minimum_order || 0)}원 이상</small></> : <><b>{fmt(item.point_amount)}</b> {pointName}</>}</td><td><span className={`request-status ${item.status}`}>{item.status}</span></td><td>{item.used_member_name ? <><strong>{item.used_member_name}</strong><small className="block">{item.used_member_email}</small></> : item.claimed_by ? "회원 보관 중" : "-"}</td><td>{item.expires_at ? date(item.expires_at) : "제한 없음"}</td><td>{item.status === "사용" ? "사용완료" : <button className={`switch ${item.status === "미사용" ? "on" : ""}`} onClick={() => act({ action: "coupon.status", id: item.id, status: item.status === "미사용" ? "중지" : "미사용" }, "쿠폰 상태를 변경했습니다.")}><span /></button>}</td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Inquiries({ rows, total, act, answer }: any) {
  return (
    <TableShell title="고객상담·쪽지 목록" count={total}>
      <div className="table-scroll"><table><thead><tr><th>접수일</th><th>회원</th><th>분류</th><th>문의</th><th>상태</th><th>관리</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td>{date(item.created_at)}</td><td><strong>{item.member_name}</strong><small className="block">{item.member_email}</small></td><td>{item.category}</td><td><div className="review-cell"><strong>{item.title}</strong><span>{item.content}</span>{item.answer && <small>답변: {item.answer}</small>}</div></td><td><span className={`request-status ${item.status}`}>{item.status}</span></td><td><div className="row-actions"><button className="approve" onClick={() => answer(item)}>{item.answer ? "답변 수정" : "답변"}</button><button className="danger" onClick={() => confirm("상담 기록을 삭제하시겠습니까?") && act({ action: "inquiry.delete", id: item.id }, "상담 기록을 삭제했습니다.")}>삭제</button></div></td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function AuditLogs({ rows, total }: any) {
  return (
    <TableShell title="관리자 운영 기록" count={total}>
      <div className="audit-guide">리워드·주문·회원·설정 변경 기록은 운영 투명성을 위해 삭제할 수 없습니다.</div>
      <div className="table-scroll"><table><thead><tr><th>일시</th><th>관리자</th><th>작업</th><th>대상</th></tr></thead><tbody>
        {rows.map((item: any) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("ko-KR")}</td><td><strong>{item.admin_name}</strong></td><td><span className="role-badge">{item.action}</span></td><td>{item.target || "-"}</td></tr>)}
      </tbody></table></div>
    </TableShell>
  );
}

function Popups({ rows, total, act, edit, create }: any) {
  return (
    <TableShell title="팝업 목록" count={total} action={<button className="admin-primary" onClick={create}>+ 팝업 등록</button>}>
      <div className="popup-admin-grid">
        {rows.map((item: any) => <article key={item.id}><div className="popup-preview" style={{ background: item.background_color }}><span>MEMBER BENEFIT</span><h3>{item.title}</h3><p>{item.content}</p><b>{item.button_text}</b></div><footer><div><strong>{item.active ? "노출 중" : "숨김"}</strong><small>{date(item.starts_at)} ~ {date(item.ends_at)}</small></div><button className={`switch ${item.active ? "on" : ""}`} onClick={() => act({ action: "popup.active", id: item.id, active: !item.active }, "팝업 노출 상태를 변경했습니다.")}><span /></button><button onClick={() => edit(item)}>수정</button><button className="text-danger" onClick={() => confirm("팝업을 삭제하시겠습니까?") && act({ action: "popup.delete", id: item.id }, "팝업을 삭제했습니다.")}>삭제</button></footer></article>)}
      </div>
    </TableShell>
  );
}

function AdminAccounts({ rows, total, act, edit, create }: any) {
  const orderedRows = [...rows].sort((left: any, right: any) => {
    if (left.role === right.role) return Number(right.id) - Number(left.id);
    return left.role === "supervisor" ? 1 : -1;
  });
  return (
    <div className="admin-account-section">
      <section className="admin-account-guide">
        <div>
          <span>EXTERNAL ADMIN ACCESS</span>
          <h2>관리자별 기능 권한을 설정하세요</h2>
          <p>
            직원은 ChatGPT 가입 없이 사이트 전용 아이디와 비밀번호로 로그인합니다.
            슈퍼바이저가 허용한 메뉴만 보이며, 허용되지 않은 요청은 서버에서도 차단됩니다.
          </p>
        </div>
        <a href="/admin/login" target="_blank" rel="noreferrer">
          관리자 로그인 화면 보기 ↗
        </a>
      </section>
      <TableShell
        title="관리자·슈퍼바이저 계정"
        count={total}
        action={
          <button className="admin-primary" onClick={create}>
            + 관리자 계정 발급
          </button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>관리자</th>
                <th>계정 구분</th>
                <th>아이디</th>
                <th>허용 기능</th>
                <th>비밀번호</th>
                <th>최근 로그인</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((item: any) => (
                <tr
                  key={item.id}
                  className={item.role === "supervisor" ? "supervisor-account-row" : ""}
                  onClick={item.role === "supervisor" ? () => edit(item) : undefined}
                  onKeyDown={item.role === "supervisor" ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      edit(item);
                    }
                  } : undefined}
                  tabIndex={item.role === "supervisor" ? 0 : undefined}
                  aria-label={item.role === "supervisor" ? "슈퍼바이저 정보 및 로그인 아이디·비밀번호 수정" : undefined}
                >
                  <td>
                    <div className="member-cell">
                      <span>{item.name.slice(0, 1)}</span>
                      <p><strong>{item.name}</strong><small>{item.role === "supervisor" ? "전체 운영 책임자" : "운영 관리자"}</small></p>
                    </div>
                  </td>
                  <td><span className={`role-badge ${item.role}`}>{item.role === "supervisor" ? "슈퍼바이저" : "관리자"}</span></td>
                  <td><strong>{item.username}</strong></td>
                  <td>
                    <span className="permission-summary">
                      {item.role === "supervisor"
                        ? "전체 기능"
                        : `${storedPermissions(item).length}개 기능`}
                    </span>
                  </td>
                  <td>
                    {item.force_password_change ? (
                      <span className="password-state pending">최초 변경 대기</span>
                    ) : (
                      <span className="password-state">변경 완료</span>
                    )}
                  </td>
                  <td>{item.last_login_at ? new Date(item.last_login_at).toLocaleString("ko-KR") : "-"}</td>
                  <td>
                    <button
                      className={`switch ${item.status === "active" ? "on" : ""}`}
                      disabled={item.role === "supervisor"}
                      onClick={() =>
                        act(
                          {
                            action: "admin_account.status",
                            id: item.id,
                            status: item.status === "active" ? "inactive" : "active",
                          },
                          "관리자 계정 상태를 변경했습니다.",
                        )
                      }
                      aria-label={`${item.name} 계정 상태 변경`}
                    >
                      <span />
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      {item.role === "supervisor" ? (
                        <button onClick={(event) => { event.stopPropagation(); edit(item); }}>정보·로그인 수정</button>
                      ) : <>
                        <button onClick={() => edit(item)}>수정·재발급</button>
                        <button
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (confirm("이 관리자 계정을 완전히 삭제하시겠습니까?")) {
                            void act(
                              { action: "admin_account.delete", id: item.id },
                              "관리자 계정을 삭제했습니다.",
                            );
                          }
                        }}
                      >
                        삭제
                      </button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="table-empty spacious">
              아직 발급한 직원 관리자 계정이 없습니다.
            </div>
          )}
        </div>
      </TableShell>
    </div>
  );
}

function MyAdminAccount({ row, edit }: any) {
  if (!row) {
    return (
      <div className="admin-account-section">
        <div className="table-empty spacious">
          현재 로그인한 관리자 계정을 확인하지 못했습니다.
        </div>
      </div>
    );
  }
  return (
    <div className="admin-account-section">
      <section className="admin-account-guide">
        <div>
          <span>MY ADMIN ACCOUNT</span>
          <h2>내 관리자 계정</h2>
          <p>
            일반 관리자는 본인 계정만 확인하고 이름을 수정할 수 있습니다.
            권한과 다른 관리자 계정은 슈퍼바이저만 관리합니다.
          </p>
        </div>
        <a href="/admin/change-password">내 비밀번호 변경 →</a>
      </section>
      <TableShell title="내 계정 정보" count={1}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>관리자 이름</th>
                <th>아이디</th>
                <th>계정 구분</th>
                <th>최근 로그인</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="member-cell">
                    <span>{row.name.slice(0, 1)}</span>
                    <p><strong>{row.name}</strong><small>현재 로그인 계정</small></p>
                  </div>
                </td>
                <td><strong>{row.username}</strong></td>
                <td><span className="role-badge manager">관리자</span></td>
                <td>{row.last_login_at ? new Date(row.last_login_at).toLocaleString("ko-KR") : "-"}</td>
                <td><span className="password-state">{row.status === "active" ? "사용 중" : "중지"}</span></td>
                <td><button onClick={() => edit(row)}>내 이름 수정</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}

function Settings({ settings, testData, act }: { settings: Record<string, string>; testData: AdminData["testData"]; act: (body: Record<string, unknown>, message?: string) => Promise<boolean> }) {
  const [values, setValues] = useState(settings);
  const [contactImageBusy, setContactImageBusy] = useState(false);
  const [contactImageError, setContactImageError] = useState("");
  const [contactImageNotice, setContactImageNotice] = useState("");
  function update(key: string, value: string) { setValues((current) => ({ ...current, [key]: value })); }
  async function uploadContactImage(file: File | undefined) {
    if (!file) return;
    setContactImageBusy(true);
    setContactImageError("");
    setContactImageNotice("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("JPG, PNG, WEBP 사진만 올릴 수 있습니다.");
      }
      if (file.size < 1 || file.size > 20 * 1024 * 1024) {
        throw new Error("사진 한 장은 20MB 이하여야 합니다.");
      }
      let uploadFile = file;
      if (file.size > 1400 * 1024) {
        if (!("createImageBitmap" in window)) {
          throw new Error("사진 용량이 큽니다. 2MB 이하 사진을 선택해 주세요.");
        }
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          bitmap.close();
          throw new Error("사진을 처리할 수 없는 브라우저입니다.");
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
        if (!blob || blob.size > 1900 * 1024) {
          throw new Error("사진 용량을 자동으로 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
        }
        uploadFile = new File([blob], "counselor.webp", { type: "image/webp" });
      }
      const form = new FormData();
      form.set("image", uploadFile);
      const response = await fetch("/api/contact-image", { method: "POST", body: form, credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "상담자 사진을 올리지 못했습니다.");
      update("contact_counselor_image_url", String(payload.url));
      setContactImageNotice("사진이 등록되어 즉시 저장되었습니다.");
    } catch (error) {
      setContactImageError(error instanceof Error ? error.message : "상담자 사진을 올리지 못했습니다.");
    } finally {
      setContactImageBusy(false);
    }
  }
  async function submit(event: FormEvent) { event.preventDefault(); await act({ action: "settings.save", values }, "기본 설정을 저장했습니다. 쇼핑몰에 즉시 반영됩니다."); }
  return (
    <form className="settings-layout" onSubmit={submit}>
      <section className="settings-card">
        <header><span>01</span><div><h2>브랜드 설정</h2><p>쇼핑몰과 브라우저 탭의 이름·로고를 변경합니다.</p></div></header>
        <div className="settings-fields">
          <label>브랜드명<input value={values.brand_name} onChange={(event) => update("brand_name", event.target.value)} /></label>
          <label>영문 브랜드명<input value={values.brand_english_name} onChange={(event) => update("brand_english_name", event.target.value)} /></label>
          <label className="wide">브랜드 보조 문구 <small>쇼핑몰 상단 브랜드명 아래에 표시됩니다.</small><input value={values.brand_tagline || ""} maxLength={40} placeholder="취향을 선물하는 리워드 셀렉트숍" onChange={(event) => update("brand_tagline", event.target.value)} /></label>
          <label>리워드 명칭<input value={values.point_name} onChange={(event) => update("point_name", event.target.value)} /></label>
          <label>로고 문자 <small>브라우저 탭 아이콘에도 적용됩니다.</small><input value={values.logo_text} maxLength={4} onChange={(event) => update("logo_text", event.target.value)} /></label>
          <label className="wide">로고 이미지 주소 <small>입력하면 쇼핑몰과 브라우저 탭에서 로고 문자를 대신합니다.</small><input value={values.logo_url} placeholder="https://..." onChange={(event) => update("logo_url", event.target.value)} /></label>
        </div>
      </section>
      <section className="settings-card">
        <header><span>02</span><div><h2>색상 설정</h2><p>쇼핑몰과 관리자 화면에 함께 적용됩니다.</p></div></header>
        <div className="color-fields">
          {[["primary_color", "기본색"], ["secondary_color", "강조색"], ["accent_color", "보조색"]].map(([key, label]) => <label key={key}><span>{label}</span><div><input type="color" value={values[key]} onChange={(event) => update(key, event.target.value)} /><input value={values[key]} onChange={(event) => update(key, event.target.value)} /></div></label>)}
        </div>
        <div className="brand-preview" style={{ background: values.primary_color }}><span style={{ background: values.secondary_color }}>{values.logo_text}</span><div><strong>{values.brand_name}</strong><small>{values.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div><button style={{ background: values.secondary_color }}>리워드로 주문</button></div>
      </section>
      <section className="settings-card">
        <header><span>03</span><div><h2>메인 화면 문구</h2><p>첫 화면의 핵심 문구와 고객센터를 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label className="wide">메인 제목<textarea value={values.hero_title} onChange={(event) => update("hero_title", event.target.value)} /></label>
          <label className="wide">메인 설명<textarea value={values.hero_subtitle} onChange={(event) => update("hero_subtitle", event.target.value)} /></label>
          <label>고객센터 전화<input value={values.support_phone} onChange={(event) => update("support_phone", event.target.value)} /></label>
          <label>상담 운영시간<input value={values.support_hours} onChange={(event) => update("support_hours", event.target.value)} /></label>
          <label>고객센터 이메일<input value={values.support_email} onChange={(event) => update("support_email", event.target.value)} /></label>
        </div>
      </section>
      <section className="settings-card">
        <header><span>04</span><div><h2>회사·결제 계좌 정보</h2><p>푸터와 주문 후 무통장입금 안내에 사용합니다.</p></div></header>
        <div className="settings-fields">
          <label>회사명<input value={values.company_name} onChange={(event) => update("company_name", event.target.value)} /></label>
          <label>대표자<input value={values.representative_name} onChange={(event) => update("representative_name", event.target.value)} /></label>
          <label>사업자번호<input value={values.business_number} onChange={(event) => update("business_number", event.target.value)} /></label>
          <label className="wide">사업장 주소<input value={values.company_address} onChange={(event) => update("company_address", event.target.value)} /></label>
          <label>은행명<input value={values.bank_name} onChange={(event) => update("bank_name", event.target.value)} /></label>
          <label>예금주<input value={values.bank_holder} onChange={(event) => update("bank_holder", event.target.value)} /></label>
          <label className="wide">주문 입금 계좌<input value={values.bank_account} onChange={(event) => update("bank_account", event.target.value)} /></label>
        </div>
      </section>
      <section className="settings-card">
        <header><span>상담</span><div><h2>빠른 상담 버튼</h2><p>PC 우측·모바일 하단에 표시되는 상담 버튼과 각 채널 연결 주소를 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label>상담 버튼 노출<select value={values.contact_floating_enabled ?? "true"} onChange={(event) => update("contact_floating_enabled", event.target.value)}><option value="true">사용</option><option value="false">사용 안 함</option></select></label>
          <label>처음 열렸을 때<select value={values.contact_default_open ?? "true"} onChange={(event) => update("contact_default_open", event.target.value)}><option value="true">펼쳐진 상태</option><option value="false">접힌 상태</option></select></label>
          <label>상담 시작시간 <small>한국시간 기준</small><input type="time" value={values.contact_start_time ?? "09:00"} onChange={(event) => update("contact_start_time", event.target.value)} /></label>
          <label>상담 종료시간 <small>자정을 넘기는 시간도 자동 판정합니다.</small><input type="time" value={values.contact_end_time ?? "18:00"} onChange={(event) => update("contact_end_time", event.target.value)} /></label>
          <label className="wide contact-always-setting">
            <input type="checkbox" checked={values.contact_always_available === "true"} onChange={(event) => update("contact_always_available", event.target.checked ? "true" : "false")} />
            <span><strong>계속 상담</strong><small>체크하면 요일·시간과 관계없이 불빛이 켜지고 상담창을 펼칠 수 있습니다.</small></span>
          </label>
          <fieldset className="wide contact-weekday-setting" disabled={values.contact_always_available === "true"}>
            <legend>상담 요일</legend>
            <div>
              {[[1, "월"], [2, "화"], [3, "수"], [4, "목"], [5, "금"], [6, "토"], [0, "일"]].map(([day, label]) => {
                const selected = new Set(String(values.contact_weekdays || "1,2,3,4,5").split(","));
                const checked = selected.has(String(day));
                return <label key={day}><input type="checkbox" checked={checked} onChange={(event) => {
                  if (event.target.checked) selected.add(String(day)); else selected.delete(String(day));
                  update("contact_weekdays", Array.from(selected).sort().join(","));
                }} /><span>{label}</span></label>;
              })}
            </div>
          </fieldset>
          <div className="contact-image-setting wide">
            <div className="contact-image-preview">
              {values.contact_counselor_image_url ? <img src={values.contact_counselor_image_url} alt="상담자 사진 미리보기" /> : <span>CS</span>}
            </div>
            <div>
              <strong>상담자 얼굴 사진</strong>
              <small>정사각형에 가까운 JPG·PNG·WEBP 사진을 권장합니다. 20MB 이하 사진은 자동으로 용량을 줄입니다.</small>
              <label className="contact-image-upload">
                {contactImageBusy ? "업로드 중..." : "사진 선택·업로드"}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={contactImageBusy} onChange={(event) => { void uploadContactImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
              {values.contact_counselor_image_url && <button type="button" onClick={() => update("contact_counselor_image_url", "")}>사진 제거</button>}
              {contactImageNotice && <span className="contact-image-notice">{contactImageNotice}</span>}
              {contactImageError && <em>{contactImageError}</em>}
            </div>
          </div>
          {[
            ["contact_kakao_enabled", "contact_kakao_url", "카카오톡 상담", "https://pf.kakao.com/...", "카카오 채널·오픈채팅 주소"],
            ["contact_telegram_enabled", "contact_telegram_url", "텔레그램상담", "https://t.me/...", "텔레그램 상담 주소"],
            ["contact_line_enabled", "contact_line_url", "라인상담", "https://line.me/ti/p/...", "LINE 친구추가 주소"],
            ["contact_live_enabled", "contact_live_url", "실시간상담", "https://... 또는 /상담경로", "자체 또는 외부 실시간상담 주소"],
          ].map(([enabledKey, urlKey, label, placeholder, help]) => (
            <div className="contact-channel-setting wide" key={enabledKey}>
              <label>{label} 노출<select value={values[enabledKey] ?? "true"} onChange={(event) => update(enabledKey, event.target.value)}><option value="true">사용</option><option value="false">사용 안 함</option></select></label>
              <label>{label} 주소 <small>{help}</small><input value={values[urlKey] ?? ""} placeholder={placeholder} onChange={(event) => update(urlKey, event.target.value)} /></label>
            </div>
          ))}
        </div>
        <p className="settings-help">상담 가능 시간에는 불빛이 켜지고 기본 펼침 상태로 표시됩니다. 상담시간 밖에는 불이 꺼진 채 자동으로 접히며, 누르면 상담시간 안내가 나옵니다. 모든 상담 채널은 PC에서 같은 크기의 중앙 팝업으로 열리고, 모바일에서는 채널에 맞는 화면으로 열립니다.</p>
      </section>
      <section className="settings-card">
        <header><span>05</span><div><h2>회원·SEO 설정</h2><p>가입 제한과 구글 검색 노출 정보를 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label>가입코드 <small>비우면 누구나 가입 가능</small><input value={values.signup_code} onChange={(event) => update("signup_code", event.target.value)} /></label>
          <label>리워드 단위<input value={values.point_unit} onChange={(event) => update("point_unit", event.target.value)} /></label>
          <label className="wide">
            Google 웹 클라이언트 ID{" "}
            <small>입력하면 일반회원 로그인·회원가입 화면에 Google 버튼이 표시됩니다.</small>
            <input
              value={values.google_client_id ?? ""}
              placeholder="000000000000-xxxx.apps.googleusercontent.com"
              onChange={(event) => update("google_client_id", event.target.value)}
            />
          </label>
          <label className="wide">사이트 주소<input value={values.site_url} onChange={(event) => update("site_url", event.target.value)} /></label>
          <label className="wide">SEO 제목<input value={values.seo_title} onChange={(event) => update("seo_title", event.target.value)} /></label>
          <label className="wide">SEO 설명<textarea value={values.seo_description} onChange={(event) => update("seo_description", event.target.value)} /></label>
          <label className="wide">푸터 안내문<input value={values.footer_notice} onChange={(event) => update("footer_notice", event.target.value)} /></label>
          <label className="wide">카카오톡 송금 안내 주소 <small>카카오페이 결제 연동 주소가 아니라, 고객이 송금 방법을 문의할 판매자 카카오톡 주소입니다.</small><input value={values.kakao_payment_url ?? ""} placeholder="https://..." onChange={(event) => update("kakao_payment_url", event.target.value)} /></label>
          <label>결제 대기시간(시간)<input type="number" min="1" max="168" value={values.kakao_payment_hold_hours ?? "24"} onChange={(event) => update("kakao_payment_hold_hours", event.target.value)} /></label>
          <label>현금 결제 적립률(%)<input type="number" min="0" max="100" step="0.1" value={values.cash_reward_rate ?? "0"} onChange={(event) => update("cash_reward_rate", event.target.value)} /></label>
        </div>
      </section>
      <section className="settings-card">
        <header><span>06</span><div><h2>상품후기 운영 설정</h2><p>배송완료 후기의 작성기한과 자동 적립 기준을 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label>텍스트 후기 적립<input type="number" min="0" value={values.review_text_points ?? "300"} onChange={(event) => update("review_text_points", event.target.value)} /></label>
          <label>사진 후기 적립<input type="number" min="0" value={values.review_photo_points ?? "500"} onChange={(event) => update("review_photo_points", event.target.value)} /></label>
          <label>작성 가능 기간(일)<input type="number" min="1" max="365" value={values.review_write_days ?? "90"} onChange={(event) => update("review_write_days", event.target.value)} /></label>
          <label>최소 글자 수<input type="number" min="1" max="1000" value={values.review_min_length ?? "20"} onChange={(event) => update("review_min_length", event.target.value)} /></label>
          <label>사진 최대 개수<input type="number" min="0" max="8" value={values.review_max_images ?? "4"} onChange={(event) => update("review_max_images", event.target.value)} /></label>
          <label>등록 후 노출<select value={values.review_auto_publish ?? "true"} onChange={(event) => update("review_auto_publish", event.target.value)}><option value="true">즉시 공개</option><option value="false">관리자 확인 후 공개</option></select></label>
        </div>
        <p className="settings-help">한 주문상품에는 후기 1개만 작성할 수 있으며 취소·반품 또는 관리자 삭제 시 적립 리워드가 자동 회수됩니다.</p>
      </section>
      <section className="settings-card">
        <header><span>07</span><div><h2>출석체크 운영 설정</h2><p>하루 1회 적립과 연속 출석 보너스를 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label>출석체크 사용<select value={values.attendance_enabled ?? "true"} onChange={(event) => update("attendance_enabled", event.target.value)}><option value="true">사용</option><option value="false">사용 안 함</option></select></label>
          <label>매일 출석 적립<input type="number" min="0" max="100000" value={values.attendance_daily_points ?? "100"} onChange={(event) => update("attendance_daily_points", event.target.value)} /></label>
          <label>연속 보너스 기준(일)<input type="number" min="2" max="31" value={values.attendance_streak_days ?? "7"} onChange={(event) => update("attendance_streak_days", event.target.value)} /></label>
          <label>연속 출석 보너스<input type="number" min="0" max="1000000" value={values.attendance_streak_bonus ?? "500"} onChange={(event) => update("attendance_streak_bonus", event.target.value)} /></label>
        </div>
        <p className="settings-help">한국 시간 자정마다 새 출석이 열립니다. 같은 회원은 하루에 한 번만 받을 수 있고 보너스는 설정한 연속 일수마다 지급됩니다.</p>
      </section>
      <section className="settings-card">
        <header><span>08</span><div><h2>약관·데이터 백업</h2><p>회원에게 공개되는 문서와 독립 서버 이전용 데이터를 관리합니다.</p></div></header>
        <div className="settings-fields">
          <label className="wide">이용약관<textarea rows={7} value={values.terms_text} onChange={(event) => update("terms_text", event.target.value)} /></label>
          <label className="wide">개인정보처리방침<textarea rows={7} value={values.privacy_text} onChange={(event) => update("privacy_text", event.target.value)} /></label>
        </div>
        <div className="backup-row"><div><strong>운영 데이터 백업</strong><p>상품·회원·리워드·주문·후기·상담 데이터를 JSON 파일로 내려받습니다. 비밀번호와 로그인 세션은 제외됩니다.</p></div><a className="admin-primary" href="/api/admin/backup">백업 파일 받기</a></div>
      </section>
      <section className="settings-card">
        <header><span>09</span><div><h2>테스트 데이터 관리</h2><p>실제 운영 단계별 더미 회원과 주문을 안전하게 만들고 초기화합니다.</p></div></header>
        <div className="test-data-panel">
          <div className="test-data-summary">
            <article><span>테스트 회원</span><strong>{fmt(testData?.members ?? 0)}</strong><small>명</small></article>
            <article><span>테스트 주문</span><strong>{fmt(testData?.orders ?? 0)}</strong><small>건</small></article>
            <article><span>테스트 후기</span><strong>{fmt(testData?.reviews ?? 0)}</strong><small>건</small></article>
            <article><span>출석 기록</span><strong>{fmt(testData?.attendance ?? 0)}</strong><small>건</small></article>
          </div>
          <div className="test-login-guide"><strong>테스트 계정 로그인</strong><p>이메일: test01@reward-v2.test ~ test15@reward-v2.test</p><p>공통 비밀번호: <code>{testData?.password ?? "-"}</code></p></div>
          <div className="test-scenario-list"><span>포함 상태</span><p>가입만 완료 · 출석 1회 · 7일 연속출석 · 리워드 보유 · 무통장/카카오톡 송금 대기 · 주문접수 · 상품준비 · 배송중 · 배송완료 · 후기작성 · 취소 · 반품완료 · 추천 지급대기/완료 · 의심추천 검토</p></div>
          <div className="test-data-actions">
            <button type="button" className="admin-primary" onClick={() => confirm("현재 테스트 데이터만 삭제한 뒤 처음 상태로 다시 만들까요? 실제 회원과 주문은 유지됩니다.") && act({ action: "test_data.seed" }, "단계별 테스트 데이터를 다시 만들었습니다.")}>테스트 데이터 다시 만들기</button>
            <button type="button" className="danger" disabled={!testData?.members} onClick={() => confirm("TEST 표시가 있는 더미 회원과 연결 데이터만 모두 삭제할까요? 실제 회원과 주문은 유지됩니다.") && act({ action: "test_data.reset" }, "테스트 데이터만 모두 삭제했습니다.")}>테스트 데이터 모두 삭제</button>
          </div>
        </div>
      </section>
      <div className="settings-save"><p>저장 후 회원용 쇼핑몰 화면을 새로고침하면 변경 사항을 확인할 수 있습니다.</p><button className="admin-primary">변경사항 저장</button></div>
    </form>
  );
}

type HomeDisplaySection = { id: string; title: string; visible: boolean; sort: string; productIds: number[]; order?: number };
type MemberTier = { id: string; name: string; minSpend: number; rewardRate: number };

function jsonSetting<T>(value: string | undefined, fallback: T): T {
  try { return JSON.parse(value || "") as T; } catch { return fallback; }
}

type LiveTimelineEntry = { id: string; time: number; broadcastNumber: number; productId: number; needsReview: boolean };
type LiveReplay = { id: string; title: string; youtubeUrl: string; date: string; orientation: "horizontal" | "vertical"; completed: boolean; timeline: LiveTimelineEntry[]; analyzedAt?: string; analysisModel?: string; analysisNote?: string };
type LiveShort = { id: string; title: string; youtubeUrl: string; productId: number; visible: boolean };
type LiveProductSlot = { number: number; productId: number };
const DEFAULT_LIVE_SLOT_COUNT = 50;
const MAX_LIVE_SLOT_COUNT = 500;
const CHANNEL_PRODUCT_PICKER_PAGE_SIZE = 12;

function liveId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function channelCategoryProducts(channel: any, products: any[]) {
  const rows = jsonSetting<ChannelCategorySetting[]>(String(channel?.category_settings || "[]"), []);
  return rows.map((row) => {
    let ids = (row.productIds || []).map(Number).filter(Boolean);
    if (row.assignmentMode === "auto" && row.ruleValue) {
      ids = products.filter((product) => {
        if (row.ruleType === "brand") {
          const sameBrand = String(product.brand || "").trim().toLowerCase() === String(row.ruleValue || "").trim().toLowerCase();
          const sameGroup = !row.ruleCategory || String(product.category || "").trim() === String(row.ruleCategory).trim();
          return sameBrand && sameGroup;
        }
        return row.ruleType === "category" && [product.category, product.subcategory].some((value) => String(value || "").trim() === String(row.ruleValue || "").trim());
      }).map((product) => Number(product.id));
    }
    return { name: row.sourceName, label: row.label || row.sourceName, ids };
  }).filter((row) => row.name && row.ids.length > 0);
}

function ChannelProductPicker({ products, categories, value, onChange, label = "연결 상품" }: { products: any[]; categories: { name: string; label: string; ids: number[] }[]; value: number; onChange: (id: number) => void; label?: string }) {
  const pickerId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [brand, setBrand] = useState("전체");
  const [page, setPage] = useState(1);
  const selected = products.find((product) => Number(product.id) === Number(value));
  const brands = useMemo(() => Array.from(new Set(products.map((product) => String(product.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [products]);
  const categoryIds = category === "전체" ? null : new Set(categories.find((row) => row.name === category)?.ids || []);
  const matching = products.filter((product) => {
    const haystack = `${product.name || ""} ${product.style_number || ""} ${product.product_code || ""} ${product.brand || ""}`.toLowerCase();
    return (!search.trim() || haystack.includes(search.trim().toLowerCase()))
      && (brand === "전체" || String(product.brand || "") === brand)
      && (!categoryIds || categoryIds.has(Number(product.id)));
  });
  const pageCount = Math.max(1, Math.ceil(matching.length / CHANNEL_PRODUCT_PICKER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = matching.slice((safePage - 1) * CHANNEL_PRODUCT_PICKER_PAGE_SIZE, safePage * CHANNEL_PRODUCT_PICKER_PAGE_SIZE);
  const resetPage = () => setPage(1);
  const placePanel = () => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(720, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 430 && spaceAbove > spaceBelow;
    const available = Math.max(180, (openUpward ? spaceAbove : spaceBelow) - 8);
    setPanelPosition(openUpward
      ? { bottom: window.innerHeight - rect.top + 8, left, width, maxHeight: Math.min(620, available) }
      : { top: rect.bottom + 8, left, width, maxHeight: Math.min(620, available) });
  };
  useEffect(() => {
    const closeOtherPicker = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
    };
    window.addEventListener("channel-product-picker-open", closeOtherPicker);
    return () => window.removeEventListener("channel-product-picker-open", closeOtherPicker);
  }, [pickerId]);
  useEffect(() => {
    if (!open) { setPanelPosition(null); return; }
    const frame = window.requestAnimationFrame(placePanel);
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open]);
  const togglePicker = () => {
    if (open) { setOpen(false); return; }
    window.dispatchEvent(new CustomEvent("channel-product-picker-open", { detail: pickerId }));
    setOpen(true);
  };
  const panel = open && typeof document !== "undefined" ? createPortal(<div ref={panelRef} className="channel-product-picker-panel" style={panelPosition || { visibility: "hidden" }}>
    <div className="channel-product-picker-tools">
      <input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="상품명·품번·상품코드·브랜드 검색" autoFocus />
      <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }}><option value="전체">전체 채널 카테고리</option>{categories.map((row) => <option key={row.name} value={row.name}>{row.label} ({row.ids.length})</option>)}</select>
      <select value={brand} onChange={(event) => { setBrand(event.target.value); resetPage(); }}><option value="전체">전체 브랜드</option>{brands.map((name) => <option key={name} value={name}>{name}</option>)}</select>
    </div>
    <div className="channel-product-picker-summary"><span>채널 상품 {products.length.toLocaleString("ko-KR")}개 중 {matching.length.toLocaleString("ko-KR")}개</span>{value > 0 && <button type="button" onClick={() => { onChange(0); setOpen(false); }}>연결 해제</button>}</div>
    {visible.length ? <div className="channel-product-picker-results">{visible.map((product) => <button type="button" key={product.id} className={Number(product.id) === Number(value) ? "selected" : ""} onClick={() => { onChange(Number(product.id)); setOpen(false); }}><SafeProductImage src={product.image_url} alt="" /><span><strong>{product.name}</strong><small>{product.style_number || product.product_code || "품번 없음"}</small><em>{product.brand || "브랜드 미지정"}</em></span></button>)}</div> : <p className="channel-product-picker-empty">조건에 맞는 채널 상품이 없습니다. ‘상품·카테고리’에서 먼저 상품을 가져와 주세요.</p>}
    {pageCount > 1 && <div className="channel-product-picker-pages"><button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>이전</button><span>{safePage} / {pageCount}</span><button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>다음</button></div>}
  </div>, document.body) : null;
  return <div ref={fieldRef} className="channel-product-picker-field">
    <span className="channel-product-picker-label">{label}</span>
    <button type="button" className={`channel-product-picker-current ${selected ? "selected" : ""}`} onClick={togglePicker} aria-expanded={open}>
      {selected ? <><SafeProductImage src={selected.image_url} alt="" /><span><strong>{selected.name}</strong><small>{selected.style_number || selected.product_code || "품번 없음"} · {selected.brand || "브랜드 미지정"}</small></span></> : <span><strong>채널 상품 선택</strong><small>상품명·품번·상품코드·브랜드로 검색</small></span>}<b>{open ? "닫기" : "찾기"}</b>
    </button>
    {panel}
  </div>;
}

function ChannelApplicationQueue({ channels, act, isSupervisor }: { channels: any[]; act: (body: Record<string, unknown>, message?: string) => Promise<boolean>; isSupervisor: boolean }) {
  const applications = channels.filter((channel) => channel.owner_member_id && ["pending", "revision_requested", "rejected"].includes(String(channel.application_status)));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const statusLabel: Record<string, string> = {
    pending: "신청 검토 중", approved: "운영 준비 중", revision_requested: "회원 수정 중",
    publication_review: "공개 승인 대기", published: "공개 중", rejected: "신청 반려", suspended: "공개 중지",
  };
  if (!applications.length) return null;
  const review = (channel: any, decision: string, message: string) => act({
    action: "channel.application.review", id: channel.id, decision, note: notes[Number(channel.id)] || "",
  }, message);
  return <section className="settings-card channel-application-queue">
    <header><span>CHANNEL REVIEW</span><div><h2>라이브 방송 채널 신청 상황</h2><p>신청자와 상담한 후 승인·수정 요청·반려를 결정합니다. 승인된 채널은 채널 관리로 이동합니다.</p></div></header>
    <div className="channel-application-grid">{applications.map((channel) => <article key={channel.id}>
      <div className="channel-application-title"><div><small>{statusLabel[channel.application_status] || channel.application_status}</small><strong>{channel.name}</strong><p>{channel.owner_member_name || "회원"} · {channel.owner_member_email || "이메일 없음"}</p></div><a href={`/channel/${channel.slug}`} target="_blank" rel="noreferrer">미리보기 ↗</a></div>
      {channel.application_message && <div className="channel-application-plan"><b>운영 계획</b><p>{channel.application_message}</p></div>}
      {(() => { const broadcast = jsonSetting<Record<string, any>>(String(channel.broadcast_settings || "{}"), {}); const requests = Array.isArray(broadcast.member_category_requests) ? broadcast.member_category_requests : []; const pending = [...requests].reverse().find((item: any) => item.status === "pending"); if (!pending) return null; return <div className="channel-category-review"><b>카테고리 변경 요청</b><p>{(pending.categories || []).map((item: any) => item.label).filter(Boolean).join(" · ") || "요청 내용 없음"}</p>{isSupervisor && <div className="channel-application-actions"><button type="button" className="admin-primary" onClick={() => act({ action: "channel.category.request.review", id: channel.id, requestId: pending.id, decision: "approve" }, "카테고리 변경을 승인했습니다.")}>카테고리 승인</button><button type="button" className="danger" onClick={() => act({ action: "channel.category.request.review", id: channel.id, requestId: pending.id, decision: "reject", note: notes[Number(channel.id)] || "관리자와 상의 후 다시 요청해 주세요." }, "카테고리 변경을 반려했습니다.")}>카테고리 반려</button></div>}</div>; })()}
      {channel.admin_review_note && <p className="settings-help">최근 관리자 안내: {channel.admin_review_note}</p>}
      {isSupervisor && <><label>회원에게 전달할 안내<textarea value={notes[Number(channel.id)] || ""} onChange={(event) => setNotes((current) => ({ ...current, [Number(channel.id)]: event.target.value }))} placeholder="승인 안내 또는 수정·반려 사유를 적어 주세요." /></label><div className="channel-application-actions">
        {channel.application_status === "pending" && <><button type="button" className="admin-primary" onClick={() => review(channel, "approve", "채널 신청을 승인했습니다.")}>신청 승인</button><button type="button" onClick={() => review(channel, "revision", "수정 요청을 보냈습니다.")}>수정 요청</button><button type="button" className="danger" onClick={() => review(channel, "reject", "채널 신청을 반려했습니다.")}>반려</button></>}
        {channel.application_status === "publication_review" && <><button type="button" className="admin-primary" onClick={() => review(channel, "publish", "채널을 공개했습니다.")}>최종 공개</button><button type="button" onClick={() => review(channel, "revision", "수정 요청을 보냈습니다.")}>수정 요청</button></>}
        {channel.application_status === "published" && <button type="button" className="danger" onClick={() => review(channel, "suspend", "채널 공개를 중지했습니다.")}>공개 중지</button>}
        {channel.application_status === "suspended" && <button type="button" className="admin-primary" onClick={() => review(channel, "publish", "채널을 다시 공개했습니다.")}>다시 공개</button>}
      </div></>}
    </article>)}</div>
  </section>;
}

function ChannelLiveWorkspace({ channels, ownerCandidates, settings, products, act, isSupervisor }: { channels: any[]; ownerCandidates: any[]; settings: Record<string, string>; products: any[]; act: (body: Record<string, unknown>, message?: string) => Promise<boolean>; isSupervisor: boolean }) {
  const managedChannels = channels.filter((channel) => !channel.owner_member_id || ["admin_created", "approved", "publication_review", "published", "suspended"].includes(String(channel.application_status)));
  const applicationCount = channels.filter((channel) => channel.owner_member_id && ["pending", "revision_requested", "rejected"].includes(String(channel.application_status))).length;
  const [topSection, setTopSection] = useState(applicationCount > 0 ? "applications" : "channels");
  const [selectedChannelId, setSelectedChannelId] = useState(() => Number(managedChannels[0]?.id || 0));
  const [workspaceTab, setWorkspaceTab] = useState("overview");
  const [managingChannels, setManagingChannels] = useState(false);
  const [channelManagerId, setChannelManagerId] = useState(0);
  const selectedChannel = managedChannels.find((channel) => Number(channel.id) === selectedChannelId) || managedChannels[0];
  let channelSettings: Record<string, string> = {};
  try { channelSettings = JSON.parse(String(selectedChannel?.broadcast_settings || "{}")); } catch { channelSettings = {}; }
  const mergedSettings: Record<string, string> = selectedChannel ? {
    ...settings,
    ...channelSettings,
    storefront_skin: "youtube",
    youtube_live_title: channelSettings.youtube_live_title || selectedChannel.name || settings.youtube_live_title,
    youtube_live_url: channelSettings.youtube_live_url || selectedChannel.youtube_url || settings.youtube_live_url,
    youtube_live_notice: channelSettings.youtube_live_notice || selectedChannel.description || settings.youtube_live_notice,
  } : settings;

  const replays = jsonSetting<any[]>(mergedSettings.youtube_replays, []);
  const shorts = jsonSetting<any[]>(mergedSettings.youtube_shorts, []);
  const isLive = mergedSettings.youtube_live_enabled === "true" && Boolean(mergedSettings.youtube_live_url);
  const workspaceTabs = [
    ["overview", "채널 홈"], ["live", "생방송"], ["products", "방송 상품"], ["replays", "다시보기"],
    ["shorts", "쇼츠"], ["catalog", "채널 상품·카테고리"], ["assistant", "방송 보조창"], ["stats", "통계"],
  ];
  useEffect(() => {
    if (managedChannels.length && !managedChannels.some((channel) => Number(channel.id) === selectedChannelId)) setSelectedChannelId(Number(managedChannels[0].id));
  }, [channels, selectedChannelId]);

  const mainMenu = <nav className="live-admin-sections" aria-label="라이브 커머스 대메뉴">
    <button type="button" className={topSection === "applications" ? "active" : ""} onClick={() => setTopSection("applications")}>라이브 방송 신청 상황{applicationCount > 0 && <b>{applicationCount}</b>}</button>
    <button type="button" className={topSection === "channels" ? "active" : ""} onClick={() => setTopSection("channels")}>라이브 방송 채널 관리 <small>{managedChannels.length}개</small></button>
  </nav>;

  if (topSection === "applications") return <>{mainMenu}{applicationCount > 0
    ? <ChannelApplicationQueue channels={channels} act={act} isSupervisor={isSupervisor} />
    : <section className="settings-card live-application-empty"><h2>새로 들어온 방송 채널 신청이 없습니다.</h2><p>승인 완료된 채널은 `라이브 방송 채널 관리`에서 확인하세요.</p></section>}</>;

  return <>
    {mainMenu}
    {selectedChannel ? <>
      {!managingChannels && <section className="live-workspace-command"><div className="live-channel-card-head"><div><strong>관리할 방송 채널</strong><p>신청 승인이 완료된 채널만 표시됩니다.</p></div><button type="button" className="admin-primary" onClick={() => { setChannelManagerId(0); setManagingChannels(true); }}>+ 채널 추가</button></div><div className="live-channel-card-grid">{managedChannels.map((channel) => { const active = Number(channel.id) === Number(selectedChannel.id); return <article key={channel.id} className={active ? "selected" : ""} style={{ borderColor: active ? channel.theme_color || "#102846" : undefined }}><button type="button" className="live-channel-select" onClick={() => setSelectedChannelId(Number(channel.id))}><span className="live-channel-thumb">{channel.image_url ? <img src={channel.image_url} alt="" /> : <b style={{ background: channel.theme_color || "#111827" }}>{String(channel.name || "C").slice(0, 1)}</b>}</span><span className="live-channel-card-copy"><small>{channel.status === "active" ? "공개" : channel.status === "inactive" ? "숨김" : "초안"}</small><strong>{channel.name}</strong><em>상품 {fmt(channel.product_count || 0)}개</em></span>{active && <i>선택됨</i>}</button><div><a href={`/channel/${channel.slug}`} target="_blank" rel="noreferrer">미리보기 ↗</a><button type="button" onClick={() => { setSelectedChannelId(Number(channel.id)); setChannelManagerId(Number(channel.id)); setManagingChannels(true); }}>채널 기본정보 수정</button></div></article>; })}</div><div className="live-workspace-current"><div className="live-workspace-status"><span className={selectedChannel.status === "active" ? "on" : ""}>{selectedChannel.status === "active" ? "채널 공개" : "채널 숨김"}</span><span className={isLive ? "live" : ""}>{isLive ? "● 생방송 중" : "방송 준비 중"}</span></div><a href={`/channel/${selectedChannel.slug}`} target="_blank" rel="noreferrer">{selectedChannel.name} 전체 미리보기 ↗</a></div></section>}
      {managingChannels && <ChannelManager key={`manager-${channelManagerId}`} channels={managedChannels} ownerCandidates={ownerCandidates} products={products} settings={settings} act={act} initialChannelId={channelManagerId} startNew={!channelManagerId} isSupervisor={isSupervisor} onDone={() => setManagingChannels(false)} />}
      {!managingChannels && <nav className="live-workspace-nav" aria-label="방송 채널 관리 메뉴">{workspaceTabs.map(([key, label]) => <button type="button" key={key} className={workspaceTab === key ? "active" : ""} onClick={() => setWorkspaceTab(key)}>{label}</button>)}</nav>}
      {!managingChannels && workspaceTab === "overview" && <section className="settings-card live-workspace-overview"><header><span>CHANNEL HOME</span><div><h2>{selectedChannel.name} 방송 운영 현황</h2><p>지금 방송 상태와 필요한 작업을 한눈에 확인합니다.</p></div></header><div className="channel-live-statistics"><article><span>페이지 열람</span><strong>{fmt(selectedChannel.view_count || 0)}회</strong></article><article><span>연결 상품</span><strong>{fmt(selectedChannel.product_count || 0)}개</strong></article><article><span>공개 다시보기</span><strong>{fmt(replays.filter((item) => item.completed).length)}개</strong></article><article><span>공개 쇼츠</span><strong>{fmt(shorts.filter((item) => item.active !== false).length)}개</strong></article></div><div className="live-overview-current"><div><small>현재 생방송</small><strong>{mergedSettings.youtube_live_title || "등록된 방송 제목이 없습니다"}</strong><p>{isLive ? "고객 방송 페이지에 생방송이 공개되고 있습니다." : "방송 주소와 공개 상태를 확인한 뒤 시작하세요."}</p></div><button type="button" className="admin-primary" onClick={() => setWorkspaceTab("live")}>생방송 설정 열기</button><button type="button" onClick={() => setWorkspaceTab("assistant")}>방송 보조창 열기</button></div></section>}
      {!managingChannels && workspaceTab === "catalog" && <ChannelManager key={`catalog-${selectedChannel.id}`} channels={managedChannels} ownerCandidates={ownerCandidates} products={products} settings={settings} act={act} initialChannelId={Number(selectedChannel.id)} selectedOnly editorScope="catalog" isSupervisor={isSupervisor} />}
      {!managingChannels && workspaceTab === "stats" && <section className="settings-card live-workspace-overview"><header><span>STATISTICS</span><div><h2>{selectedChannel.name} 채널 통계</h2><p>채널에 귀속된 열람·상품·주문·판매액을 확인합니다.</p></div></header><div className="channel-live-statistics"><article><span>페이지 열람</span><strong>{fmt(selectedChannel.view_count || 0)}회</strong></article><article><span>연결 상품</span><strong>{fmt(selectedChannel.product_count || 0)}개</strong></article><article><span>귀속 주문</span><strong>{fmt(selectedChannel.order_count || 0)}건</strong></article><article><span>귀속 판매액</span><strong>{fmt(selectedChannel.sales_amount || 0)}원</strong></article></div><p className="settings-help">주문과 판매액은 해당 채널에서 시작된 구매만 합산됩니다.</p></section>}
      {!managingChannels && (["live", "products", "replays", "shorts", "assistant"].includes(workspaceTab)) && <LiveCommerceSettings key={`${selectedChannel.id}-${workspaceTab}`} channel={selectedChannel} settings={mergedSettings} products={products} act={act} isSupervisor={isSupervisor} initialTab={workspaceTab} hideNavigation />}
    </> : <><section className="settings-card"><p>먼저 판매 채널을 만들어 주세요. 기존 오르미르 설정은 ‘기존 라이브 설정으로 시작’을 누르면 안전하게 복사됩니다.</p></section><ChannelManager channels={managedChannels} ownerCandidates={ownerCandidates} products={products} settings={settings} act={act} isSupervisor={isSupervisor} /></>}
  </>;
}

export function LiveCommerceSettings({ channel, settings, products, act, isSupervisor, initialTab = "skin", hideNavigation = false, assistantBasePath = "/admin/live-assistant" }: { channel: any; settings: Record<string, string>; products: any[]; act: (body: Record<string, unknown>, message?: string) => Promise<boolean>; isSupervisor: boolean; initialTab?: string; hideNavigation?: boolean; assistantBasePath?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [values, setValues] = useState(settings);
  const [liveSlots, setLiveSlots] = useState<LiveProductSlot[]>(() => {
    const saved = jsonSetting<LiveProductSlot[]>(settings.youtube_live_slots, []);
    if (saved.length) return saved;
    return jsonSetting<number[]>(settings.youtube_live_product_ids, []).map((productId, index) => ({ number: index + 1, productId }));
  });
  const [liveSlotNumbers, setLiveSlotNumbers] = useState<number[]>(() => {
    const saved = jsonSetting<number[]>(settings.youtube_live_slot_numbers, []);
    if (saved.length) return Array.from(new Set(saved.map(Number).filter((number) => Number.isInteger(number) && number > 0 && number <= 9999))).sort((a, b) => a - b);
    const legacyCount = Math.max(DEFAULT_LIVE_SLOT_COUNT, Math.floor(Number(settings.youtube_live_slot_count || DEFAULT_LIVE_SLOT_COUNT)));
    return Array.from({ length: Math.min(MAX_LIVE_SLOT_COUNT, legacyCount) }, (_, index) => index + 1);
  });
  const [newLiveSlotNumber, setNewLiveSlotNumber] = useState("");
  const [replays, setReplays] = useState<LiveReplay[]>(() => jsonSetting<LiveReplay[]>(settings.youtube_replays, []).map((replay) => ({
    ...replay,
    orientation: replay.orientation === "vertical" ? "vertical" : "horizontal",
    timeline: (replay.timeline || []).map((entry) => ({ ...entry, broadcastNumber: Number(entry.broadcastNumber || 0), needsReview: Boolean(entry.needsReview) })),
  })));
  const [openReplayId, setOpenReplayId] = useState(() => String(jsonSetting<LiveReplay[]>(settings.youtube_replays, [])[0]?.id || ""));
  const [shorts, setShorts] = useState<LiveShort[]>(() => jsonSetting(settings.youtube_shorts, []));
  const [analyzingReplay, setAnalyzingReplay] = useState("");
  const [replayAnalysisMessage, setReplayAnalysisMessage] = useState<Record<string, { kind: "success" | "error"; text: string }>>({});
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiConfigBusy, setAiConfigBusy] = useState(false);
  const [aiConfigMessage, setAiConfigMessage] = useState("");
  const globalActiveProducts = useMemo(() => products.filter((item) => item.status === "active"), [products]);
  const channelProductCategories = useMemo(() => channelCategoryProducts(channel, globalActiveProducts), [channel, globalActiveProducts]);
  const channelProductIds = useMemo(() => new Set([
    ...String(channel?.product_ids || "").split(",").map(Number).filter(Boolean),
    ...channelProductCategories.flatMap((row) => row.ids),
  ]), [channel?.product_ids, channelProductCategories]);
  const activeProducts = useMemo(() => globalActiveProducts.filter((item) => channelProductIds.has(Number(item.id))), [globalActiveProducts, channelProductIds]);
  const update = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const liveSlotProduct = (number: number) => {
    const slot = liveSlots.find((item) => Number(item.number) === number);
    return slot ? activeProducts.find((product) => Number(product.id) === Number(slot.productId)) : null;
  };

  useEffect(() => {
    fetch("/api/ai-config", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AI 연결 상태를 확인하지 못했습니다.");
        setAiConfigured(Boolean(payload.configured));
      })
      .catch(() => setAiConfigured(false));
  }, []);

  async function saveAiConfig(remove = false) {
    setAiConfigBusy(true);
    setAiConfigMessage("");
    try {
      const response = await fetch("/api/ai-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(remove ? { remove: true } : { apiKey: aiKeyInput }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 연결을 저장하지 못했습니다.");
      setAiConfigured(Boolean(payload.configured));
      setAiKeyInput("");
      setAiConfigMessage(remove ? "AI 연결을 해제했습니다." : "AI 영상 분석 연결이 완료됐습니다.");
    } catch (cause) {
      setAiConfigMessage(cause instanceof Error ? cause.message : "AI 연결을 저장하지 못했습니다.");
    } finally {
      setAiConfigBusy(false);
    }
  }

  function connectLiveProduct(number: number, productId: number) {
    if (!productId) {
      setLiveSlots((current) => current.filter((slot) => Number(slot.number) !== number));
      return;
    }
    const duplicate = liveSlots.find((slot) => Number(slot.productId) === Number(productId) && Number(slot.number) !== number);
    if (duplicate) {
      window.alert(`이 상품은 이미 ${duplicate.number}번에 연결되어 있습니다.`);
      return;
    }
    setLiveSlots((current) => [...current.filter((slot) => Number(slot.number) !== number), { number, productId: Number(productId) }].sort((a, b) => a.number - b.number));
  }

  function addLiveSlotNumber() {
    const requested = Math.floor(Number(newLiveSlotNumber));
    const nextNumber = requested || Math.max(0, ...liveSlotNumbers) + 1;
    if (nextNumber < 1 || nextNumber > 9999) {
      window.alert("방송 번호는 1~9999 사이로 입력해 주세요.");
      return;
    }
    if (liveSlotNumbers.includes(nextNumber)) {
      window.alert(`${nextNumber}번은 이미 번호표에 있습니다.`);
      return;
    }
    if (liveSlotNumbers.length >= MAX_LIVE_SLOT_COUNT) {
      window.alert(`방송 번호는 최대 ${MAX_LIVE_SLOT_COUNT}개까지 만들 수 있습니다.`);
      return;
    }
    setLiveSlotNumbers((current) => [...current, nextNumber].sort((a, b) => a - b));
    setNewLiveSlotNumber("");
  }

  function removeLiveSlotNumber(number: number) {
    const linked = liveSlots.find((slot) => Number(slot.number) === number);
    if (linked && !window.confirm(`${number}번에 연결된 상품도 함께 해제하고 번호를 삭제할까요?`)) return;
    setLiveSlotNumbers((current) => current.filter((item) => item !== number));
    setLiveSlots((current) => current.filter((slot) => Number(slot.number) !== number));
  }

  async function analyzeReplay(replay: LiveReplay) {
    if (!replay.youtubeUrl.trim()) {
      setReplayAnalysisMessage((current) => ({ ...current, [replay.id]: { kind: "error", text: "유튜브 재방송 주소를 먼저 입력해 주세요." } }));
      return;
    }
    setAnalyzingReplay(replay.id);
    setReplayAnalysisMessage((current) => ({ ...current, [replay.id]: { kind: "success", text: "AI가 영상의 음성과 화면을 확인하고 있습니다. 긴 방송은 몇 분 걸릴 수 있습니다." } }));
    try {
      const response = await fetch("/api/youtube-replay-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replay, channelId: channel.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "영상을 분석하지 못했습니다.");
      const analyzed = payload.replay as LiveReplay;
      setReplays((current) => current.map((item) => item.id === replay.id ? analyzed : item));
      setReplayAnalysisMessage((current) => ({ ...current, [replay.id]: { kind: "success", text: payload.message || `상품 소개 구간 ${analyzed.timeline.length}개를 찾았습니다.` } }));
    } catch (cause) {
      setReplayAnalysisMessage((current) => ({ ...current, [replay.id]: { kind: "error", text: cause instanceof Error ? cause.message : "영상을 분석하지 못했습니다." } }));
    } finally {
      setAnalyzingReplay("");
    }
  }

  function addReplay() {
    const replay: LiveReplay = { id: liveId("replay"), title: "새 재방송", youtubeUrl: "", date: new Date().toISOString().slice(0, 10), orientation: "horizontal", completed: false, timeline: [] };
    setReplays((current) => [replay, ...current]);
    setOpenReplayId(replay.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedSlots = liveSlots
      .filter((slot) => Number(slot.number) > 0 && Number(slot.productId) > 0)
      .map((slot) => ({ number: Math.floor(Number(slot.number)), productId: Number(slot.productId) }));
    if (new Set(normalizedSlots.map((slot) => slot.number)).size !== normalizedSlots.length) {
      window.alert("방송 진열 번호가 중복되었습니다. 번호마다 상품 하나만 연결해 주세요.");
      return;
    }
    const duplicateProduct = normalizedSlots.find((slot, index) => normalizedSlots.findIndex((item) => item.productId === slot.productId) !== index);
    if (duplicateProduct) {
      const numbers = normalizedSlots.filter((slot) => slot.productId === duplicateProduct.productId).map((slot) => slot.number).join("번, ");
      window.alert(`같은 상품이 ${numbers}번에 중복 연결되어 있습니다.`);
      return;
    }
    await act({ action: "live.save", channelId: channel.id, values: {
      ...values,
      youtube_live_slot_count: String(liveSlotNumbers.length),
      youtube_live_slot_numbers: JSON.stringify(liveSlotNumbers),
      youtube_live_product_ids: JSON.stringify(normalizedSlots.map((slot) => slot.productId)),
      youtube_live_slots: JSON.stringify(normalizedSlots),
      youtube_replays: JSON.stringify(replays.map((replay) => ({ ...replay, timeline: [...replay.timeline].sort((a, b) => Number(a.time) - Number(b.time)) }))),
      youtube_shorts: JSON.stringify(shorts),
    } }, `${channel.name} 방송 설정을 저장했습니다.`);
  }

  return <form className="settings-layout live-commerce-admin" onSubmit={submit}>
    <section className="settings-card live-skin-summary">
      <header><span>CHANNEL LIVE</span><div><h2>{channel.name} 쇼핑몰 스킨 설정</h2><p>현재 선택한 채널의 방송 기능 전체를 관리합니다.</p></div><b className="active">채널별 독립 설정</b></header>
      {!hideNavigation && <nav className="live-admin-tabs" aria-label="라이브 커머스 설정 구분">
        {([["skin", "기본 화면"], ...(values.storefront_skin === "youtube" ? [["live", "생방송 설정"], ["replays", "재방송 관리"], ["shorts", "쇼츠 관리"], ["products", "방송 번호표"], ["assistant", "방송 보조창"]] : [])] as string[][]).map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>}
    </section>

    {tab === "skin" && <section className="settings-card"><header><span>01</span><div><h2>고객 화면 스킨 선택</h2><p>상품·회원·주문·리워드 데이터는 두 스킨이 함께 사용합니다.</p></div></header><div className="skin-choice-grid">
      <button type="button" className={values.storefront_skin !== "youtube" ? "active" : ""} onClick={() => { update("storefront_skin", "general"); setTab("skin"); }}><strong>일반 쇼핑몰형</strong><span>기존 상품 중심 홈</span></button>
      <button type="button" className={values.storefront_skin === "youtube" ? "active" : ""} onClick={() => update("storefront_skin", "youtube")}><strong>유튜브 라이브형</strong><span>생방송·재방송·쇼츠 통합 홈</span></button>
    </div><p className="settings-help live-important-note">스킨을 바꿔도 상품, 장바구니, 회원, 주문과 리워드 데이터는 삭제되거나 복제되지 않습니다.</p></section>}

    {tab === "live" && <section className="settings-card"><header><span>02</span><div><h2>생방송 설정</h2><p>방송 중일 때 고객 홈 상단에 유튜브 영상과 연결 상품을 노출합니다.</p></div><button type="button" className={`feature-switch ${values.youtube_live_enabled === "true" ? "on" : ""}`} onClick={() => update("youtube_live_enabled", values.youtube_live_enabled === "true" ? "false" : "true")}>{values.youtube_live_enabled === "true" ? "방송 노출 중" : "방송 숨김"}</button></header><div className="settings-fields">
      <fieldset className="wide live-orientation-field"><legend>방송 화면 비율</legend><div className="live-orientation-options">
        <button type="button" className={(values.youtube_live_orientation || "horizontal") === "horizontal" ? "active" : ""} onClick={() => update("youtube_live_orientation", "horizontal")}><span className="orientation-shape horizontal" aria-hidden="true" /><strong>가로 방송 (16:9)</strong><small>영상과 채팅을 넓게 나란히 표시합니다.</small></button>
        <button type="button" className={values.youtube_live_orientation === "vertical" ? "active" : ""} onClick={() => update("youtube_live_orientation", "vertical")}><span className="orientation-shape vertical" aria-hidden="true" /><strong>세로 방송 (9:16)</strong><small>좌우 공간에 현재 상품과 다음 상품을 배치합니다.</small></button>
      </div></fieldset>
      <label className="wide">생방송 제목<input value={values.youtube_live_title || ""} onChange={(e) => update("youtube_live_title", e.target.value)} placeholder="오늘의 유튜브 라이브 쇼핑" /></label>
      <label className="wide">유튜브 생방송 주소<input type="url" value={values.youtube_live_url || ""} onChange={(e) => update("youtube_live_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <label className="wide">방송 안내문<textarea rows={3} value={values.youtube_live_notice || ""} onChange={(e) => update("youtube_live_notice", e.target.value)} /></label>
    </div></section>}

    {tab === "replays" && <section className="settings-card"><header><span>03</span><div><h2>재방송 관리</h2><p>방송 제목을 눌러 필요한 재방송 하나만 펼쳐 수정합니다. AI 분석 결과와 상품 구간은 펼친 방송 안에서 관리합니다.</p></div><button type="button" className="admin-primary" onClick={addReplay}>+ 재방송 추가</button></header><div className={`ai-connection-card ${aiConfigured ? "connected" : ""}`}><div><span>{aiConfigured ? "AI CONNECTED" : "AI CONNECTION"}</span><strong>{aiConfigured ? "AI 영상 분석 사용 가능" : "AI 영상 분석 연결 필요"}</strong><small>{aiConfigured ? "유튜브 주소를 넣고 분석 버튼을 바로 사용할 수 있습니다." : "Google AI Studio에서 만든 Gemini API 키를 한 번만 연결하세요."}</small></div>{isSupervisor && <div className="ai-key-controls"><input type="password" autoComplete="off" value={aiKeyInput} onChange={(event) => setAiKeyInput(event.target.value)} placeholder="Gemini API 키 입력" aria-label="Gemini API 키" /><button type="button" className="admin-primary" disabled={aiConfigBusy || !aiKeyInput.trim()} onClick={() => saveAiConfig(false)}>{aiConfigBusy ? "저장 중…" : aiConfigured ? "연결키 교체" : "AI 연결"}</button>{aiConfigured && <button type="button" className="danger" disabled={aiConfigBusy} onClick={() => confirm("AI 영상 분석 연결을 해제할까요?") && saveAiConfig(true)}>연결 해제</button>}</div>}{aiConfigMessage && <p>{aiConfigMessage}</p>}</div><div className="replay-admin-list">
      {!replays.length && <p className="live-empty-admin">등록된 재방송이 없습니다.</p>}
      {replays.map((replay, replayIndex) => { const expanded = openReplayId === replay.id; const linkedCount = replay.timeline.filter((entry) => Number(entry.productId) > 0).length; return <article key={replay.id} className={expanded ? "open" : ""}><div className="replay-admin-head"><button type="button" className="replay-admin-toggle" aria-expanded={expanded} onClick={() => setOpenReplayId(expanded ? "" : replay.id)}><span>{String(replayIndex + 1).padStart(2, "0")}</span><div><strong>{replay.title || "제목 없는 재방송"}</strong><small>{replay.date || "방송일 미등록"} · {replay.orientation === "vertical" ? "세로 9:16" : "가로 16:9"} · 상품 {linkedCount}개</small></div><b className={replay.completed ? "published" : "draft"}>{replay.completed ? "고객 공개" : "작성 중"}</b><i aria-hidden="true">⌄</i></button><label className="completion-check"><input type="checkbox" checked={replay.completed} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, completed: e.target.checked } : item))} /> 고객 공개</label><button type="button" className="danger" onClick={() => { if (confirm(`‘${replay.title || "재방송"}’을 삭제할까요?`)) { setReplays((current) => current.filter((item) => item.id !== replay.id)); if (expanded) setOpenReplayId(""); } }}>삭제</button></div>{expanded && <div className="replay-admin-body"><div className="settings-fields">
        <label>방송 제목<input value={replay.title} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, title: e.target.value } : item))} /></label>
        <label>방송일<input type="date" value={replay.date} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, date: e.target.value } : item))} /></label>
        <label className="wide">유튜브 재방송 주소<input type="url" value={replay.youtubeUrl} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, youtubeUrl: e.target.value } : item))} /></label>
        <fieldset className="wide live-orientation-field replay-orientation-field"><legend>재방송 화면 비율</legend><div className="live-orientation-options">
          <button type="button" className={(replay.orientation || "horizontal") === "horizontal" ? "active" : ""} onClick={() => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, orientation: "horizontal" } : item))}><span className="orientation-shape horizontal" aria-hidden="true" /><strong>가로 재방송 (16:9)</strong><small>넓은 영상과 상품 타임라인을 함께 보여줍니다.</small></button>
          <button type="button" className={replay.orientation === "vertical" ? "active" : ""} onClick={() => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, orientation: "vertical" } : item))}><span className="orientation-shape vertical" aria-hidden="true" /><strong>세로 재방송 (9:16)</strong><small>세로 영상 옆에 현재 상품과 탐색 구간을 배치합니다.</small></button>
        </div></fieldset>
      </div><div className="timeline-admin"><div className="timeline-admin-title"><div><strong>AI 영상 분석 초안</strong><small>AI가 상품 소개 시작 시간과 방송번호를 찾습니다. 관리자는 결과를 확인한 뒤 상품만 연결하세요.</small></div><div className="timeline-admin-actions"><button type="button" className="ai-analyze-button" disabled={analyzingReplay === replay.id} onClick={() => analyzeReplay(replay)}>{analyzingReplay === replay.id ? "영상 분석 중…" : "AI로 영상 분석"}</button><button type="button" onClick={() => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: [...item.timeline, { id: liveId("time"), time: 0, broadcastNumber: 0, productId: 0, needsReview: true }] } : item))}>+ 구간 직접 추가</button></div></div>{replayAnalysisMessage[replay.id] && <p className={`replay-analysis-status ${replayAnalysisMessage[replay.id].kind}`}>{replayAnalysisMessage[replay.id].text}</p>}{replay.analyzedAt && !replayAnalysisMessage[replay.id] && <p className="replay-analysis-status success">최근 AI 분석: {new Date(replay.analyzedAt).toLocaleString("ko-KR")} · {replay.timeline.length}개 구간</p>}{!replay.timeline.length && <p className="timeline-empty">분석 결과가 아직 없습니다. 유튜브 주소를 입력하고 ‘AI로 영상 분석’을 누르세요.</p>}{replay.timeline.map((entry) => <div className="timeline-admin-row" key={entry.id}><label>시작(초)<input type="number" min="0" value={entry.time} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: item.timeline.map((time) => time.id === entry.id ? { ...time, time: Math.max(0, Number(e.target.value)) } : time) } : item))} /></label><label>방송번호<input type="number" min="0" max="9999" value={entry.broadcastNumber || ""} placeholder="예: 27" onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: item.timeline.map((time) => time.id === entry.id ? { ...time, broadcastNumber: Math.max(0, Number(e.target.value)) } : time) } : item))} /></label><ChannelProductPicker products={activeProducts} categories={channelProductCategories} value={entry.productId} onChange={(productId) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: item.timeline.map((time) => time.id === entry.id ? { ...time, productId } : time) } : item))} /><label className="timeline-review-check"><input type="checkbox" checked={entry.needsReview} onChange={(e) => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: item.timeline.map((time) => time.id === entry.id ? { ...time, needsReview: e.target.checked } : time) } : item))} /> 확인 필요</label><button type="button" className="danger" onClick={() => setReplays((current) => current.map((item) => item.id === replay.id ? { ...item, timeline: item.timeline.filter((time) => time.id !== entry.id) } : item))}>삭제</button></div>)}</div></div>}</article>; })}
    </div></section>}

    {tab === "shorts" && <section className="settings-card"><header><span>04</span><div><h2>유튜브 쇼츠</h2><p>짧은 상품 영상을 홈에 배치하고 각 쇼츠를 상품 상세와 연결합니다.</p></div><button type="button" className="admin-primary" onClick={() => setShorts((current) => [...current, { id: liveId("short"), title: "새 쇼츠", youtubeUrl: "", productId: 0, visible: false }])}>+ 쇼츠 추가</button></header><div className="short-admin-list">
      {!shorts.length && <p className="live-empty-admin">등록된 쇼츠가 없습니다.</p>}
      {shorts.map((short, index) => <article key={short.id}><span>{index + 1}</span><label>쇼츠 제목<input value={short.title} onChange={(e) => setShorts((current) => current.map((item) => item.id === short.id ? { ...item, title: e.target.value } : item))} /></label><label>유튜브 쇼츠 주소<input type="url" value={short.youtubeUrl} onChange={(e) => setShorts((current) => current.map((item) => item.id === short.id ? { ...item, youtubeUrl: e.target.value } : item))} /></label><ChannelProductPicker products={activeProducts} categories={channelProductCategories} value={short.productId} onChange={(productId) => setShorts((current) => current.map((item) => item.id === short.id ? { ...item, productId } : item))} /><label className="completion-check"><input type="checkbox" checked={short.visible} onChange={(e) => setShorts((current) => current.map((item) => item.id === short.id ? { ...item, visible: e.target.checked } : item))} /> 고객 노출</label><button type="button" className="danger" onClick={() => setShorts((current) => current.filter((item) => item.id !== short.id))}>삭제</button></article>)}
    </div></section>}

    {tab === "products" && values.storefront_skin === "youtube" && <section className="settings-card"><header><span>05</span><div><h2>이번 방송 상품 번호표</h2><p>기본 1~50번에서 시작하지만 필요한 번호만 남기고, 원하는 번호를 한 개씩 자유롭게 추가·삭제할 수 있습니다.</p></div><button type="button" className="danger" onClick={() => confirm("이번 방송의 상품 연결을 모두 비울까요? 번호표는 유지됩니다.") && setLiveSlots([])}>상품 연결 모두 비우기</button></header>
      <div className="channel-product-pool-guide"><strong>{channel.name} 채널 상품 {activeProducts.length.toLocaleString("ko-KR")}개에서만 연결합니다.</strong><p>상품명·품번·상품코드·브랜드를 입력하면 일치하는 상품을 바로 찾습니다. 새 상품은 ‘상품·카테고리’에서 먼저 채널로 가져오세요.</p></div>
      <div className="live-slot-toolbar"><div><strong>번호표 {liveSlotNumbers.length}개</strong><span>{liveSlots.length}개 연결 · {liveSlotNumbers.length - liveSlots.length}개 비어 있음</span></div><div className="live-slot-add"><input type="number" min="1" max="9999" value={newLiveSlotNumber} onChange={(event) => setNewLiveSlotNumber(event.target.value)} placeholder={`${Math.max(0, ...liveSlotNumbers) + 1}`} aria-label="추가할 방송 번호" /><button type="button" className="admin-primary" disabled={liveSlotNumbers.length >= MAX_LIVE_SLOT_COUNT} onClick={addLiveSlotNumber}>+ 번호 추가</button></div></div>
      <div className="live-number-slot-grid">{liveSlotNumbers.map((number) => { const product = liveSlotProduct(number); return <article key={number} className={product ? "connected" : ""}><button type="button" className="live-slot-number" aria-label={`${number}번 상품 검색`}>{number}</button>{product ? <SafeProductImage src={product.image_url} alt={product.name} /> : <div className="live-slot-empty" aria-hidden="true">+</div>}<ChannelProductPicker products={activeProducts} categories={channelProductCategories} value={Number(product?.id || 0)} onChange={(productId) => connectLiveProduct(number, productId)} label={product ? "연결 상품" : "상품 검색·연결"} /><div className="live-slot-actions">{product && <button type="button" className="live-slot-clear" onClick={() => setLiveSlots((current) => current.filter((slot) => Number(slot.number) !== number))}>해제</button>}<button type="button" className="live-slot-delete" onClick={() => removeLiveSlotNumber(number)}>번호 삭제</button></div></article>; })}</div>
      {!liveSlotNumbers.length && <p className="live-empty-admin">번호표가 비어 있습니다. 위에서 원하는 번호를 추가해 주세요.</p>}
      <p className="settings-help live-important-note">같은 상품은 한 방송에서 두 번호에 연결할 수 없습니다. 방송 보조창에는 연결된 번호만 나타나며, 상품이 없는 번호를 입력하면 고객 화면은 바뀌지 않습니다.</p></section>}

    {tab === "assistant" && values.storefront_skin === "youtube" && <section className="settings-card live-assistant-launch"><header><span>06</span><div><h2>방송 진행 보조창</h2><p>진행자나 보조 인력이 상품 번호만 입력하는 별도 간편 화면입니다.</p></div></header><div><p>상품 번호 연결을 먼저 저장한 뒤 보조창을 여세요. 이 보조창은 {channel.name} 채널에만 영향을 줍니다.</p><a className="admin-primary" href={`${assistantBasePath}?channel=${encodeURIComponent(channel.slug)}`} target="_blank" rel="noreferrer">{channel.name} 방송 보조창 새 창으로 열기 ↗</a></div></section>}

    <div className="settings-save"><p>저장하면 선택한 스킨과 공개 완료된 유튜브 콘텐츠만 고객 홈에 반영됩니다.</p><button className="admin-primary">라이브 커머스 설정 저장</button></div>
  </form>;
}

function OperationsSettings({ settings, products, categories, statistics, act }: { settings: Record<string, string>; products: any[]; categories: string[]; statistics: Record<string, any>; act: (body: Record<string, unknown>, message?: string) => Promise<boolean> }) {
  const [values, setValues] = useState(settings);
  const [homeSections, setHomeSections] = useState<HomeDisplaySection[]>(() => jsonSetting(settings.home_display_sections, [
    { id: "recommended", title: "추천상품", visible: true, sort: "manual", productIds: [], order: 1 },
    { id: "new", title: "신상품", visible: true, sort: "newest", productIds: [], order: 2 },
    { id: "popular", title: "인기상품", visible: true, sort: "popular", productIds: [], order: 3 },
  ]));
  const [tiers, setTiers] = useState<MemberTier[]>(() => jsonSetting(settings.member_tiers, [
    { id: "basic", name: "일반", minSpend: 0, rewardRate: 0 },
    { id: "vip", name: "VIP", minSpend: 300000, rewardRate: 1 },
    { id: "vvip", name: "VVIP", minSpend: 1000000, rewardRate: 2 },
  ]));
  const update = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const toggle = (key: string) => update(key, values[key] === "true" ? "false" : "true");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedSections = homeSections.map((entry, index) => ({ ...entry, order: entry.order || index + 1 })).sort((a, b) => Number(a.order) - Number(b.order));
    const normalizedTiers = tiers.map((tier) => ({ ...tier, minSpend: Math.max(0, Number(tier.minSpend)), rewardRate: Math.max(0, Math.min(100, Number(tier.rewardRate))) })).sort((a, b) => a.minSpend - b.minSpend);
    await act({ action: "settings.save", values: { ...values, home_display_sections: JSON.stringify(normalizedSections), member_tiers: JSON.stringify(normalizedTiers) } }, "운영 기능 설정을 저장했습니다.");
  }
  const featureHeader = (key: string, number: string, title: string, description: string) => (
    <header><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div><button type="button" className={`feature-switch ${values[key] === "true" ? "on" : ""}`} onClick={() => toggle(key)} aria-pressed={values[key] === "true"}>{values[key] === "true" ? "사용 중" : "사용 안 함"}</button></header>
  );
  return (
    <form className="settings-layout operations-layout" onSubmit={submit}>
      <section className={`settings-card ${values.feature_shipping_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_shipping_enabled", "01", "배송 운영 설정", "배송비·무료배송·지역 추가비·교환·반품 기준을 주문에 적용합니다.")}
        <div className="settings-fields">
          <label>기본 배송비<input type="number" min="0" value={values.shipping_base_fee || "3000"} onChange={(e) => update("shipping_base_fee", e.target.value)} /></label>
          <label>무료배송 기준<input type="number" min="0" value={values.shipping_free_threshold || "50000"} onChange={(e) => update("shipping_free_threshold", e.target.value)} /></label>
          <label>지역 추가 배송비<input type="number" min="0" value={values.shipping_remote_fee || "3000"} onChange={(e) => update("shipping_remote_fee", e.target.value)} /></label>
          <label>반품 배송비<input type="number" min="0" value={values.shipping_return_fee || "6000"} onChange={(e) => update("shipping_return_fee", e.target.value)} /></label>
          <label>교환 왕복 배송비<input type="number" min="0" value={values.shipping_exchange_fee || "6000"} onChange={(e) => update("shipping_exchange_fee", e.target.value)} /></label>
          <label className="wide">추가비 우편번호 앞자리 <small>쉼표로 구분</small><input value={values.shipping_remote_prefixes || ""} onChange={(e) => update("shipping_remote_prefixes", e.target.value)} /></label>
          <label className="wide">교환·반품 주소<input value={values.shipping_return_address || ""} onChange={(e) => update("shipping_return_address", e.target.value)} /></label>
          <label>해외 출고국<input value={values.overseas_origin_country || "중국"} onChange={(e) => update("overseas_origin_country", e.target.value)} /></label>
          <label>최소 배송일(영업일)<input type="number" min="1" value={values.overseas_delivery_min_days || "7"} onChange={(e) => update("overseas_delivery_min_days", e.target.value)} /></label>
          <label>최대 배송일(영업일)<input type="number" min="1" value={values.overseas_delivery_max_days || "14"} onChange={(e) => update("overseas_delivery_max_days", e.target.value)} /></label>
          <label className="wide">판매·책임 안내<textarea rows={2} value={values.overseas_seller_notice || ""} onChange={(e) => update("overseas_seller_notice", e.target.value)} /></label>
          <label className="wide">통관 안내<textarea rows={2} value={values.overseas_customs_notice || ""} onChange={(e) => update("overseas_customs_notice", e.target.value)} /></label>
          <label className="wide">통관 지연 안내<textarea rows={2} value={values.overseas_customs_delay_notice || ""} onChange={(e) => update("overseas_customs_delay_notice", e.target.value)} /></label>
          <label className="wide">관세·부가세 안내<textarea rows={2} value={values.overseas_tax_notice || ""} onChange={(e) => update("overseas_tax_notice", e.target.value)} /></label>
          <label className="wide">해외직구 반품·환불 안내<textarea rows={3} value={values.overseas_return_notice || ""} onChange={(e) => update("overseas_return_notice", e.target.value)} /></label>
        </div>
      </section>
      <section className={`settings-card ${values.feature_home_display_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_home_display_enabled", "02", "홈 화면 진열 관리", "추천·신상품·인기상품의 노출, 제목, 순서와 상품 구성을 관리합니다.")}
        <div className="home-section-editor">
          {homeSections.map((entry, index) => <article key={entry.id}>
            <label className="checkbox-line"><input type="checkbox" checked={entry.visible} onChange={(e) => setHomeSections((current) => current.map((item, i) => i === index ? { ...item, visible: e.target.checked } : item))} /> 섹션 노출</label>
            <label>섹션 제목<input value={entry.title} onChange={(e) => setHomeSections((current) => current.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} /></label>
            <div className="two-cols"><label>진열 방식<select value={entry.sort} onChange={(e) => setHomeSections((current) => current.map((item, i) => i === index ? { ...item, sort: e.target.value } : item))}><option value="manual">직접 선택</option><option value="newest">신상품순</option><option value="popular">판매순</option></select></label><label>섹션 순서<input type="number" min="1" max="3" value={entry.order || index + 1} onChange={(e) => setHomeSections((current) => current.map((item, i) => i === index ? { ...item, order: Number(e.target.value) } : item))} /></label></div>
            <label>직접 진열 상품 <small>Ctrl 또는 ⌘를 누르면 여러 개 선택</small><select multiple size={5} value={entry.productIds.map(String)} disabled={entry.sort !== "manual"} onChange={(e) => { const ids = Array.from(e.target.selectedOptions).map((option) => Number(option.value)); setHomeSections((current) => current.map((item, i) => i === index ? { ...item, productIds: ids } : item)); }}>{products.filter((p) => p.status === "active").map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          </article>)}
        </div>
      </section>
      <section className={`settings-card ${values.feature_variant_stock_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_variant_stock_enabled", "03", "옵션별 재고 관리", "상품 편집에서 색상·사이즈 조합마다 재고, 추가금액, SKU와 품절을 관리합니다.")}
        <p className="settings-help">기능을 켜면 상품 편집의 ‘옵션·재고’에 조합별 입력표가 나타납니다. 기존 상품은 전체 재고 방식이 그대로 유지됩니다.</p>
      </section>
      <section className={`settings-card ${values.feature_member_tiers_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_member_tiers_enabled", "04", "회원등급 관리", "누적 구매액에 따라 등급과 추가 구매 적립률을 자동 적용합니다.")}
        <div className="tier-editor">{tiers.map((tier, index) => <article key={tier.id}><strong>{index + 1}단계</strong><label>등급명<input value={tier.name} onChange={(e) => setTiers((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /></label><label>누적 구매 기준<input type="number" min="0" value={tier.minSpend} onChange={(e) => setTiers((current) => current.map((item, i) => i === index ? { ...item, minSpend: Number(e.target.value) } : item))} /></label><label>추가 적립률(%)<input type="number" min="0" max="100" step="0.1" value={tier.rewardRate} onChange={(e) => setTiers((current) => current.map((item, i) => i === index ? { ...item, rewardRate: Number(e.target.value) } : item))} /></label></article>)}</div>
      </section>
      <section className={`settings-card ${values.feature_discount_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_discount_enabled", "05", "할인쿠폰·기간 할인", "정액·정률 할인쿠폰과 기간·분류별 자동 할인을 주문에 적용합니다.")}
        <div className="settings-fields">
          <label>행사명<input value={values.period_discount_name || ""} onChange={(e) => update("period_discount_name", e.target.value)} placeholder="여름 감사 할인" /></label>
          <label>자동 할인율(%)<input type="number" min="0" max="100" value={values.period_discount_rate || "0"} onChange={(e) => update("period_discount_rate", e.target.value)} /></label>
          <label>적용 분류<select value={values.period_discount_category || "전체"} onChange={(e) => update("period_discount_category", e.target.value)}><option>전체</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>시작일<input type="date" value={values.period_discount_starts_at || ""} onChange={(e) => update("period_discount_starts_at", e.target.value)} /></label>
          <label>종료일<input type="date" value={values.period_discount_ends_at || ""} onChange={(e) => update("period_discount_ends_at", e.target.value)} /></label>
        </div>
        <p className="settings-help">할인쿠폰 발급은 기존 ‘쿠폰 관리’에서 리워드 쿠폰과 할인쿠폰을 선택해 생성합니다.</p>
      </section>
      <section className={`settings-card ${values.feature_templates_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_templates_enabled", "06", "안내문 템플릿", "주문 단계에 따라 마이페이지에 표시할 고객 안내문을 수정합니다.")}
        <div className="settings-fields">{[["template_order_received", "주문 접수"], ["template_payment_confirmed", "결제 확인"], ["template_shipping", "배송 시작"], ["template_cancelled", "주문 취소"], ["template_returned", "반품 완료"]].map(([key, label]) => <label className="wide" key={key}>{label}<textarea rows={2} value={values[key] || ""} onChange={(e) => update(key, e.target.value)} /></label>)}</div>
      </section>
      <section className={`settings-card ${values.feature_statistics_enabled !== "true" ? "feature-disabled" : ""}`}>
        {featureHeader("feature_statistics_enabled", "07", "상세 운영 통계", "기간별 주문·결제·리워드·인기상품·취소·반품 현황을 집계합니다.")}
        <div className="operations-stat-grid"><article><span>최근 30일 주문</span><strong>{fmt(statistics.orders30 || 0)}건</strong></article><article><span>현금 결제</span><strong>{fmt(statistics.cash30 || 0)}원</strong></article><article><span>리워드 사용</span><strong>{fmt(statistics.points30 || 0)}P</strong></article><article><span>취소·반품률</span><strong>{Number(statistics.returnRate30 || 0).toFixed(1)}%</strong></article></div>
        {!!statistics.popularProducts?.length && <div className="statistics-ranking"><strong>최근 인기상품</strong>{statistics.popularProducts.map((item: any, index: number) => <p key={item.id}><span>{index + 1}. {item.name}</span><b>{fmt(item.quantity)}개</b></p>)}</div>}
      </section>
      <div className="settings-save"><p>꺼둔 기능은 고객 화면과 주문 계산에 영향을 주지 않으며, 저장한 설정은 그대로 보존됩니다.</p><button className="admin-primary">운영 기능 저장</button></div>
    </form>
  );
}

function EditorShell({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop"><section className="admin-editor"><header><div><span>ADMIN EDITOR</span><h2>{title}</h2></div><button className="modal-close" onClick={close}>×</button></header>{children}</section></div>;
}

function CatalogEditor({ categoryConfig, products, brands, brandGroups, close, act, busy }: { categoryConfig: StoreCategoryConfig; products: any[]; brands: string[]; brandGroups: ProductBrandGroups; close: () => void; act: any; busy: boolean }) {
  const brandKey = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleUpperCase("en-US");
  const [config, setConfig] = useState<StoreCategoryConfig>(() => JSON.parse(JSON.stringify(categoryConfig)));
  const [brandList, setBrandList] = useState(() => Array.from(new Map(brands.map((brand) => [brandKey(brand), brand] as const)).values()));
  const [brandInput, setBrandInput] = useState("");
  const [brandNotice, setBrandNotice] = useState("");
  const [brandGroupDraft, setBrandGroupDraft] = useState<ProductBrandGroups>(() => brandGroups);
  const [brandRenameDraft, setBrandRenameDraft] = useState<Record<string, string>>({});
  const [brandMoves, setBrandMoves] = useState<Array<{ from: string; to: string }>>([]);
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const newIdCounter = useRef(0);
  const countFor = (name: string) => products.filter((item: any) => item.status !== "deleted" && productMatchesCategory(item, name, config)).length;
  const directCountFor = (name: string) => products.filter((item: any) => item.status !== "deleted" && (String(item.category || "") === name || String(item.subcategory || "") === name)).length;
  const categoryVisibilityControl = (count: number, visible: boolean, onChange: (visible: boolean) => void) => {
    const empty = count === 0;
    const manuallyHidden = visible === false;
    return <label className={`catalog-visibility-control ${empty ? "automatic" : ""}`} title={empty ? "상품이 등록되면 자동으로 노출됩니다." : "체크하면 상품이 있어도 쇼핑몰에서 숨깁니다."}>
      <input type="checkbox" checked={empty || manuallyHidden} disabled={empty} onChange={(event) => onChange(!event.target.checked)} />
      <span>{empty ? "상품 없음 · 자동 숨김" : manuallyHidden ? "수동 숨김" : "노출 중"}</span>
    </label>;
  };
  const descendantNamesFor = (name: string) => {
    const parent = config.categories.find((entry) => entry.name === name);
    if (parent) return parent.children.flatMap((child) => [child.name, ...child.children.map((grandchild) => grandchild.name)]);
    const child = config.categories.flatMap((entry) => entry.children).find((entry) => entry.name === name);
    return child ? child.children.map((grandchild) => grandchild.name) : [];
  };
  const allNames = config.categories.flatMap((entry) => [entry.name, ...entry.children.flatMap((child) => [child.name, ...child.children.map((grandchild) => grandchild.name)])]).filter(Boolean);
  const newId = (prefix: string) => {
    newIdCounter.current += 1;
    return `${prefix}-new-${newIdCounter.current}`;
  };
  const updateCategory = (index: number, patch: Record<string, unknown>) => setConfig((current) => ({ ...current, categories: current.categories.map((entry, position) => position === index ? { ...entry, ...patch } : entry) }));
  const moveCategory = (index: number, direction: -1 | 1) => setConfig((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.categories.length) return current;
    const categories = [...current.categories];
    [categories[index], categories[target]] = [categories[target], categories[index]];
    return { ...current, categories };
  });
  const removeCategory = (index: number) => {
    const entry = config.categories[index];
    const used = countFor(entry.name);
    if (used) return alert(`이 분류에는 상품 ${used}개가 있습니다. 먼저 아래 '상품 분류 일괄 이동'으로 옮겨 주세요.`);
    setConfig((current) => ({ ...current, categories: current.categories.filter((_, position) => position !== index) }));
  };
  const updateChild = (categoryIndex: number, childIndex: number, patch: Record<string, unknown>) => updateCategory(categoryIndex, {
    children: config.categories[categoryIndex].children.map((child, position) => position === childIndex ? { ...child, ...patch } : child),
  });
  const removeChild = (categoryIndex: number, childIndex: number) => {
    const child = config.categories[categoryIndex].children[childIndex];
    if (countFor(child.name)) return alert(`이 하위 분류에는 상품 ${countFor(child.name)}개가 있습니다. 먼저 다른 분류로 옮겨 주세요.`);
    updateCategory(categoryIndex, { children: config.categories[categoryIndex].children.filter((_, position) => position !== childIndex) });
  };
  const moveChild = (categoryIndex: number, childIndex: number, direction: -1 | 1) => {
    const children = [...config.categories[categoryIndex].children];
    const target = childIndex + direction;
    if (target < 0 || target >= children.length) return;
    [children[childIndex], children[target]] = [children[target], children[childIndex]];
    updateCategory(categoryIndex, { children });
  };
  const brandUsageCount = (brand: string) => products.filter((item: any) => item.status !== "deleted" && brandKey(String(item.brand || "")) === brandKey(brand)).length;
  const addBrand = () => {
    const brand = brandInput.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!brand) return setBrandNotice("추가할 브랜드명을 입력해 주세요.");
    if (brand.length > 80) return setBrandNotice("브랜드명은 80자 이내로 입력해 주세요.");
    const existing = brandList.find((item) => brandKey(item) === brandKey(brand));
    if (existing) return setBrandNotice(`이미 등록된 브랜드입니다: ${existing}`);
    setBrandList((current) => [...current, brand].sort((a, b) => a.localeCompare(b, "ko")));
    setBrandGroupDraft((current) => ({ ...current, [brand]: [] }));
    setBrandInput("");
    setBrandNotice(`${brand} 브랜드를 추가했습니다. 아래에서 사용할 상품군을 선택하세요.`);
  };
  const removeBrand = (brand: string) => {
    const used = brandUsageCount(brand);
    if (used) return setBrandNotice(`${brand} 브랜드는 상품 ${used}개가 사용 중이라 삭제할 수 없습니다.`);
    setBrandList((current) => current.filter((item) => brandKey(item) !== brandKey(brand)));
    setBrandGroupDraft((current) => Object.fromEntries(Object.entries(current).filter(([name]) => brandKey(name) !== brandKey(brand))));
    setBrandNotice(`${brand} 브랜드를 목록에서 제거했습니다.`);
  };
  const applyCanonicalBrands = async () => {
    let nextBrands = [...brandList];
    let nextGroups = { ...brandGroupDraft };
    const nextMoves = [...brandMoves];
    let added = 0;
    let unified = 0;
    for (const canonical of CANONICAL_PRODUCT_BRANDS) {
      const aliasKeys = new Set(canonicalBrandAliases(canonical).map(brandKey));
      const matches = nextBrands.filter((brand) => aliasKeys.has(brandKey(brand)));
      const mergedGroups = Array.from(new Set(matches.flatMap((brand) => nextGroups[brand] || [])));
      if (!matches.length) added += 1;
      for (const match of matches) {
        if (match !== canonical) {
          nextMoves.push({ from: match, to: canonical });
          unified += 1;
        }
        delete nextGroups[match];
      }
      nextBrands = nextBrands.filter((brand) => !aliasKeys.has(brandKey(brand)));
      nextBrands.push(canonical);
      nextGroups[canonical] = Array.from(new Set([...(nextGroups[canonical] || []), ...mergedGroups]));
    }
    const finalBrands = Array.from(new Map(nextBrands.map((brand) => [brandKey(brand), brand] as const)).values()).sort((a, b) => a.localeCompare(b, "ko"));
    const finalMoves = Array.from(new Map(nextMoves.map((move) => [brandKey(move.from), move] as const)).values());
    const ok = await act(
      {
        action: "product.catalog",
        categoryConfig: config,
        brands: finalBrands,
        brandGroups: Object.fromEntries(finalBrands.map((brand) => [brand, nextGroups[brand] || []])),
        brandMoves: finalMoves,
      },
      `표준 브랜드 ${CANONICAL_PRODUCT_BRANDS.length}개를 저장했습니다. 새 브랜드 ${added}개를 추가하고 기존 표기 ${unified}개를 표준 이름으로 통합했습니다.`,
    );
    if (ok) close();
    setBrandNotice(`표준 브랜드 ${CANONICAL_PRODUCT_BRANDS.length}개를 준비했습니다. 신규 ${added}개, 기존 표기 통합 ${unified}개입니다. 아래 '목록 저장'을 눌러 완료해 주세요.`);
  };
  const moveBrand = (from: string, rawTarget: string, mode: "rename" | "merge" | "move") => {
    const target = rawTarget.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!target) return setBrandNotice("변경할 브랜드명을 입력하거나 합칠 브랜드를 선택해 주세요.");
    if (target.length > 80) return setBrandNotice("브랜드명은 80자 이내로 입력해 주세요.");
    const existing = brandList.find((item) => brandKey(item) === brandKey(target));
    if (mode === "rename" && existing && brandKey(existing) !== brandKey(from)) return setBrandNotice(`${existing} 브랜드가 이미 있습니다. 이 경우에는 '중복 브랜드 합치기'를 사용해 주세요.`);
    if (from === target) return setBrandNotice("현재 브랜드명과 같습니다.");
    const finalTarget = existing || target;
    const sourceGroups = brandGroupDraft[from] || [];
    const targetGroups = brandGroupDraft[finalTarget] || [];
    if (mode !== "move") {
      setBrandList((current) => Array.from(new Map(current.filter((item) => brandKey(item) !== brandKey(from)).concat(finalTarget).map((item) => [brandKey(item), item] as const)).values()).sort((a, b) => a.localeCompare(b, "ko")));
      setBrandGroupDraft((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([name]) => brandKey(name) !== brandKey(from)));
        next[finalTarget] = Array.from(new Set([...targetGroups, ...sourceGroups]));
        return next;
      });
    }
    setBrandMoves((current) => [...current.filter((move) => brandKey(move.from) !== brandKey(from)), { from, to: finalTarget }]);
    setBrandRenameDraft((current) => ({ ...current, [from]: "" }));
    setBrandNotice(mode === "merge" ? `${from} 상품을 ${finalTarget} 브랜드로 합치도록 예약했습니다. 아래 '목록 저장'을 눌러 완료해 주세요.` : mode === "move" ? `${from} 브랜드는 남겨두고 연결 상품만 ${finalTarget}(으)로 옮기도록 예약했습니다. 아래 '목록 저장'을 눌러 완료해 주세요.` : `${from} 브랜드명을 ${finalTarget}(으)로 변경하도록 예약했습니다. 아래 '목록 저장'을 눌러 완료해 주세요.`);
  };
  const updateGrandchild = (categoryIndex: number, childIndex: number, grandchildIndex: number, patch: Record<string, unknown>) => updateChild(categoryIndex, childIndex, {
    children: config.categories[categoryIndex].children[childIndex].children.map((grandchild, position) => position === grandchildIndex ? { ...grandchild, ...patch } : grandchild),
  });
  const removeGrandchild = (categoryIndex: number, childIndex: number, grandchildIndex: number) => {
    const grandchild = config.categories[categoryIndex].children[childIndex].children[grandchildIndex];
    const used = countFor(grandchild.name);
    if (used) return alert(`이 소분류에는 상품 ${used}개가 연결되어 있습니다. 먼저 다른 분류로 상품을 이동해 주세요.`);
    updateChild(categoryIndex, childIndex, { children: config.categories[categoryIndex].children[childIndex].children.filter((_, position) => position !== grandchildIndex) });
  };
  const moveGrandchild = (categoryIndex: number, childIndex: number, grandchildIndex: number, direction: -1 | 1) => {
    const children = [...config.categories[categoryIndex].children[childIndex].children];
    const target = grandchildIndex + direction;
    if (target < 0 || target >= children.length) return;
    [children[grandchildIndex], children[target]] = [children[target], children[grandchildIndex]];
    updateChild(categoryIndex, childIndex, { children });
  };
  async function moveProducts() {
    if (!moveFrom || !moveTo || moveFrom === moveTo) return;
    const moveCount = directCountFor(moveFrom);
    if (await act({ action: "product.category_move", from: moveFrom, to: moveTo }, `${moveCount}개 상품을 ${moveTo}(으)로 이동했습니다.`)) {
      setMoveFrom("");
      setMoveTo("");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await act(
      {
        action: "product.catalog",
        categoryConfig: config,
        brands: brandList,
        brandGroups: Object.fromEntries(brandList.map((brand) => [brand, brandGroupDraft[brand] || []])),
        brandMoves,
      },
      "상품 분류 구조와 브랜드를 저장했습니다.",
    );
    if (ok) close();
  }
  return (
    <EditorShell title="전체 상품 분류·브랜드 관리" close={close}>
      <form className="editor-form category-manager" onSubmit={submit}>
        <div className="editor-notice">
          <strong>전체 쇼핑몰의 공식 상품 분류를 최대 3단계로 관리합니다.</strong>
          <p>대분류는 신발·의류·액세서리, 중분류는 스니커즈·상의·가방, 소분류는 로우탑·티셔츠·백팩처럼 사용하세요. 필요하지 않으면 1단계나 2단계에서 끝내도 됩니다.</p>
        </div>
        <section className="catalog-editor-step"><header><span>01</span><div><strong>분류 구조</strong><p>대분류 → 중분류 → 소분류 순서로 구성합니다.</p></div></header>
        <div className="category-manager-toolbar"><label>PC 상단 노출 수<select value={config.menuLimit} onChange={(event) => setConfig((current) => ({ ...current, menuLimit: Number(event.target.value) }))}>{[5,6,7,8,9,10].map((value) => <option key={value} value={value}>{value}개 (`홈` 포함)</option>)}</select></label><button type="button" className="admin-primary" onClick={() => setConfig((current) => ({ ...current, categories: [...current.categories, { id: newId("category"), name: `새 대분류 ${current.categories.length + 1}`, visible: true, children: [] }] }))}>+ 대분류 추가</button></div>
        <div className="category-manager-list">
          {config.categories.map((entry, index) => {
            const productCount = countFor(entry.name);
            return <section className="category-manager-item" key={entry.id}>
              <div className="category-manager-row"><span className="category-order">{index + 1}</span><input aria-label={`${index + 1}번째 대분류 이름`} value={entry.name} onChange={(event) => updateCategory(index, { name: event.target.value })} maxLength={30} required /><b>{productCount.toLocaleString("ko-KR")}개 상품</b>{categoryVisibilityControl(productCount, entry.visible, (visible) => updateCategory(index, { visible }))}<button type="button" disabled={index === 0} onClick={() => moveCategory(index, -1)} aria-label="위로 이동">↑</button><button type="button" disabled={index === config.categories.length - 1} onClick={() => moveCategory(index, 1)} aria-label="아래로 이동">↓</button><button type="button" className="danger" onClick={() => removeCategory(index)}>삭제</button></div>
              <div className="category-child-list">
                {entry.children.map((child, childIndex) => <section className="category-child-group" key={child.id}>
                  <div className="category-child-row"><span>2단계</span><input aria-label={`${entry.name} 중분류 이름`} value={child.name} onChange={(event) => updateChild(index, childIndex, { name: event.target.value })} maxLength={30} required /><b>{countFor(child.name).toLocaleString("ko-KR")}개</b>{categoryVisibilityControl(countFor(child.name), child.visible, (visible) => updateChild(index, childIndex, { visible }))}<button type="button" disabled={childIndex === 0} onClick={() => moveChild(index, childIndex, -1)}>↑</button><button type="button" disabled={childIndex === entry.children.length - 1} onClick={() => moveChild(index, childIndex, 1)}>↓</button><button type="button" className="danger" onClick={() => removeChild(index, childIndex)}>삭제</button></div>
                  <div className="category-grandchild-list">{child.children.map((grandchild, grandchildIndex) => { const grandchildCount = countFor(grandchild.name); return <div className="category-grandchild-row" key={grandchild.id}><span>3단계</span><input aria-label={`${child.name} 소분류 이름`} value={grandchild.name} onChange={(event) => updateGrandchild(index, childIndex, grandchildIndex, { name: event.target.value })} maxLength={30} required /><b>{grandchildCount.toLocaleString("ko-KR")}개</b>{categoryVisibilityControl(grandchildCount, grandchild.visible, (visible) => updateGrandchild(index, childIndex, grandchildIndex, { visible }))}<button type="button" disabled={grandchildIndex === 0} onClick={() => moveGrandchild(index, childIndex, grandchildIndex, -1)}>↑</button><button type="button" disabled={grandchildIndex === child.children.length - 1} onClick={() => moveGrandchild(index, childIndex, grandchildIndex, 1)}>↓</button><button type="button" className="danger" onClick={() => removeGrandchild(index, childIndex, grandchildIndex)}>삭제</button></div>; })}<button type="button" className="add-child-button add-grandchild-button" onClick={() => updateChild(index, childIndex, { children: [...child.children, { id: newId("grandchild"), name: `새 소분류 ${child.children.length + 1}`, visible: true }] })}>+ 소분류 추가</button></div>
                </section>)}
                <button type="button" className="add-child-button" onClick={() => updateCategory(index, { children: [...entry.children, { id: newId("child"), name: `새 중분류 ${entry.children.length + 1}`, visible: true, children: [] }] })}>+ 중분류 추가</button>
              </div>
            </section>;
          })}
        </div></section>
        <section className="catalog-editor-step"><header><span>02</span><div><strong>상품 분류 일괄 이동</strong><p>분류를 삭제하기 전에 직접 연결된 상품을 다른 분류로 안전하게 옮깁니다. 상위 분류의 숫자는 하위 분류 상품을 포함한 합계입니다.</p></div></header><fieldset className="category-move-panel"><legend>이동할 분류 선택</legend><div><select value={moveFrom} onChange={(event) => { setMoveFrom(event.target.value); setMoveTo(""); }}><option value="">이전 분류 선택</option>{allNames.map((name) => <option key={name} value={name}>{name} (직접 {directCountFor(name)}개 · 하위 포함 {countFor(name)}개)</option>)}</select><span>→</span><select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}><option value="">새 분류 선택</option>{allNames.filter((name) => name !== moveFrom && !descendantNamesFor(moveFrom).includes(name)).map((name) => <option key={name} value={name}>{name}</option>)}</select><button type="button" disabled={!moveFrom || !moveTo || directCountFor(moveFrom) === 0} onClick={moveProducts}>상품 이동</button></div></fieldset></section>
        <section className="catalog-editor-step"><header><span>03</span><div><strong>브랜드·상품군 관리</strong><p>브랜드를 한 개씩 추가하고 사용할 상품 대분류를 선택합니다. 공백·대소문자만 다른 이름은 중복 등록되지 않습니다.</p></div></header>
          <div className="brand-add-panel"><label>새 브랜드명<input value={brandInput} maxLength={30} onChange={(event) => { setBrandInput(event.target.value); setBrandNotice(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addBrand(); } }} placeholder="예: NIKE" /></label><button type="button" className="admin-primary" onClick={addBrand}>브랜드 추가</button><button type="button" onClick={applyCanonicalBrands}>표준 브랜드 목록 적용</button></div>
          <p className={`brand-manager-notice ${brandNotice.startsWith("이미") || brandNotice.includes("삭제할 수") ? "warning" : ""}`} role="status">{brandNotice || `현재 ${brandList.length}개 브랜드 · 한글명과 영문명은 자동 판단하지 않으므로 공식 표기 하나만 사용하세요.`}</p>
          <div className="brand-group-matrix">
            {brandList.map((brand) => { const used = brandUsageCount(brand); const otherBrands = brandList.filter((item) => brandKey(item) !== brandKey(brand)); return <fieldset key={brandKey(brand)}><div className="brand-group-title"><strong>{brand}</strong><span>사용 상품 {used}개</span><button type="button" disabled={used > 0} onClick={() => removeBrand(brand)}>{used > 0 ? "사용 중" : "삭제"}</button></div><div>{config.categories.map((category) => { const checked = (brandGroupDraft[brand] || []).includes(category.name); return <label key={category.id}><input type="checkbox" checked={checked} onChange={(event) => setBrandGroupDraft((current) => ({ ...current, [brand]: event.target.checked ? Array.from(new Set([...(current[brand] || []), category.name])) : (current[brand] || []).filter((name) => name !== category.name) }))} /> {category.name}</label>; })}</div><div className="brand-maintenance-row"><input aria-label={`${brand} 새 브랜드명`} value={brandRenameDraft[brand] || ""} onChange={(event) => setBrandRenameDraft((current) => ({ ...current, [brand]: event.target.value }))} placeholder="새 브랜드명" /><button type="button" onClick={() => moveBrand(brand, brandRenameDraft[brand] || "", "rename")}>브랜드명 수정</button><select aria-label={`${brand} 합칠 브랜드`} defaultValue="" onChange={(event) => { if (event.target.value) moveBrand(brand, event.target.value, "merge"); }}><option value="">중복 브랜드 합치기</option>{otherBrands.map((item) => <option key={brandKey(item)} value={item}>{item}</option>)}</select><select aria-label={`${brand} 상품 이동 브랜드`} defaultValue="" onChange={(event) => { if (event.target.value) moveBrand(brand, event.target.value, "move"); }}><option value="">연결 상품만 일괄 이동</option>{otherBrands.map((item) => <option key={brandKey(item)} value={item}>{item}</option>)}</select></div></fieldset>; })}
          </div>
        </section>
        <div className="editor-actions">
          <button type="button" onClick={close}>취소</button>
          <button className="admin-primary" disabled={busy}>목록 저장</button>
        </div>
      </form>
    </EditorShell>
  );
}

function ShippingEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: "order.shipping",
        id: item.id,
        courier: form.get("courier"),
        trackingNo: form.get("trackingNo"),
        internationalTrackingNo: form.get("internationalTrackingNo"),
        deliveryStage: form.get("deliveryStage"),
        customsStatus: form.get("customsStatus"),
        status: form.get("status"),
      },
      "배송 정보를 저장했습니다.",
    );
    if (ok) close();
  }
  return (
    <EditorShell title={`${item.order_no} 배송 정보`} close={close}>
      <form className="editor-form" onSubmit={submit}>
        <div className="editor-notice">
          <strong>{item.recipient} · {item.phone}</strong>
          <p>{item.address}</p>
        </div>
        <div className="two-cols">
          <label>택배사<input name="courier" defaultValue={item.courier} placeholder="예: CJ대한통운" /></label>
          <label>운송장 번호<input name="trackingNo" defaultValue={item.tracking_no} placeholder="- 없이 입력" /></label>
        </div>
        <label>해외 운송장<input name="internationalTrackingNo" defaultValue={item.international_tracking_no || ""} /></label>
        <div className="two-cols"><label>진행 단계<select name="deliveryStage" defaultValue={item.delivery_stage || "payment_confirmed"}>{[["payment_confirmed","결제 확인"],["china_preparing","중국 출고 준비"],["china_warehouse","중국 물류센터"],["inspection","검수"],["international_shipping","국제 운송"],["korea_arrival","한국 도착"],["customs","통관"],["domestic_shipping","국내 배송"],["delivered","배송 완료"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>통관 상태<select name="customsStatus" defaultValue={item.customs_status || "waiting"}><option value="waiting">대기</option><option value="submitted">신고</option><option value="inspection">검사</option><option value="held">보류</option><option value="cleared">통관완료</option></select></label></div>
        <label>주문 상태<select name="status" defaultValue={item.status === "접수" ? "상품준비" : item.status}><option>접수</option><option>상품준비</option><option>해외배송중</option><option>통관중</option><option>국내배송중</option><option>배송완료</option></select></label>
        <label>배송 메모<textarea value={item.memo || "등록된 배송 메모가 없습니다."} readOnly /></label>
        <div className="editor-actions">
          <button type="button" onClick={close}>취소</button>
          <button className="admin-primary" disabled={busy}>배송 정보 저장</button>
        </div>
      </form>
    </EditorShell>
  );
}

function MemberEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const f = new FormData(event.currentTarget); const ok = await act({ action: "member.save", id: item?.id, name: f.get("name"), email: f.get("email"), phone: f.get("phone"), status: f.get("status"), points: Number(f.get("points")), temporaryPassword: f.get("temporaryPassword") }, item ? "회원 정보를 수정했습니다." : "회원을 등록했습니다."); if (ok) close(); }
  return <EditorShell title={item ? "회원 정보 수정" : "새 회원 등록"} close={close}><form className="editor-form" onSubmit={submit}><div className="editor-notice"><strong>일반회원 계정</strong><p>쇼핑몰 회원과 관리자 계정은 서로 분리되어 있습니다.</p></div><label>회원명<input name="name" defaultValue={item?.name} required /></label><label>이메일<input name="email" type="email" defaultValue={item?.email} required /></label><label>연락처<input name="phone" defaultValue={item?.phone} /></label><label>{item ? "새 임시 비밀번호" : "임시 비밀번호"}<input name="temporaryPassword" type="password" minLength={10} required={!item} placeholder={item ? "변경할 때만 입력" : "영문·숫자 포함 10자 이상"} /></label><label>상태<select name="status" defaultValue={item?.status ?? "active"}><option value="active">정상</option><option value="suspended">이용정지</option></select></label>{!item && <label>초기 혜택 리워드<input name="points" type="number" min="0" defaultValue="0" /></label>}<div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>저장</button></div></form></EditorShell>;
}

function PointEditor({ item, pointName, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const f = new FormData(event.currentTarget); const ok = await act({ action: "member.point", memberId: item.id, amount: Number(f.get("amount")), memo: f.get("memo") }, "리워드를 조정했습니다."); if (ok) close(); }
  return <EditorShell title={`${item.name} 회원 리워드 조정`} close={close}><form className="editor-form" onSubmit={submit}><div className="current-point"><span>현재 보유</span><strong>{fmt(item.points)} {pointName}</strong></div><label>조정 리워드 <small>지급은 양수, 차감은 음수로 입력</small><input name="amount" type="number" placeholder="예: 10000 또는 -5000" required /></label><label>조정 사유<input name="memo" placeholder="관리자 이벤트 지급" required /></label><div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>리워드 반영</button></div></form></EditorShell>;
}

function PopupEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const ok = await act({
      action: "popup.save",
      id: item?.id,
      title: f.get("title"),
      content: f.get("content"),
      buttonText: f.get("buttonText"),
      linkUrl: f.get("linkUrl"),
      imageUrl: f.get("imageUrl"),
      backgroundColor: f.get("backgroundColor"),
      width: Number(f.get("width")),
      height: Number(f.get("height")),
      positionX: Number(f.get("positionX")),
      positionY: Number(f.get("positionY")),
      target: f.get("target"),
      active: f.get("active") === "on",
      startsAt: new Date(String(f.get("startsAt"))).toISOString(),
      endsAt: new Date(String(f.get("endsAt"))).toISOString(),
    }, item ? "팝업을 수정했습니다." : "팝업을 등록했습니다.");
    if (ok) close();
  }
  const inputDate = (value: string | undefined, fallback: string) => value ? new Date(value).toISOString().slice(0, 10) : fallback;
  return <EditorShell title={item ? "팝업 수정" : "새 팝업 등록"} close={close}><form className="editor-form" onSubmit={submit}><label>팝업 제목<input name="title" defaultValue={item?.title} required /></label><label>팝업 내용<textarea name="content" defaultValue={item?.content} required /></label><label>팝업 이미지 주소<input name="imageUrl" defaultValue={item?.image_url} placeholder="https://..." /></label><div className="two-cols"><label>버튼 문구<input name="buttonText" defaultValue={item?.button_text ?? "확인"} /></label><label>연결 주소<input name="linkUrl" defaultValue={item?.link_url ?? "/"} /></label></div><div className="two-cols"><label>가로 크기(px)<input name="width" type="number" min="280" max="1200" defaultValue={item?.width ?? 420} /></label><label>세로 크기(px)<input name="height" type="number" min="240" max="900" defaultValue={item?.height ?? 460} /></label></div><div className="two-cols"><label>가로 위치(%)<input name="positionX" type="number" min="0" max="100" defaultValue={item?.position_x ?? 50} /></label><label>세로 위치(%)<input name="positionY" type="number" min="0" max="100" defaultValue={item?.position_y ?? 50} /></label></div><div className="two-cols"><label>배경색<input name="backgroundColor" type="color" defaultValue={item?.background_color ?? "#11243e"} /></label><label>링크 열기<select name="target" defaultValue={item?.target ?? "_self"}><option value="_self">현재 창</option><option value="_blank">새 창</option></select></label></div><div className="two-cols"><label>노출 시작<input name="startsAt" type="date" defaultValue={inputDate(item?.starts_at, "2026-01-01")} /></label><label>노출 종료<input name="endsAt" type="date" defaultValue={inputDate(item?.ends_at, "2035-12-31")} /></label></div><label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={item ? Boolean(item.active) : true} /> 바로 노출하기</label><div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>저장</button></div></form></EditorShell>;
}

function NoticeEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const ok = await act({ action: "notice.save", id: item?.id, title: f.get("title"), content: f.get("content"), active: f.get("active") === "on" }, item ? "공지를 수정했습니다." : "공지를 등록했습니다.");
    if (ok) close();
  }
  return <EditorShell title={item ? "공지사항 수정" : "새 공지사항"} close={close}><form className="editor-form" onSubmit={submit}><label>공지 제목<input name="title" defaultValue={item?.title} required /></label><label>공지 내용<textarea name="content" defaultValue={item?.content} rows={8} required /></label><label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={item ? Boolean(item.active) : true} /> 쇼핑몰에 바로 노출</label><div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>저장</button></div></form></EditorShell>;
}

function CouponEditor({ categories, close, act, busy }: any) {
  const [couponType, setCouponType] = useState("point");
  const [discountKind, setDiscountKind] = useState("fixed");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = String(f.get("expiresAt") ?? "");
    const ok = await act({ action: "coupon.generate", couponType, discountKind, name: f.get("name"), pointAmount: Number(f.get("pointAmount") || 0), discountValue: Number(f.get("discountValue") || 0), minimumOrder: Number(f.get("minimumOrder") || 0), targetCategory: f.get("targetCategory"), count: Number(f.get("count")), expiresAt: value ? new Date(value).toISOString() : null }, "쿠폰을 생성했습니다.");
    if (ok) close();
  }
  return <EditorShell title="쿠폰 일괄 생성" close={close}><form className="editor-form" onSubmit={submit}><div className="editor-notice"><strong>코드는 자동으로 안전하게 생성됩니다.</strong><p>포인트 쿠폰은 등록 즉시 적립되고, 할인쿠폰은 회원 보관함에 들어가 주문할 때 사용됩니다.</p></div><label>쿠폰 종류<select value={couponType} onChange={(e) => setCouponType(e.target.value)}><option value="point">포인트 지급</option><option value="discount">주문금액 할인</option></select></label><label>쿠폰명<input name="name" defaultValue="회원 혜택 쿠폰" required /></label>{couponType === "point" ? <label>지급 포인트<input name="pointAmount" type="number" min="1" defaultValue="10000" required /></label> : <><div className="two-cols"><label>할인 방식<select value={discountKind} onChange={(e) => setDiscountKind(e.target.value)}><option value="fixed">정액 할인</option><option value="percent">정률 할인</option></select></label><label>할인 값<input name="discountValue" type="number" min="1" max={discountKind === "percent" ? 100 : undefined} defaultValue={discountKind === "percent" ? "10" : "5000"} required /></label></div><div className="two-cols"><label>최소 주문금액<input name="minimumOrder" type="number" min="0" defaultValue="30000" /></label><label>적용 분류<select name="targetCategory" defaultValue="전체"><option>전체</option>{categories.map((category: string) => <option key={category}>{category}</option>)}</select></label></div></>}<div className="two-cols"><label>생성 개수<input name="count" type="number" min="1" max="100" defaultValue="10" required /></label><label>사용 만료일 <small>비우면 제한 없음</small><input name="expiresAt" type="date" /></label></div><div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>쿠폰 생성</button></div></form></EditorShell>;
}

function InquiryEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const ok = await act({ action: "inquiry.answer", id: item.id, answer: f.get("answer") }, "고객 문의에 답변했습니다.");
    if (ok) close();
  }
  return <EditorShell title="고객 문의 답변" close={close}><form className="editor-form" onSubmit={submit}><div className="editor-notice"><strong>{item.member_name} · {item.category}</strong><p>{item.title}</p></div><label>문의 내용<textarea value={item.content} readOnly rows={5} /></label><label>답변 내용<textarea name="answer" defaultValue={item.answer} rows={8} required /></label><div className="editor-actions"><button type="button" onClick={close}>취소</button><button className="admin-primary" disabled={busy}>답변 저장</button></div></form></EditorShell>;
}

function ReviewEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: "review.reply",
        id: item.id,
        adminReply: form.get("adminReply"),
      },
      "후기 답변을 저장했습니다.",
    );
    if (ok) close();
  }
  return (
    <EditorShell title="상품후기 답변" close={close}>
      <form className="editor-form" onSubmit={submit}>
        <div className="editor-notice">
          <strong>{item.product_name} · {item.member_name}</strong>
          <p>{item.order_no || "기존 후기"} · {fmt(item.reward_points || 0)} 리워드 적립</p>
        </div>
        <label>후기 제목<input value={item.title} readOnly /></label>
        <label>후기 내용<textarea value={item.content} readOnly rows={6} /></label>
        <label>판매자 답변<textarea name="adminReply" defaultValue={item.admin_reply} rows={7} placeholder="구매와 후기 작성에 대한 답변을 남겨주세요." /></label>
        <div className="editor-actions">
          <button type="button" onClick={close}>취소</button>
          <button className="admin-primary" disabled={busy}>답변 저장</button>
        </div>
      </form>
    </EditorShell>
  );
}

function AdminSelfEditor({ item, close, act, busy }: any) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: "admin_account.self_update",
        name: form.get("name"),
      },
      "관리자 이름을 수정했습니다.",
    );
    if (ok) close();
  }
  return (
    <EditorShell title="내 관리자 정보 수정" close={close}>
      <form className="editor-form" onSubmit={submit}>
        <div className="editor-notice">
          <strong>{item.username}</strong>
          <p>
            계정 아이디와 권한은 슈퍼바이저가 관리합니다. 여기서는 화면에
            표시되는 본인 이름만 수정할 수 있습니다.
          </p>
        </div>
        <label>
          관리자 이름
          <input
            name="name"
            defaultValue={item.name}
            minLength={2}
            maxLength={40}
            required
          />
        </label>
        <div className="editor-actions">
          <button type="button" onClick={close}>취소</button>
          <button className="admin-primary" disabled={busy}>이름 저장</button>
        </div>
      </form>
    </EditorShell>
  );
}

function AdminAccountEditor({ item, close, act, busy }: any) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [permissions, setPermissions] = useState<string[]>(() => storedPermissions(item));
  const isSupervisor = item?.role === "supervisor";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (password !== confirmation) {
      setFormError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const savedPermissions = permissions.includes("rewards")
      ? Array.from(new Set([...permissions, "points"]))
      : permissions;
    const ok = await act(
      {
        action: "admin_account.save",
        id: item?.id,
        name: form.get("name"),
        username: form.get("username"),
        temporaryPassword: password,
        permissions: savedPermissions,
        forcePasswordChange: form.get("forcePasswordChange") === "on",
        status: form.get("status"),
      },
      item ? "관리자 계정을 수정했습니다." : "관리자 계정을 발급했습니다.",
    );
    if (ok) {
      if (isSupervisor && password) {
        window.location.href = `/admin/login?credentialsChanged=1&username=${encodeURIComponent(String(form.get("username") || ""))}`;
        return;
      }
      close();
    }
  }

  return (
    <EditorShell
      title={isSupervisor ? "최고 관리자 아이디·비밀번호 변경" : item ? "관리자 계정 수정·재발급" : "새 관리자 계정 발급"}
      close={close}
    >
      <form className="editor-form" onSubmit={submit}>
        <div className="editor-notice">
          <strong>{isSupervisor ? "슈퍼바이저 계정" : "관리자 계정"}</strong>
          <p>{isSupervisor ? "사이트 핵심 설정과 관리자 권한을 포함한 전체 기능을 사용합니다." : "직원은 아래 아이디로 로그인하며, 선택한 기능만 사용할 수 있습니다."}</p>
        </div>
        <label>
          관리자 이름
          <input name="name" defaultValue={item?.name} minLength={2} maxLength={40} required />
        </label>
        <label>
          관리자 아이디
          <input
            name="username"
            defaultValue={item?.username}
            minLength={4}
            maxLength={40}
            pattern="[a-z0-9._-]+"
            placeholder="manager01"
            required
          />
          <small>영문 소문자·숫자·점·밑줄·하이픈 사용</small>
        </label>
        <label>
          {item ? "새 로그인 비밀번호" : "임시 비밀번호"}
          <span className="password-input-wrap">
            <input
              name="temporaryPassword"
              type={showPassword ? "text" : "password"}
              minLength={10}
              autoComplete="new-password"
              required={!item}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={item ? "변경할 때만 입력" : "영문과 숫자를 포함해 10자 이상"}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "숨기기" : "보기"}
            </button>
          </span>
          <small>
            {item
              ? isSupervisor
                ? "입력하면 비밀번호가 즉시 변경되고, 저장 후 새 정보로 다시 로그인합니다."
                : "입력하면 기존 비밀번호와 로그인 상태가 모두 초기화됩니다."
              : "직원은 첫 로그인 후 반드시 새 비밀번호로 변경합니다."}
          </small>
        </label>
        <label>
          비밀번호 확인
          <span className="password-input-wrap">
            <input
              name="passwordConfirmation"
              type={showPassword ? "text" : "password"}
              minLength={password ? 10 : undefined}
              autoComplete="new-password"
              required={Boolean(password)}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="같은 비밀번호를 한 번 더 입력"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "숨기기" : "보기"}
            </button>
          </span>
        </label>
        <label className="checkbox-line">
          <input
            name="forcePasswordChange"
            type="checkbox"
            defaultChecked={!item}
          />
          첫 로그인 후 비밀번호를 다시 변경하도록 요구
        </label>
        {!isSupervisor && (
          <fieldset className="permission-fieldset">
            <legend>관리자 허용 기능</legend>
            <p>사이트명·로고·SEO·회사정보·백업·관리자 계정 설정은 슈퍼바이저에게만 표시됩니다.</p>
            <div className="permission-grid">
              {permissionOptions.map(([key, label, description]) => (
                <label key={key} className="permission-option">
                  <input
                    type="checkbox"
                    checked={permissions.includes(key)}
                    onChange={(event) =>
                      setPermissions((current) =>
                        event.target.checked
                          ? [...current, key]
                          : current.filter((value) => value !== key),
                      )
                    }
                  />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {formError && <div className="admin-auth-error">{formError}</div>}
        <label>
          계정 상태
          <select name="status" defaultValue={item?.status ?? "active"} disabled={isSupervisor}>
            <option value="active">사용 가능</option>
            <option value="inactive">사용 중지</option>
          </select>
        </label>
        <div className="editor-actions">
          <button type="button" onClick={close}>취소</button>
          <button className="admin-primary" disabled={busy}>
            {item ? "수정 저장" : "계정 발급"}
          </button>
        </div>
      </form>
    </EditorShell>
  );
}
