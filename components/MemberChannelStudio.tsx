"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { ChannelManager, LiveCommerceSettings } from "./AdminDashboard";
import { MemberChannelPanel } from "./Storefront";

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value || "")) as T; } catch { return fallback; }
}

function makeDraft(channel: any, member: any) {
  const broadcast = parseJson<Record<string, any>>(channel?.broadcast_settings, {});
  const approvedCategories = parseJson<any[]>(channel?.category_settings, []);
  const requests = Array.isArray(broadcast.member_category_requests) ? broadcast.member_category_requests : parseJson<any[]>(broadcast.member_category_requests, []);
  const latestPending = [...requests].reverse().find((item) => item.status === "pending");
  return {
    name: String(channel?.name || ""), operatorName: String(channel?.operator_name || member?.name || ""),
    description: String(channel?.description || ""), youtubeUrl: String(channel?.youtube_url || ""),
    broadcastTitle: String(broadcast.youtube_live_title || ""), broadcastNotice: String(broadcast.youtube_live_notice || ""),
    liveEnabled: String(broadcast.youtube_live_enabled || "false") === "true",
    liveOrientation: String(broadcast.youtube_live_orientation || "horizontal"),
    liveSlotNumbers: parseJson<number[]>(broadcast.youtube_live_slot_numbers, []),
    liveSlots: parseJson<any[]>(broadcast.youtube_live_slots, []),
    productIds: String(channel?.product_ids || "").split(",").map(Number).filter(Boolean),
    categorySettings: latestPending?.categories || approvedCategories,
    replays: parseJson<any[]>(broadcast.youtube_replays, []), shorts: parseJson<any[]>(broadcast.youtube_shorts, []),
    contactSettings: parseJson<Record<string, any>>(channel?.contact_settings, {}),
  };
}

export default function MemberChannelStudio() {
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState("overview");
  const [catalogProducts, setCatalogProducts] = useState<any[] | null>(null);
  const [catalogSettings, setCatalogSettings] = useState<Record<string, string> | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  async function load() {
    const response = await fetch("/api/store", { cache: "no-store", credentials: "include" });
    if (response.status === 401) { window.location.href = "/login?return_to=%2Fmy-channel"; return; }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "채널 정보를 불러오지 못했습니다.");
    if (payload.member?.role === "guest") { window.location.href = "/login?return_to=%2Fmy-channel"; return; }
    setData(payload); setDraft(makeDraft(payload.memberChannel, payload.member));
  }

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, []);

  useEffect(() => {
    if (workspaceTab !== "catalog" || catalogProducts || catalogLoading) return;
    setCatalogLoading(true);
    setMessage("");
    void fetch("/api/store?scope=channel-catalog", { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "채널 상품 분류 자료를 불러오지 못했습니다.");
        setCatalogProducts(Array.isArray(payload.products) ? payload.products : []);
        setCatalogSettings(payload.settings || {});
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "채널 상품 분류 자료를 불러오지 못했습니다."))
      .finally(() => setCatalogLoading(false));
  }, [workspaceTab, catalogProducts, catalogLoading]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(String(body.action || "save")); setMessage("");
    try {
      const currentChannel = data?.memberChannel || {};
      const currentBroadcast = parseJson<Record<string, any>>(currentChannel.broadcast_settings, {});
      const currentContact = parseJson<Record<string, any>>(currentChannel.contact_settings, {});
      let requestBody = body;
      if (body.action === "channel.save") {
        requestBody = {
          action: "channel.member.save",
          name: body.name, operatorName: body.operatorName, description: body.description, youtubeUrl: body.youtubeUrl,
          imageUrl: body.imageUrl, avatarImageUrl: body.avatarImageUrl, originalImageUrl: body.originalImageUrl, themeColor: body.themeColor,
          broadcastTitle: currentBroadcast.youtube_live_title || "", broadcastNotice: currentBroadcast.youtube_live_notice || "",
          liveEnabled: String(currentBroadcast.youtube_live_enabled || "false") === "true", liveOrientation: currentBroadcast.youtube_live_orientation || "horizontal",
          liveSlotNumbers: parseJson(currentBroadcast.youtube_live_slot_numbers, []), liveSlots: parseJson(currentBroadcast.youtube_live_slots, []),
          productIds: body.productIds || [], replays: parseJson(currentBroadcast.youtube_replays, []), shorts: parseJson(currentBroadcast.youtube_shorts, []),
          contactSettings: body.contactSettings || currentContact,
        };
      } else if (body.action === "live.save") {
        const values = (body.values || {}) as Record<string, any>;
        requestBody = {
          action: "channel.member.save",
          name: currentChannel.name, operatorName: currentChannel.operator_name, description: currentChannel.description,
          youtubeUrl: values.youtube_live_url || currentChannel.youtube_url || "",
          imageUrl: currentChannel.image_url, avatarImageUrl: currentChannel.avatar_image_url, originalImageUrl: currentChannel.original_image_url, themeColor: currentChannel.theme_color,
          broadcastTitle: values.youtube_live_title || "", broadcastNotice: values.youtube_live_notice || "",
          liveEnabled: String(values.youtube_live_enabled || "false") === "true", liveOrientation: values.youtube_live_orientation || "horizontal",
          liveSlotNumbers: parseJson(values.youtube_live_slot_numbers, []), liveSlots: parseJson(values.youtube_live_slots, []),
          productIds: String(currentChannel.product_ids || "").split(",").map(Number).filter(Boolean),
          replays: parseJson(values.youtube_replays, []), shorts: parseJson(values.youtube_shorts, []), contactSettings: currentContact,
        };
      }
      const response = await fetch("/api/store", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      if (body.action === "channel.save" && workspaceTab === "catalog" && Array.isArray(body.categorySettings)) {
        const categoryResponse = await fetch("/api/store", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "channel.category.request", categories: body.categorySettings }) });
        const categoryPayload = await categoryResponse.json();
        if (!categoryResponse.ok) throw new Error(categoryPayload.error || "카테고리 검토를 요청하지 못했습니다.");
      }
      setMessage(success);
      if (payload.memberChannel) setData((current: any) => ({ ...current, memberChannel: payload.memberChannel }));
      await load();
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); return false; }
    finally { setBusy(""); }
  }

  async function logout() {
    await fetch("/api/member-auth", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = channelHref;
  }

  const channel = data?.memberChannel;
  const broadcast = useMemo(() => parseJson<Record<string, any>>(channel?.broadcast_settings, {}), [channel?.broadcast_settings]);
  const categoryRequests = Array.isArray(broadcast.member_category_requests) ? broadcast.member_category_requests : parseJson<any[]>(broadcast.member_category_requests, []);
  const latestRequest = categoryRequests.at(-1);
  if (!data) return <main className="channel-studio-loading"><p>{message || "채널 관리 화면을 준비하고 있습니다."}</p></main>;

  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return act({ action: "channel.member.save", ...draft, categorySettings: undefined }, "채널 설정을 저장했습니다."); };
  const apply = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); return act({ action: "channel.apply", name: form.get("name"), applicationMessage: form.get("applicationMessage") }, "채널 개설을 신청했습니다."); };
  const requestCategoryReview = async () => {
    const categories = [...(draft.categorySettings || [])];
    const saved = await act({ action: "channel.member.save", ...draft, categorySettings: undefined }, "채널 상품 선택을 먼저 저장했습니다.");
    if (saved) await act({ action: "channel.category.request", categories }, "카테고리 변경 검토를 요청했습니다.");
  };

  const channelHref = channel?.slug ? `/channel/${channel.slug}` : "/";
  const channelColor = channel?.theme_color || data.settings?.primary_color || "#102846";
  const memberSettings = { ...data.settings, ...broadcast, storefront_skin: "youtube" };
  const workspaceItems = [
    ["overview", "채널 홈"], ["basic", "기본정보"], ["live", "생방송"], ["products", "방송 상품"],
    ["replays", "다시보기"], ["shorts", "쇼츠"], ["catalog", "상품·카테고리"], ["assistant", "방송 보조창"], ["stats", "통계"],
  ];
  return <div className="store-shell channel-studio-store-shell" style={{ "--channel-header-color": channelColor } as CSSProperties}>
    <div className="member-ribbon"><span>YOUTUBE LIVE SHOP</span><p>유튜브에서 보고, 리워드 쇼핑몰에서 바로 주문하세요.</p></div>
    <header className="store-header channel-store-header channel-studio-store-header">
      <div className="header-main">
        <a className="brand-lockup channel-brand-lockup" href={channelHref} aria-label={`${channel?.name || "채널"} 홈`}>
          {channel?.avatar_image_url || channel?.image_url ? <img className="channel-header-image" src={channel.avatar_image_url || channel.image_url} alt={`${channel.name} 채널`} /> : <span className="brand-symbol">{String(channel?.name || "채널").slice(0, 2)}</span>}
          <span className="brand-copy"><strong>{channel?.name || "내 방송 채널"}</strong><small>{channel?.operator_name || data.member?.name || "운영자"}의 라이브 쇼핑 채널</small></span>
        </a>
        <label className="search-box channel-studio-search"><span>⌕</span><input readOnly placeholder={`${channel?.name || "채널"} 상품을 검색하세요`} aria-label="채널 상품 검색 안내" /></label>
        <nav className="header-actions" aria-label="회원 메뉴">
          <a href="/?account=orders"><span>◯</span><small>마이페이지</small></a>
          <a href="/?cart=1" className="cart-button"><span>□</span><small>장바구니</small>{data.cart?.length > 0 && <b>{data.cart.length}</b>}</a>
          <button type="button" onClick={logout}><span>↪</span><small>로그아웃</small></button>
        </nav>
      </div>
      <div className="category-bar"><nav className="youtube-main-menu" aria-label="채널 메뉴">
        <a href={`${channelHref}#youtube-home`}>홈</a><a href={`${channelHref}#youtube-live`}>라이브</a><a href={`${channelHref}#youtube-replays`}>다시보기</a><a href={`${channelHref}#youtube-shorts`}>쇼츠</a><a href={`${channelHref}#products`}>상품</a><a href="/guide">이용안내</a><a className="channel-owner-menu active" href="/my-channel" aria-current="page">내 채널 관리</a>
      </nav><div className="point-pill"><span>{data.member?.name}님</span><strong>{Number(data.member?.points || 0).toLocaleString("ko-KR")}</strong><em>{data.settings?.point_name || "코인"}</em></div></div>
    </header>
    <main className="channel-studio-shell channel-studio-embedded">
      {message && <div className="channel-studio-message" role="status">{message}</div>}
      {latestRequest && <div className={`channel-category-status ${latestRequest.status || "pending"}`}><strong>카테고리 검토: {latestRequest.status === "approved" ? "승인" : latestRequest.status === "rejected" ? "반려" : "관리자 확인 중"}</strong>{latestRequest.note && <p>{latestRequest.note}</p>}</div>}
      <section className="channel-studio-mobile"><h2>모바일 간편 관리</h2><p>복잡한 생방송 설정·상품 연결·다시보기 편집은 오류를 막기 위해 PC에서만 제공합니다.</p><div><a href={channelHref}>내 채널 확인</a><a href="/">쇼핑몰로 돌아가기</a></div></section>
      <section className="channel-studio-desktop" aria-label={`${channel?.name || "내 채널"} 관리`}>
        {!channel ? <MemberChannelPanel channel={channel} products={data.products || []} draft={draft} setDraft={setDraft} busy={busy} apply={apply} save={save} requestPublication={() => act({ action: "channel.publication.request" }, "채널 공개 검수를 요청했습니다.")} requestCategories={requestCategoryReview} /> : <>
          <nav className="live-workspace-tabs member-shared-admin-tabs" aria-label="내 채널 관리 메뉴">
            {workspaceItems.map(([key, label]) => <button type="button" key={key} className={workspaceTab === key ? "active" : ""} onClick={() => setWorkspaceTab(key)}>{label}</button>)}
          </nav>
          {workspaceTab === "overview" && <section className="settings-card live-workspace-overview"><header><span>CHANNEL HOME</span><div><h2>{channel.name} 방송 운영 현황</h2><p>최고 관리자와 같은 기준으로 채널 상태와 필요한 작업을 확인합니다.</p></div></header><div className="channel-live-statistics"><article><span>페이지 열람</span><strong>{Number(channel.view_count || 0).toLocaleString("ko-KR")}회</strong></article><article><span>연결 상품</span><strong>{Number(channel.product_count || 0).toLocaleString("ko-KR")}개</strong></article><article><span>공개 다시보기</span><strong>{parseJson<any[]>(broadcast.youtube_replays, []).filter((item) => item.completed).length}개</strong></article><article><span>공개 쇼츠</span><strong>{parseJson<any[]>(broadcast.youtube_shorts, []).filter((item) => item.visible !== false).length}개</strong></article></div></section>}
          {workspaceTab === "basic" && <ChannelManager channels={[channel]} products={data.products || []} settings={data.settings || {}} act={act} initialChannelId={Number(channel.id)} selectedOnly editorScope="basic" isSupervisor={false} />}
          {workspaceTab === "catalog" && (catalogProducts
            ? <ChannelManager channels={[channel]} products={catalogProducts} settings={{ ...(data.settings || {}), ...(catalogSettings || {}) }} act={act} initialChannelId={Number(channel.id)} selectedOnly editorScope="catalog" isSupervisor={false} />
            : <section className="settings-card channel-catalog-loading"><strong>상품·카테고리 자료를 준비하고 있습니다.</strong><p>이 메뉴를 열 때만 전체 상품의 가벼운 분류 정보를 불러옵니다.</p></section>)}
          {["live", "products", "replays", "shorts", "assistant"].includes(workspaceTab) && <LiveCommerceSettings key={`${channel.id}-${workspaceTab}`} channel={channel} settings={memberSettings} products={data.products || []} act={act} isSupervisor={false} initialTab={workspaceTab} hideNavigation assistantBasePath="/my-channel/live-assistant" />}
          {workspaceTab === "stats" && <section className="settings-card live-workspace-overview"><header><span>STATISTICS</span><div><h2>{channel.name} 채널 통계</h2><p>채널에 귀속된 열람·상품·주문·판매액을 확인합니다.</p></div></header><div className="channel-live-statistics"><article><span>페이지 열람</span><strong>{Number(channel.view_count || 0).toLocaleString("ko-KR")}회</strong></article><article><span>연결 상품</span><strong>{Number(channel.product_count || 0).toLocaleString("ko-KR")}개</strong></article><article><span>귀속 주문</span><strong>{Number(channel.order_count || 0).toLocaleString("ko-KR")}건</strong></article><article><span>귀속 판매액</span><strong>{Number(channel.sales_amount || 0).toLocaleString("ko-KR")}원</strong></article></div></section>}
          <div className={`member-channel-review-actions ${channel.status === "active" || channel.application_status === "published" ? "is-published" : ""}`}>
            {channel.status === "active" || channel.application_status === "published" ? <><p><strong>현재 운영 중</strong> · 이미 최고 관리자 승인이 완료되어 고객에게 공개된 채널입니다.</p><a className="admin-primary" href={channelHref} target="_blank" rel="noreferrer">운영 채널 보기 ↗</a></> : channel.application_status === "publication_review" ? <p><strong>공개 검토 중</strong> · 최고 관리자가 최종 확인하고 있습니다.</p> : <><p>채널 준비가 끝나면 최고 관리자에게 최종 공개 검토를 요청하세요.</p><button type="button" className="admin-primary" disabled={Boolean(busy)} onClick={() => act({ action: "channel.publication.request" }, "채널 공개 검수를 요청했습니다.")}>공개 검토 요청</button></>}
          </div>
        </>}
      </section>
    </main>
  </div>;
}
