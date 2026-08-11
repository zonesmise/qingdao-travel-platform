"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import SafeProductImage from "./SafeProductImage";

type Slot = { number: number; productId: number };
type Product = { id: number; image_url?: string; name: string; point_price?: number };
type LiveData = { settings: Record<string, string>; products: Product[]; salesChannels?: any[] };

function parseList<T>(value: string | undefined): T[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function LiveAssistant({ memberMode = false }: { memberMode?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelSlug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("channel") || "" : "";
  const selectedChannel = data?.salesChannels?.find((channel) => String(channel.slug) === channelSlug);
  let selectedChannelSettings: Record<string, string> = {};
  try { selectedChannelSettings = JSON.parse(String(selectedChannel?.broadcast_settings || "{}")); } catch { selectedChannelSettings = {}; }
  const effectiveSettings = selectedChannel ? { ...data?.settings, ...selectedChannelSettings } : data?.settings;

  async function load() {
    const response = await fetch(memberMode ? "/api/store?scope=live-assistant" : `/api/live-state${channelSlug ? `?channel=${encodeURIComponent(channelSlug)}` : ""}`, { cache: "no-store", credentials: "include" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "방송 정보를 불러오지 못했습니다.");
    if (memberMode) {
      if (!payload.memberChannel) throw new Error("관리할 내 채널을 찾을 수 없습니다.");
      setData({ settings: payload.settings || {}, products: payload.products || [], salesChannels: [payload.memberChannel] });
      return;
    }
    setData(channelSlug
      ? { settings: payload.settings || {}, products: payload.products || [], salesChannels: payload.channel ? [payload.channel] : [] }
      : { settings: payload.settings || {}, products: payload.products || [], salesChannels: [] });
  }

  useEffect(() => {
    const initial = window.setTimeout(() => load().catch((error: Error) => setMessage(error.message)), 0);
    const timer = window.setInterval(() => load().catch(() => undefined), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const slots = useMemo(() => parseList<Slot>(effectiveSettings?.youtube_live_slots).sort((a, b) => Number(a.number) - Number(b.number)), [data, channelSlug]);
  const history = useMemo(() => parseList<number>(effectiveSettings?.youtube_live_history), [data, channelSlug]);
  const currentNumber = Number(effectiveSettings?.youtube_live_current_number || 0);
  const productById = (id: number) => data?.products?.find((product) => Number(product.id) === Number(id));
  const currentSlot = slots.find((slot) => Number(slot.number) === currentNumber);
  const currentProduct = currentSlot ? productById(currentSlot.productId) : null;

  async function sendProduct(nextNumber: number) {
    if (!nextNumber) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(memberMode ? "/api/store" : "/api/admin", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: memberMode ? "channel.live.quickProduct" : "live.quickProduct", channelId: selectedChannel?.id || 0, number: nextNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "상품을 변경하지 못했습니다.");
      if (payload.liveRefresh) await load();
      else setData(payload);
      setNumber("");
      setMessage(`${nextNumber}번 상품으로 변경했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상품을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    sendProduct(Math.floor(Number(number)));
  }

  async function resetHistory() {
    if (!confirm("현재 상품과 소개된 상품 기록을 비우고 새 방송을 시작할까요? 번호 연결은 유지됩니다.")) return;
    setBusy(true);
    const response = await fetch(memberMode ? "/api/store" : "/api/admin", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: memberMode ? "channel.live.resetHistory" : "live.resetHistory", channelId: selectedChannel?.id || 0 }),
    });
    const payload = await response.json();
    if (response.ok) {
      if (payload.liveRefresh) await load();
      else setData(payload);
      setMessage("새 방송용으로 소개 기록을 비웠습니다.");
    } else setMessage(payload.error || "기록을 비우지 못했습니다.");
    setBusy(false);
  }

  if (!data) return <main className="live-assistant-page"><div className="assistant-loading">{message || "방송 보조창을 준비 중입니다."}</div></main>;

  return <main className="live-assistant-page" style={{ "--brand": data.settings.primary_color, "--brand-2": data.settings.secondary_color } as React.CSSProperties}>
    <header className="assistant-header"><div><span>LIVE CONTROL</span><h1>{selectedChannel?.name || "기본 채널"} 방송 상품 보조창</h1><p>이 화면의 변경은 선택한 채널에만 적용됩니다.</p></div><div><a href={memberMode ? "/my-channel" : "/admin"} target="_blank">{memberMode ? "채널 관리 열기" : "관리자 열기"}</a><button type="button" onClick={resetHistory} disabled={busy}>새 방송 시작</button></div></header>
    <section className="assistant-current"><div className="assistant-current-label"><span>현재 소개 중</span><strong>{currentNumber ? `${currentNumber}번` : "대기"}</strong></div>{currentProduct ? <><SafeProductImage src={currentProduct.image_url} alt={currentProduct.name} /><div><strong>{currentProduct.name}</strong><p>{Number(currentProduct.point_price || 0).toLocaleString("ko-KR")}원</p></div></> : <p>아래에 상품 번호를 입력해 주세요.</p>}</section>
    <form className="assistant-number-form" onSubmit={submit}><label>상품 번호<input ref={inputRef} autoFocus inputMode="numeric" pattern="[0-9]*" min="1" max="9999" type="number" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="예: 27" /></label><button disabled={busy || !number}>{busy ? "변경 중" : "현재 상품으로 표시"}</button></form>
    {message && <p className="assistant-message" role="status">{message}</p>}
    <section className="assistant-slots"><header><div><span>이번 방송 번호표</span><strong>{slots.length}개 연결됨</strong></div><small>버튼을 눌러도 바로 변경됩니다.</small></header><div>{slots.map((slot) => { const product = productById(slot.productId); return <button type="button" key={`${slot.number}-${slot.productId}`} className={Number(slot.number) === currentNumber ? "active" : ""} onClick={() => sendProduct(Number(slot.number))} disabled={busy}><b>{slot.number}</b>{product ? <><SafeProductImage src={product.image_url} alt={product.name} /><span>{product.name}</span></> : <span>연결 상품 없음</span>}</button>; })}</div>{!slots.length && <p>관리자에서 이번 방송 상품 번호를 먼저 연결하고 저장해 주세요.</p>}</section>
    <section className="assistant-history"><header><span>소개된 상품</span><small>최근 30개</small></header><div>{history.slice().reverse().map((itemNumber, index) => { const slot = slots.find((item) => Number(item.number) === Number(itemNumber)); const product = slot ? productById(slot.productId) : null; return <article key={`${itemNumber}-${index}`}><b>{itemNumber}번</b><span>{product?.name || "현재 연결되지 않은 상품"}</span></article>; })}</div>{!history.length && <p>아직 소개된 상품이 없습니다.</p>}</section>
  </main>;
}
