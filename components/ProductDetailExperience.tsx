"use client";
/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages, @typescript-eslint/no-explicit-any */

import { FormEvent, useEffect, useMemo, useState } from "react";
import SafeProductImage from "./SafeProductImage";
import FloatingContact from "./FloatingContact";
import {
  guessProductType,
  normalizeProductType,
  PRODUCT_SPEC_FIELDS,
  PRODUCT_TYPE_OPTIONS,
} from "../lib/product-specs";

type ProductOption = { name: string; values: string[] };
type ProductVariant = { key: string; options: Record<string, string>; sku: string; stock: number; additionalPrice: number; active: boolean };
type ProductMedia = { url: string; alt: string };

type Props = {
  product: any;
  reviews: any[];
  questions: any[];
  related: any[];
  categories: string[];
  settings: Record<string, string>;
  initialMember?: any | null;
  initialWishlist?: number[];
  initialCartCount?: number;
  sourceChannelId?: number;
  sourceChannel?: any | null;
  adminPreview?: { status: string } | null;
};

const fmt = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR");

function stringList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function productMedia(product: any): ProductMedia[] {
  try {
    const parsed = JSON.parse(String(product.media_json ?? "[]"));
    if (Array.isArray(parsed) && parsed.length) {
      const media = parsed
        .map((entry, index) => {
          const url = String(typeof entry === "string" ? entry : entry?.url ?? "").trim();
          if (!url) return null;
          return {
            url,
            alt: String(
              typeof entry === "string"
                ? `${product.name} ${index + 1}`
                : entry?.alt ?? `${product.name} ${index + 1}`,
            ),
          };
        })
        .filter(Boolean) as ProductMedia[];
      if (media.length) return media;
    }
  } catch {
    // Older products continue through the legacy image fields below.
  }
  return Array.from(
    new Set([String(product.image_url), ...stringList(product.image_urls)]),
  )
    .filter(Boolean)
    .map((url, index) => ({
      url,
      alt: `${String(product.name)} ${index === 0 ? "대표사진" : index + 1}`,
    }));
}

function productOptions(value: unknown): ProductOption[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        values: Array.isArray(item?.values)
          ? item.values.map(String).map((entry: string) => entry.trim()).filter(Boolean)
          : [],
      }))
      .filter((item) => item.name && item.values.length);
  } catch {
    return [];
  }
}
function productVariants(value: unknown): ProductVariant[] {
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function productTypeFields(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string>
      : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function maskedName(value: unknown) {
  const name = String(value ?? "회원").trim();
  if (name.length < 2) return `${name || "회"}*`;
  return `${name[0]}${"*".repeat(Math.min(2, name.length - 1))}`;
}

function selectedOptionLabel(value: Record<string, string>) {
  return Object.entries(value)
    .map(([name, option]) => `${name}: ${option}`)
    .join(" · ");
}

function reviewImages(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export default function ProductDetailExperience({
  product,
  reviews,
  questions,
  related,
  categories,
  settings,
  initialMember = null,
  initialWishlist = [],
  initialCartCount = 0,
  sourceChannelId = 0,
  sourceChannel = null,
  adminPreview = null,
}: Props) {
  const media = useMemo(
    () => productMedia(product),
    [product],
  );
  const images = useMemo(() => media.map((entry) => entry.url), [media]);
  const options = useMemo(() => productOptions(product.options_json), [product.options_json]);
  const variants = useMemo(() => productVariants(product.variants_json), [product.variants_json]);
  const productType = product.product_type
    ? normalizeProductType(product.product_type)
    : guessProductType(product.category);
  const productTypeLabel = PRODUCT_TYPE_OPTIONS.find((option) => option.value === productType)?.label || "패션잡화";
  const savedTypeFields = productTypeFields(product.type_fields_json);
  const productSpecRows = PRODUCT_SPEC_FIELDS[productType]
    .map((field) => ({ label: field.label, value: String(savedTypeFields[field.key] ?? "").trim() }))
    .filter((field) => field.value);
  const [activeImage, setActiveImage] = useState(images[0]);
  const activeMedia = media.find((entry) => entry.url === activeImage) ?? media[0];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [member, setMember] = useState<any>(initialMember);
  const [wishlist, setWishlist] = useState<number[]>(initialWishlist.map(Number));
  const [cartCount, setCartCount] = useState(initialCartCount);
  const [headerSearch, setHeaderSearch] = useState("");
  const [tab, setTab] = useState<"detail" | "reviews" | "questions" | "shipping">("detail");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const isGuest = !member || member.role === "guest";

  useEffect(() => {
    if (adminPreview) return;
    fetch("/api/store", { cache: "no-store", credentials: "include" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.member) setMember(payload.member);
        if (Array.isArray(payload?.wishlist)) setWishlist(payload.wishlist.map(Number));
        if (Array.isArray(payload?.cart)) setCartCount(payload.cart.length);
      })
      .catch(() => undefined);
  }, [adminPreview]);

  const pointName = settings.point_name || "리워드";
  const channelHome = sourceChannel ? `/channel/${sourceChannel.slug}` : "/";
  const returnPath = `/products/${product.id}${sourceChannelId ? `?channel=${sourceChannelId}` : ""}`;
  const channelCategories = useMemo(() => {
    if (!sourceChannel) return [] as string[];
    try {
      const parsed = JSON.parse(String(settings.product_category_config || "{}"));
      return Array.isArray(parsed?.categories)
        ? parsed.categories.filter((entry: any) => entry?.visible !== false).map((entry: any) => String(entry.name || entry.label || "")).filter(Boolean)
        : [];
    } catch {
      return [] as string[];
    }
  }, [settings.product_category_config, sourceChannel]);
  const headerCategories = useMemo(
    () => ["홈", ...Array.from(new Set(categories.map(String).filter(Boolean)))],
    [categories],
  );
  const selectedVariant = settings.feature_variant_stock_enabled === "true" && variants.length && options.every((option) => selectedOptions[option.name]) ? variants.find((variant) => Object.entries(selectedOptions).every(([name, value]) => variant.options?.[name] === value)) : null;
  const availableStock = selectedVariant ? Number(selectedVariant.stock) : Number(product.stock);
  const outOfStock = selectedVariant ? !selectedVariant.active || availableStock < 1 : Number(product.stock) < 1;
  const wished = wishlist.includes(Number(product.id));
  const allOptionsSelected = options.every((option) => selectedOptions[option.name]);
  const effectivePrice = Number(product.point_price) + Number(selectedVariant?.additionalPrice || 0);
  const discountNow = new Date();
  const discountStart = settings.period_discount_starts_at ? new Date(`${settings.period_discount_starts_at}T00:00:00+09:00`) : null;
  const discountEnd = settings.period_discount_ends_at ? new Date(`${settings.period_discount_ends_at}T23:59:59+09:00`) : null;
  const discountApplies = settings.feature_discount_enabled === "true" &&
    Number(settings.period_discount_rate || 0) > 0 &&
    (!discountStart || discountNow >= discountStart) &&
    (!discountEnd || discountNow <= discountEnd) &&
    (String(settings.period_discount_category || "전체") === "전체" || String(settings.period_discount_category) === String(product.category));
  const discountRate = discountApplies ? Math.max(0, Math.min(100, Number(settings.period_discount_rate || 0))) : 0;
  const salePrice = Math.max(0, effectivePrice - Math.floor((effectivePrice * discountRate) / 100));
  const total = salePrice * quantity;
  const pointMode = String(product.point_usage_mode || "full");
  const pointPercent = pointMode === "none" ? 0 : pointMode === "partial" ? Math.max(1, Math.min(99, Number(product.point_max_percent || 50))) : 100;
  const paymentGuide = pointMode === "none"
    ? "현금 결제"
    : pointMode === "partial"
      ? `${pointName} 최대 ${pointPercent}% 사용 가능`
      : Boolean(product.cash_payment_enabled)
        ? `현금·${pointName}·혼합 결제 가능`
        : `${pointName} 전액 결제`;
  const rewardRate = Math.max(0, Math.min(100, Number(settings.cash_reward_rate || 0)));
  const expectedReward = Math.floor((salePrice * rewardRate) / 100);
  const shippingEnabled = settings.feature_shipping_enabled === "true";
  const freeThreshold = Number(settings.shipping_free_threshold || 0);
  const baseShippingFee = Number(settings.shipping_base_fee || 0);
  const shippingGuide = !shippingEnabled
    ? "주문서에서 배송비 확인"
    : freeThreshold > 0 && salePrice >= freeThreshold
      ? "무료배송"
      : baseShippingFee > 0
        ? freeThreshold > 0
          ? `${fmt(baseShippingFee)}원 (무료배송 ${fmt(freeThreshold)}원 이상)`
          : `${fmt(baseShippingFee)}원`
        : "무료배송";
  const brandStyle = {
    "--brand": settings.primary_color,
    "--brand-2": settings.secondary_color,
    "--accent": settings.accent_color,
  } as React.CSSProperties;

  function requireOptions() {
    if (allOptionsSelected) return true;
    setMessage("상품 옵션을 모두 선택해 주세요.");
    return false;
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/store", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      window.location.href = `/login?return_to=${encodeURIComponent(returnPath)}`;
      return null;
    }
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "요청을 처리하지 못했습니다.");
      return null;
    }
    if (payload.member) setMember(payload.member);
    if (Array.isArray(payload.wishlist)) setWishlist(payload.wishlist.map(Number));
    if (Array.isArray(payload.cart)) setCartCount(payload.cart.length);
    if (payload.partial === "cart.add") setCartCount(Number(payload.cartCount || 0));
    return payload;
  }

  function browseUrl(category = "전체") {
    const params = new URLSearchParams({ browse: "1" });
    if (category !== "전체") params.set("category", category);
    return `${channelHome}?${params.toString()}#products`;
  }

  function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = headerSearch.trim();
    if (!query) {
      window.location.href = browseUrl();
      return;
    }
    window.location.href = `${channelHome}?${new URLSearchParams({
      browse: "1",
      search: query,
    }).toString()}#products`;
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

  async function addToCart(buyNow = false) {
    if (!requireOptions()) return;
    setBusy(buyNow ? "buy" : "cart");
    setMessage("");
    const payload = await post({
      action: "cart.add",
      productId: Number(product.id),
      quantity,
      selectedOptions,
      channelId: sourceChannelId || undefined,
    });
    setBusy("");
    if (!payload) return;
    if (buyNow) {
      const matchingCart = payload.partial === "cart.add"
        ? payload.cartItem
        : [...(payload.cart || [])].reverse().find((item: any) =>
            Number(item.product_id) === Number(product.id) &&
            String(item.selected_options || "{}") === JSON.stringify(selectedOptions),
          );
      const cartId = Number(matchingCart?.id || 0);
      window.location.href = cartId ? `${channelHome}?cart=1&buy_now_cart_id=${cartId}` : `${channelHome}?cart=1`;
      return;
    }
    setMessage(
      `${selectedOptionLabel(selectedOptions) || "선택한 상품"}을 장바구니에 담았습니다.`,
    );
  }

  async function toggleWishlist() {
    setBusy("wish");
    setMessage("");
    const payload = await post({
      action: "wishlist.toggle",
      productId: Number(product.id),
    });
    setBusy("");
    if (payload) setMessage(wished ? "관심상품에서 삭제했습니다." : "관심상품에 저장했습니다.");
  }

  async function shareProduct() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: String(product.name), text: String(product.description), url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("상품 주소를 복사했습니다.");
      }
    } catch {
      // Closing the native share sheet is not an error the member needs to see.
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy("question");
    setMessage("");
    const payload = await post({
      action: "inquiry.create",
      productId: Number(product.id),
      category: "상품문의",
      title: values.get("title"),
      content: values.get("content"),
    });
    setBusy("");
    if (payload) {
      form.reset();
      setMessage("상품 문의를 접수했습니다. 관리자 답변은 이 페이지와 마이페이지에서 확인할 수 있습니다.");
    }
  }

  return (
    <div className="public-page product-view-shell" style={brandStyle}>
      {adminPreview && (
        <div className="admin-product-preview-banner" role="status">
          <div>
            <strong>관리자 전용 미리보기</strong>
            <span>
              현재 상태: {adminPreview.status === "active" ? "판매중" : adminPreview.status === "draft" ? "임시저장" : "판매중지"}
            </span>
            <small>일반 고객에게는 공개되지 않으며, 이 화면에서는 구매 기능이 잠겨 있습니다.</small>
          </div>
          <a href="/admin">상품관리로 돌아가기</a>
        </div>
      )}
      <div className="member-ribbon">
        <span>{sourceChannel ? "YOUTUBE LIVE SHOP" : "MEMBERS ONLY"}</span>
        <p>{sourceChannel ? `${sourceChannel.name}에서 고른 상품을 확인하고 바로 주문하세요.` : "현금·리워드·혼합 결제를 선택할 수 있는 회원 리워드 쇼핑몰입니다."}</p>
      </div>

      <header className={`store-header${sourceChannel ? " channel-store-header product-channel-header" : ""}`} style={sourceChannel ? { "--channel-header-color": sourceChannel.theme_color || settings.primary_color } as React.CSSProperties : undefined}>
        <div className="header-main">
          <a className={`brand-lockup${sourceChannel ? " channel-brand-lockup" : ""}`} href={channelHome} aria-label={sourceChannel ? `${sourceChannel.name} 채널 홈` : `${settings.brand_name} 홈`}>
            {sourceChannel?.image_url ? (
              <img className="channel-header-image" src={sourceChannel.avatar_image_url || sourceChannel.image_url} alt={`${sourceChannel.name} 채널`} />
            ) : settings.logo_url && !sourceChannel ? (
              <img src={settings.logo_url} alt={settings.brand_name} />
            ) : (
              <span className="brand-symbol">{sourceChannel ? String(sourceChannel.name || "채널").slice(0, 2) : settings.logo_text || "PG"}</span>
            )}
            <span className="brand-copy">
              <strong>{sourceChannel ? sourceChannel.name : settings.brand_name}</strong>
              <small>{sourceChannel ? `${sourceChannel.operator_name || sourceChannel.name}의 라이브 쇼핑 채널` : settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small>
            </span>
          </a>

          <form className="search-box" role="search" onSubmit={searchProducts}>
            <span aria-hidden="true">⌕</span>
            <input
              value={headerSearch}
              onChange={(event) => setHeaderSearch(event.target.value)}
              placeholder={sourceChannel ? `${sourceChannel.name} 상품을 검색하세요` : "어떤 선물을 찾고 계세요?"}
              aria-label="상품 검색"
            />
          </form>

          <nav className="header-actions" aria-label="회원 메뉴">
            {!member || member.role === "guest" ? (
              <a
                href={`/login?return_to=${encodeURIComponent(returnPath)}`}
                className="login-action"
              >
                <span>○</span>
                <small>회원 로그인</small>
              </a>
            ) : (
              <>
                <a href={`${channelHome}?account=orders`}>
                  <span>○</span>
                  <small>마이페이지</small>
                </a>
                <a href={`${channelHome}?cart=1`} className="cart-button">
                  <span>▢</span>
                  <small>장바구니</small>
                  {cartCount > 0 && <b>{cartCount}</b>}
                </a>
                <button type="button" onClick={logout}>
                  <span>↪</span>
                  <small>로그아웃</small>
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="category-bar">
          <nav aria-label={sourceChannel ? "채널 메뉴" : "상품 카테고리"}>
            {(sourceChannel ? ["홈", "라이브", "다시보기", "쇼츠", "다른 채널", "상품", "이용안내"] : headerCategories).map((category) => (
              <a
                className={sourceChannel ? category === "상품" ? "active" : "" : category === String(product.category) ? "active" : ""}
                href={sourceChannel
                  ? category === "홈" ? channelHome : category === "라이브" ? `${channelHome}#youtube-live` : category === "다시보기" ? `${channelHome}#youtube-replays` : category === "쇼츠" ? `${channelHome}#youtube-shorts` : category === "다른 채널" ? `${channelHome}#other-channels` : category === "상품" ? `${channelHome}#products` : "/guide"
                  : category === "홈" ? "/" : browseUrl(category)}
                key={category}
              >
                {category}
              </a>
            ))}
          </nav>
          <div className="point-pill">
            {!member || member.role === "guest" ? (
              <a href={`/login?return_to=${encodeURIComponent(returnPath)}`}>
                로그인하고 리워드 혜택 받기 →
              </a>
            ) : (
              <>
                <span>{member.name}님</span>
                <strong>{fmt(member.points)}</strong>
                <em>{pointName}</em>
              </>
            )}
          </div>
        </div>
        {sourceChannel && channelCategories.length > 0 ? <div className="product-channel-categories"><span>채널 상품 카테고리</span><nav aria-label={`${sourceChannel.name} 상품 카테고리`}><a href={`${channelHome}?browse=1#products`}>전체 상품</a>{channelCategories.map((category) => <a href={browseUrl(category)} key={category}>{category}</a>)}</nav></div> : null}
      </header>

      <main className="product-detail-page">
        <nav className="breadcrumb" aria-label="현재 위치">
          <a href={channelHome}>{sourceChannel ? sourceChannel.name : "홈"}</a><span>›</span><a href={browseUrl(String(product.category))}>{String(product.category)}</a>
          <span>›</span><b>{String(product.name)}</b>
        </nav>
        {sourceChannel ? <a className="channel-return-link" href={channelHome}>← {sourceChannel.name} 채널로 돌아가기</a> : null}

        <section className="product-detail-hero">
          <div className="product-gallery">
            {images.length > 1 && (
              <div className="product-thumbnails" aria-label="상품 이미지 선택">
                {media.map((image, index) => (
                  <button
                    type="button"
                    className={activeImage === image.url ? "active" : ""}
                    onClick={() => setActiveImage(image.url)}
                    key={`${image.url}-${index}`}
                    aria-label={`${index + 1}번째 상품 이미지 보기`}
                  >
                    <SafeProductImage src={image.url} alt={image.alt} />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="product-detail-image"
              onClick={() => setLightboxOpen(true)}
              aria-label="상품 이미지 크게 보기"
            >
              <SafeProductImage src={activeImage} alt={activeMedia?.alt || String(product.name)} />
              {product.badge && <span>{String(product.badge)}</span>}
              <small>⌕ 크게 보기</small>
            </button>
          </div>

          <div className="product-detail-copy">
            <div className="product-top-meta">
              <span>{String(product.category).toUpperCase()} SELECTION</span>
              <button type="button" onClick={shareProduct}>공유</button>
            </div>
            {product.brand && <span className="product-detail-brand">{String(product.brand)}</span>}
            <h1>{String(product.name)}</h1>
            {product.name_en && <p className="product-detail-name-en">{String(product.name_en)}</p>}
            <p>{String(product.description)}</p>
            <div className="product-detail-rating">
              <a href="#product-information" onClick={() => setTab("reviews")}>
                ★ {Number(product.rating).toFixed(1)} <span>후기 {String(product.review_count)}개</span>
              </a>
              <a href="#product-information" onClick={() => setTab("questions")}>
                상품문의 {questions.length}개
              </a>
            </div>
            <dl>
              <div><dt>판매가</dt><dd>{discountRate > 0 && <del className="detail-regular-price">{fmt(effectivePrice)}원</del>} <strong>{fmt(salePrice)}</strong>원</dd></div>
              <div><dt>결제 혜택</dt><dd>{paymentGuide}</dd></div>
              {expectedReward > 0 && <div><dt>예상 적립</dt><dd>현금 결제 시 최대 <strong>{fmt(expectedReward)}</strong> {pointName}</dd></div>}
              {product.product_code && <div><dt>상품 코드</dt><dd>{String(product.product_code)}</dd></div>}
              {product.style_number && <div><dt>품번</dt><dd>{String(product.style_number)}</dd></div>}
              <div><dt>배송</dt><dd>{shippingGuide}</dd></div>
              <div><dt>재고 상태</dt><dd className={outOfStock ? "stock-out" : ""}>{outOfStock ? "품절" : `${fmt(availableStock)}개 남음`}</dd></div>
            </dl>

            {!!options.length && (
              <div className="product-option-list">
                {options.map((option) => (
                  <label key={option.name}>
                    <span>{option.name}</span>
                    <select
                      value={selectedOptions[option.name] ?? ""}
                      onChange={(event) =>
                        setSelectedOptions((current) => ({
                          ...current,
                          [option.name]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{option.name} 선택</option>
                      {option.values.map((value) => <option value={value} key={value}>{value}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}

            <div className="product-purchase-summary">
              <div className="detail-quantity">
                <span>수량</span>
                <div>
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                  <b>{quantity}</b>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(availableStock, value + 1))} disabled={outOfStock}>+</button>
                </div>
              </div>
              <div><span>총 상품금액</span><strong>{fmt(total)} <small>원</small></strong></div>
            </div>

            <div className="product-detail-actions" id="purchase">
              <button type="button" className={wished ? "wish active" : "wish"} onClick={toggleWishlist} disabled={Boolean(busy) || Boolean(adminPreview)}>
                {adminPreview ? "미리보기" : isGuest ? "로그인 후 관심상품" : wished ? "♥ 관심상품 저장됨" : "♡ 관심상품"}
              </button>
              <button type="button" className="cart" onClick={() => addToCart(false)} disabled={Boolean(busy) || outOfStock || Boolean(adminPreview)}>
                {adminPreview ? "구매 기능 잠김" : outOfStock ? "품절" : busy === "cart" ? "담는 중..." : isGuest ? "로그인 후 장바구니" : "장바구니"}
              </button>
              <button type="button" className="buy" onClick={() => addToCart(true)} disabled={Boolean(busy) || outOfStock || Boolean(adminPreview)}>
                {adminPreview ? "관리자 미리보기" : outOfStock ? "구매 불가" : busy === "buy" ? "준비 중..." : isGuest ? "로그인 후 구매" : "바로구매"}
              </button>
            </div>
            {isGuest && !adminPreview && <p className="guest-purchase-guide"><strong>회원 전용 구매</strong><span>로그인하면 리워드 사용·적립과 주문·배송 조회를 이용할 수 있습니다.</span></p>}
            {member && member.role !== "guest" && (
              <p className="member-point-balance">보유 리워드 <strong>{fmt(member.points)} {pointName}</strong></p>
            )}
            <p className="detail-safe-note">결제수단은 장바구니 마지막 단계에서 선택하며, 혼합결제 리워드는 현금 확인 전까지 예약됩니다.</p>
            {message && <p className="product-action-message" aria-live="polite">{message}</p>}
          </div>
        </section>

        <section className="detail-information" aria-label="구매 안내">
          <article><span>01</span><h2>결제수단 선택</h2><p>리워드 전액·무통장입금·카카오톡 송금·혼합 결제를 주문서에서 선택합니다.</p></article>
          <article><span>02</span><h2>재고 연동</h2><p>관리자가 등록한 실제 판매 상태와 남은 수량을 반영합니다.</p></article>
          <article><span>03</span><h2>주문·배송 추적</h2><p>마이페이지에서 접수부터 운송장과 배송 완료까지 확인합니다.</p></article>
        </section>

        <section className="product-information" id="product-information">
          <nav className="product-tabs" aria-label="상품 상세 메뉴">
            <button className={tab === "detail" ? "active" : ""} onClick={() => setTab("detail")}>상품정보</button>
            <button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>후기 <b>{reviews.length}</b></button>
            <button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>상품문의 <b>{questions.length}</b></button>
            <button className={tab === "shipping" ? "active" : ""} onClick={() => setTab("shipping")}>배송·교환</button>
          </nav>

          {tab === "detail" && (
            <article className="product-detail-content">
              <span>PRODUCT INFORMATION</span>
              <h2>{String(product.name)}</h2>
              <p>{String(product.detail_content || product.description)}</p>
              <dl>
                <div><dt>상품명</dt><dd>{String(product.name)}</dd></div>
                {product.name_en && <div><dt>영문 상품명</dt><dd>{String(product.name_en)}</dd></div>}
                <div><dt>분류</dt><dd>{String(product.category)}</dd></div>
                <div><dt>상품 종류</dt><dd>{productTypeLabel}</dd></div>
                {product.subcategory && <div><dt>세부 분류</dt><dd>{String(product.subcategory)}</dd></div>}
                <div><dt>브랜드</dt><dd>{String(product.brand || "브랜드 미지정")}</dd></div>
                {product.product_code && <div><dt>상품 코드</dt><dd>{String(product.product_code)}</dd></div>}
                {product.style_number && <div><dt>품번</dt><dd>{String(product.style_number)}</dd></div>}
                <div><dt>구성</dt><dd>{options.length ? options.map((item) => item.name).join(", ") : "단일 상품"}</dd></div>
                {productSpecRows.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
              </dl>
            </article>
          )}

          {tab === "reviews" && (
            <div className="detail-review-panel">
              <header>
                <div><span>MEMBER REVIEWS</span><h2>실제 주문 회원 후기</h2></div>
                <strong>★ {Number(product.rating).toFixed(1)}</strong>
              </header>
              <div className="detail-review-list">
                {reviews.map((review) => (
                  <article key={String(review.id)}>
                    <div><span>{"★".repeat(Number(review.rating))}</span><time>{new Date(String(review.created_at)).toLocaleDateString("ko-KR")}</time></div>
                    <b className="verified-review">구매완료 후기</b>
                    <h3>{String(review.title)}</h3>
                    <p>{String(review.content)}</p>
                    {!!reviewImages(review.image_urls).length && (
                      <div className="detail-review-images">
                        {reviewImages(review.image_urls).map((url) => (
                          <img src={url} alt="구매회원 후기 사진" key={url} />
                        ))}
                      </div>
                    )}
                    <small>{maskedName(review.member_name)} 회원</small>
                    {review.admin_reply && (
                      <div className="review-admin-reply">
                        <strong>판매자 답변</strong>
                        <p>{String(review.admin_reply)}</p>
                      </div>
                    )}
                  </article>
                ))}
                {!reviews.length && <p className="empty-state">아직 등록된 후기가 없습니다. 배송완료 후 첫 후기를 남겨주세요.</p>}
              </div>
            </div>
          )}

          {tab === "questions" && (
            <div className="product-question-panel">
              <div className="product-question-list">
                {questions.map((question) => (
                  <article key={String(question.id)}>
                    <header><span className={question.status === "답변완료" ? "answered" : ""}>{String(question.status)}</span><time>{new Date(String(question.created_at)).toLocaleDateString("ko-KR")}</time></header>
                    <h3>Q. {String(question.title)}</h3>
                    <p>{String(question.content)}</p>
                    {question.answer && <div><strong>A. 관리자 답변</strong><p>{String(question.answer)}</p></div>}
                    <small>{maskedName(question.member_name)} 회원</small>
                  </article>
                ))}
                {!questions.length && <p className="empty-state">등록된 상품 문의가 없습니다.</p>}
              </div>
              <form className="product-question-form" onSubmit={submitQuestion}>
                <span>PRODUCT Q&amp;A</span>
                <h2>상품 문의하기</h2>
                <p>상품 구성, 옵션, 배송에 관해 문의해 주세요. 회원 로그인 후 등록할 수 있습니다.</p>
                <label>제목<input name="title" required placeholder="문의 제목" /></label>
                <label>내용<textarea name="content" rows={5} required placeholder="궁금한 내용을 자세히 적어주세요." /></label>
                <button disabled={Boolean(busy)}>{busy === "question" ? "접수 중..." : "문의 등록"}</button>
              </form>
            </div>
          )}

          {tab === "shipping" && (
            <article className="shipping-information">
              <span>DELIVERY &amp; RETURNS</span>
              <h2>중국 판매자 해외직구 배송·반품 안내</h2>
              <div className="overseas-policy-grid">
                <section><strong>판매·책임 구조</strong><p>{settings.overseas_seller_notice || "중국 현지 판매자가 상품을 공급·발송하며 플랫폼이 결제, 배송 진행, 고객상담과 환불 절차를 관리합니다."}</p></section>
                <section><strong>예상 배송기간</strong><p>결제 확인 후 영업일 기준 {settings.overseas_delivery_min_days || "7"}~{settings.overseas_delivery_max_days || "14"}일입니다. {settings.overseas_customs_delay_notice}</p></section>
                <section><strong>통관정보</strong><p>{settings.overseas_customs_notice}</p></section>
                <section><strong>관세·부가세</strong><p>{settings.overseas_tax_notice}</p></section>
                <section><strong>취소·반품·환불</strong><p>{settings.overseas_return_notice}</p></section>
              </div>
              <p className="product-shipping-detail">{String(product.shipping_info || "상품별 추가 배송 안내가 있는 경우 주문 전에 별도로 표시합니다.")}</p>
            </article>
          )}
        </section>

        {!!related.length && (
          <section className="related-products">
            <header><span>MORE TO EXPLORE</span><h2>함께 보기 좋은 상품</h2></header>
            <div>
              {related.map((item) => (
                <a key={String(item.id)} href={`/products/${item.id}${sourceChannelId ? `?channel=${sourceChannelId}` : ""}`}>
                  <SafeProductImage src={String(item.image_url)} alt={String(item.name)} />
                  <small>{String(item.brand || item.category)}</small>
                  <strong>{String(item.name)}</strong>
                  <span>{fmt(item.point_price)}원</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="simple-footer">© {new Date().getFullYear()} {settings.brand_name}. 회원 리워드 쇼핑몰.</footer>

      {lightboxOpen && (
        <div className="product-lightbox" role="dialog" aria-modal="true" aria-label="상품 이미지 크게 보기" onClick={() => setLightboxOpen(false)}>
          <button type="button" aria-label="닫기" onClick={() => setLightboxOpen(false)}>×</button>
          <SafeProductImage
            src={activeImage}
            alt={activeMedia?.alt || String(product.name)}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      <FloatingContact settings={settings} />
    </div>
  );
}
