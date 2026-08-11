"use client";

import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { QingdaoFooter, QingdaoHeader } from "../../../components/QingdaoShell";
import { Sparkles } from "lucide-react";

const spots = [
  { id: 1, name: "팔대관", area: "시남구", type: "관광지", image: "p1", time: "2~3시간", tags: "산책 · 건축" },
  { id: 2, name: "잔교", area: "시남구", type: "관광지", image: "p2", time: "1시간", tags: "해변 · 전망" },
  { id: 3, name: "소어산", area: "시남구", type: "관광지", image: "p5", time: "1~2시간", tags: "전망 · 사진" },
  { id: 4, name: "해산물 거리", area: "시남구", type: "맛집", image: "food", time: "1시간 30분", tags: "미식 · 현지" },
  { id: 5, name: "맥주박물관", area: "시북구", type: "체험", image: "p3", time: "2시간", tags: "맥주 · 역사" },
  { id: 6, name: "요트센터", area: "시남구", type: "체험", image: "p4", time: "2시간", tags: "요트 · 야경" },
];

const initialPlan = [
  ["09:00", "팔대관 산책", "시남구 · 2~3시간", "p1"],
  ["12:00", "해산물 식사", "해산물 거리 · 1시간 30분", "food"],
  ["15:00", "올림픽 요트센터", "시남구 · 2시간", "p4"],
  ["18:00", "맥주거리", "시북구 · 2시간", "p3"],
  ["20:00", "5·4광장 야경", "시남구 · 1시간", "p5"],
];

const vehicles = [
  { id: "premium-van", name: "프리미엄 비즈니스 밴", type: "밴", seats: 6, grade: "프리미엄", price: 980, detail: "공항·호텔·전 일정 전용 차량" },
  { id: "business-sedan", name: "비즈니스 세단", type: "승용차", seats: 4, grade: "고급", price: 680, detail: "커플·비즈니스 여행 추천" },
  { id: "standard-van", name: "스탠다드 밴", type: "밴", seats: 6, grade: "실속", price: 560, detail: "가족·소그룹 이동 추천" },
  { id: "economy-sedan", name: "이코노미 세단", type: "승용차", seats: 4, grade: "경제형", price: 380, detail: "공항 이동과 시내 단거리" },
  { id: "electric-sedan", name: "전기 비즈니스 세단", type: "전기차", seats: 4, grade: "친환경", price: 620, detail: "조용하고 쾌적한 도심 이동" },
  { id: "electric-suv", name: "전기 패밀리 SUV", type: "전기차", seats: 6, grade: "친환경", price: 760, detail: "가족 여행과 넉넉한 수하물" },
  { id: "premium-suv", name: "프리미엄 대형 SUV", type: "SUV", seats: 6, grade: "프리미엄", price: 880, detail: "장거리·라오산 일정 추천" },
  { id: "minibus", name: "그룹 전용 미니버스", type: "미니버스", seats: 12, grade: "단체형", price: 1280, detail: "대가족·단체 여행 전용" },
];

export default function Planner() {
  const [mode, setMode] = useState<"recommend" | "direct">("recommend");
  const [nights, setNights] = useState<1 | 2 | 3>(2);
  const [category, setCategory] = useState("전체");
  const [day, setDay] = useState(1);
  const [selected, setSelected] = useState(spots[0]);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [plan, setPlan] = useState(initialPlan);
  const [dragOver, setDragOver] = useState(false);
  const [seatFilter, setSeatFilter] = useState<"전체" | "4" | "6" | "12">("전체");
  const [vehicleType, setVehicleType] = useState<"전체" | "밴" | "승용차" | "전기차" | "SUV" | "미니버스">("전체");
  const [priceOrder, setPriceOrder] = useState<"high" | "low">("high");
  const [vehicleId, setVehicleId] = useState("economy-sedan");
  const [pickupVehicleId, setPickupVehicleId] = useState("");
  const [dropoffVehicleId, setDropoffVehicleId] = useState("");
  const [activeVehicleId, setActiveVehicleId] = useState("standard-van");
  const [vehiclePage, setVehiclePage] = useState(0);
  const filtered = useMemo(() => category === "전체" ? spots : spots.filter((spot) => spot.type === category), [category]);
  const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => {
    const matchesSeat = seatFilter === "전체" || vehicle.seats === Number(seatFilter);
    const matchesType = vehicleType === "전체" || vehicle.type === vehicleType;
    return matchesSeat && matchesType;
  }).sort((a, b) => priceOrder === "high" ? b.price - a.price : a.price - b.price), [seatFilter, vehicleType, priceOrder]);
  const vehiclePageCount = Math.max(1, Math.ceil(filteredVehicles.length / 4));
  const safeVehiclePage = Math.min(vehiclePage, vehiclePageCount - 1);
  const visibleVehicles = filteredVehicles.slice(safeVehiclePage * 4, safeVehiclePage * 4 + 4);
  const recommendedPlan = nights === 1 ? initialPlan.slice(0, 3) : nights === 2 ? initialPlan : [...initialPlan, ["10:00", "라오산 풍경구", "라오산구 · 반일", "p6"], ["18:00", "타이동 야시장", "시북구 · 2시간", "p2"]];

  const addSelected = () => {
    if (plan.some((item) => item[1] === selected.name)) return;
    setPlan([...plan, ["21:00", selected.name, `${selected.area} · ${selected.time}`, selected.image]]);
  };

  const addSpots = (items: typeof spots) => {
    const existing = new Set(plan.map((item) => item[1]));
    const additions = items.filter((spot) => !existing.has(spot.name)).map((spot, index) => [
      `${Math.min(21 + index, 23).toString().padStart(2, "0")}:00`, spot.name, `${spot.area} · ${spot.time}`, spot.image,
    ]);
    setPlan([...plan, ...additions]);
    setCheckedIds([]);
  };

  const toggleChecked = (id: number) => setCheckedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const startSpotDrag = (event: DragEvent, id: number) => { event.dataTransfer.setData("application/qingdao-spot", String(id)); event.dataTransfer.effectAllowed = "copy"; };
  const startPlanDrag = (event: DragEvent, index: number) => { event.dataTransfer.setData("application/qingdao-plan", String(index)); event.dataTransfer.effectAllowed = "move"; };
  const dropOnPlan = (event: DragEvent, targetIndex?: number) => {
    event.preventDefault(); setDragOver(false);
    const spotId = Number(event.dataTransfer.getData("application/qingdao-spot"));
    if (spotId) { const spot = spots.find((item) => item.id === spotId); if (spot) addSpots([spot]); return; }
    const sourceIndex = Number(event.dataTransfer.getData("application/qingdao-plan"));
    if (!Number.isNaN(sourceIndex) && targetIndex !== undefined && sourceIndex !== targetIndex) {
      const next = [...plan]; const [moved] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, moved); setPlan(next);
    }
  };

  const startVehicleDrag = (event: DragEvent, id: string) => {
    event.dataTransfer.setData("application/qingdao-vehicle", id);
    event.dataTransfer.effectAllowed = "copy";
    setActiveVehicleId(id);
  };
  const assignVehicle = (target: "pickup" | "travel" | "dropoff", id = activeVehicleId) => {
    if (target === "pickup") setPickupVehicleId(id);
    if (target === "travel") setVehicleId(id);
    if (target === "dropoff") setDropoffVehicleId(id);
  };
  const dropVehicle = (event: DragEvent, target: "pickup" | "travel" | "dropoff") => {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/qingdao-vehicle");
    if (vehicles.some((vehicle) => vehicle.id === id)) assignVehicle(target, id);
  };
  const vehicleById = (id: string) => vehicles.find((vehicle) => vehicle.id === id);
  const pickupPrice = vehicleById(pickupVehicleId)?.price || 0;
  const travelPrice = vehicleById(vehicleId)?.price || 0;
  const dropoffPrice = vehicleById(dropoffVehicleId)?.price || 0;
  const vehicleTotal = pickupPrice + travelPrice + dropoffPrice;

  return <main className="qg-page qg-planner-page qg-section-page qg-accent-blue"><QingdaoHeader home />
    <section className="qg-builder-head"><div><span>QINGDAO TRIP BUILDER</span><h1>칭다오 <em>맞춤 여행</em> 일정 만들기</h1><p>추천 코스로 빠르게 시작하거나, 원하는 장소를 직접 골라 나만의 일정을 완성하세요.</p></div><div className="qg-builder-modes"><button className={mode === "recommend" ? "active" : ""} onClick={() => setMode("recommend")}><b>추천받기</b><span>지역·기간·취향을 선택하면 자동 구성</span></button><button className={mode === "direct" ? "active" : ""} onClick={() => setMode("direct")}><b>직접 만들기</b><span>관광지·맛집·체험을 골라 일정에 추가</span></button></div></section>

    <section className="qg-builder-progress"><span className="done"><i>1</i>여행 조건</span><span className="active"><i>2</i>{mode === "recommend" ? "코스 추천" : "장소 선택"}</span><span><i>3</i>일정 구성</span><span><i>4</i>지도 확인</span><span><i>5</i>저장·상담</span></section>

    {mode === "recommend" && <section className="qg-recommend-bar"><div><small>지역</small><button className="active">시남구</button><button>시북구</button><button>라오산구</button></div><div><small>여행 기간</small>{([1,2,3] as const).map((value) => <button className={nights === value ? "active" : ""} onClick={() => { setNights(value); setDay(1); }} key={value}>{value}박 {value + 1}일</button>)}</div><div><small>여행 취향</small><button className="active">관광</button><button>맛집</button><button>체험</button><button>여유</button></div><button className="qg-ai-compose" onClick={() => setPlan(recommendedPlan)}><Sparkles aria-hidden="true"/>AI 추천 일정 구성</button></section>}

    <section className="qg-transport-panel" id="transport">
      <div className="qg-transport-head">
        <div><span>VEHICLE & TRANSFER</span><h2>차량·공항 이동 서비스</h2><p>여행 중 차량과 입국 픽업·출국 환송 차량을 각각 다른 등급으로 선택할 수 있습니다.</p></div>
        <div><button className={priceOrder === "high" ? "active" : ""} onClick={() => setPriceOrder("high")}>높은 가격순</button><button className={priceOrder === "low" ? "active" : ""} onClick={() => setPriceOrder("low")}>낮은 가격순</button>{["전체","4","6","12"].map((seat) => <button className={seatFilter === seat ? "active" : ""} onClick={() => setSeatFilter(seat as "전체" | "4" | "6" | "12")} key={seat}>{seat === "전체" ? "전체 승차" : `${seat}인승`}</button>)}</div>
      </div>
      <div className="qg-vehicle-builder">
        <aside className="qg-vehicle-palette">
          <h3>차량 선택</h3><p>차종을 고른 뒤 차량을 오른쪽 이용 구간으로 끌어다 놓으세요.</p>
          <nav className="qg-vehicle-type-tabs">{(["전체", "밴", "승용차", "전기차", "SUV", "미니버스"] as const).map((type) => <button className={vehicleType === type ? "active" : ""} onClick={() => setVehicleType(type)} key={type}>{type === "전체" ? "전체 차량" : type}</button>)}</nav>
          <div className="qg-vehicle-list">{visibleVehicles.map((vehicle) => <article draggable onDragStart={(event) => startVehicleDrag(event, vehicle.id)} className={activeVehicleId === vehicle.id ? "selected" : ""} onClick={() => setActiveVehicleId(vehicle.id)} key={vehicle.id}><img src={`/qingdao/vehicles/${vehicle.id}.png`} alt={`${vehicle.name} 예시 차량`} /><span><small>{vehicle.grade} · {vehicle.seats}인승</small><b>{vehicle.name}</b><em>{vehicle.detail}</em></span><strong>{vehicle.price.toLocaleString()}위안</strong><u>⋮⋮</u></article>)}</div>
          {vehiclePageCount > 1 && <div className="qg-vehicle-page-controls"><button type="button" disabled={safeVehiclePage === 0} onClick={() => setVehiclePage(Math.max(0, safeVehiclePage - 1))} aria-label="이전 차량 보기">‹</button><span>{safeVehiclePage + 1} / {vehiclePageCount}</span><b>다른 차량 보기</b><button type="button" disabled={safeVehiclePage === vehiclePageCount - 1} onClick={() => setVehiclePage(Math.min(vehiclePageCount - 1, safeVehiclePage + 1))} aria-label="다음 차량 보기">›</button></div>}
          <small className="qg-vehicle-photo-note">사진은 차량 등급 예시이며 실제 배차 차량은 달라질 수 있습니다.</small>
        </aside>
        <section className="qg-vehicle-dropboard">
          <h3>이용 구간에 차량 배정</h3><p>끌어다 놓거나, 왼쪽 차량을 선택한 뒤 원하는 구간을 누르세요.</p>
          <div className="qg-vehicle-zones">
            <article className={pickupVehicleId ? "enabled" : "empty"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropVehicle(event, "pickup")}><header><span>01 · 입국</span><b>공항 픽업</b><small>칭다오 공항 → 호텔 또는 첫 일정</small></header>{pickupVehicleId ? <div className="qg-vehicle-slot filled"><img src={`/qingdao/vehicles/${pickupVehicleId}.png`} alt="선택한 픽업 차량"/><strong>{vehicleById(pickupVehicleId)?.name}</strong><span>{vehicleById(pickupVehicleId)?.grade} · {vehicleById(pickupVehicleId)?.seats}인승 · {vehicleById(pickupVehicleId)?.detail}</span><em>{vehicleById(pickupVehicleId)?.price.toLocaleString()}위안</em><button onClick={() => setPickupVehicleId("")}>×</button></div> : <div className="qg-vehicle-slot empty"><b>＋</b><span>픽업 차량을 여기에 놓으세요</span></div>}</article>
            <article className={vehicleId ? "enabled" : "empty"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropVehicle(event, "travel")}><header><span>02 · 여행 중</span><b>일정 전용 차량</b><small>관광지·맛집·체험 이동</small></header>{vehicleId ? <div className="qg-vehicle-slot filled"><img src={`/qingdao/vehicles/${vehicleId}.png`} alt="선택한 여행 중 차량"/><strong>{vehicleById(vehicleId)?.name}</strong><span>{vehicleById(vehicleId)?.grade} · {vehicleById(vehicleId)?.seats}인승 · {vehicleById(vehicleId)?.detail}</span><em>{vehicleById(vehicleId)?.price.toLocaleString()}위안</em><button onClick={() => setVehicleId("")}>×</button></div> : <div className="qg-vehicle-slot empty"><b>＋</b><span>여행 중 차량을 여기에 놓으세요</span></div>}</article>
            <article className={dropoffVehicleId ? "enabled" : "empty"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropVehicle(event, "dropoff")}><header><span>03 · 출국</span><b>공항 환송</b><small>호텔 또는 마지막 일정 → 칭다오 공항</small></header>{dropoffVehicleId ? <div className="qg-vehicle-slot filled"><img src={`/qingdao/vehicles/${dropoffVehicleId}.png`} alt="선택한 환송 차량"/><strong>{vehicleById(dropoffVehicleId)?.name}</strong><span>{vehicleById(dropoffVehicleId)?.grade} · {vehicleById(dropoffVehicleId)?.seats}인승 · {vehicleById(dropoffVehicleId)?.detail}</span><em>{vehicleById(dropoffVehicleId)?.price.toLocaleString()}위안</em><button onClick={() => setDropoffVehicleId("")}>×</button></div> : <div className="qg-vehicle-slot empty"><b>＋</b><span>환송 차량을 여기에 놓으세요</span></div>}</article>
          </div>
          <div className="qg-vehicle-total">
            <div><span>공항 픽업</span><b>{pickupVehicleId ? `${pickupPrice.toLocaleString()}위안` : "미선택"}</b></div>
            <i>＋</i><div><span>여행 중 차량</span><b>{vehicleId ? `${travelPrice.toLocaleString()}위안` : "미선택"}</b></div>
            <i>＋</i><div><span>공항 환송</span><b>{dropoffVehicleId ? `${dropoffPrice.toLocaleString()}위안` : "미선택"}</b></div>
            <strong><small>차량·이동 예상 총액</small>{vehicleTotal.toLocaleString()}위안<em>상담 후 최종 확정</em></strong>
          </div>
          <aside className="qg-transfer-banner"><div><span>FAMILY TRAVEL CARE</span><b>가족 여행이라면 이동도 더 편안하게</b><small>유아 카시트 · 한국어 상담 · 일정 맞춤 배차 요청</small></div><a href="/qingdao/guide#local-guide">차량 상담하기 →</a></aside>
        </section>
      </div>
    </section>

    <section className="qg-builder-workspace">
      <aside className="qg-place-picker"><div className="qg-picker-tabs">{["관광지","맛집","체험","쇼핑","호텔"].map(x => <button className={category === x ? "active" : ""} onClick={() => setCategory(x)} key={x}>{x}</button>)}<button onClick={() => document.getElementById("transport")?.scrollIntoView({ behavior: "smooth" })}>차량·이동</button></div><div className="qg-picker-filters"><button className={category === "전체" ? "active" : ""} onClick={() => setCategory("전체")}>전체</button><button>역사/문화</button><button>자연/해변</button><button>도심/명소</button></div><p className="qg-drag-guide">⋮⋮ PC는 카드를 일정표로 드래그 · 모바일은 체크 후 추가</p><div className="qg-place-cards">{filtered.map(spot => <article draggable onDragStart={(event) => startSpotDrag(event, spot.id)} className={selected.id === spot.id ? "selected" : ""} onClick={() => setSelected(spot)} key={spot.id}><label onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checkedIds.includes(spot.id)} onChange={() => toggleChecked(spot.id)} aria-label={`${spot.name} 선택`}/></label><div className={`qg-itin-img ${spot.image}`}></div><span><b>{spot.name}</b><small>{spot.area} · {spot.tags}</small></span><button onClick={(event) => { event.stopPropagation(); addSpots([spot]); }} aria-label={`${spot.name} 일정에 추가`}>+</button><i>⋮⋮</i></article>)}</div>{checkedIds.length > 0 && <button className="qg-add-checked" onClick={() => addSpots(spots.filter((spot) => checkedIds.includes(spot.id)))}>선택한 {checkedIds.length}곳 일정에 추가</button>}<button className="qg-more-places">＋ 더 많은 장소 보기</button></aside>

      <section className={`qg-schedule-board ${dragOver ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => dropOnPlan(event)}><div className="qg-schedule-title"><div><span>{mode === "recommend" ? "AI 추천 일정" : "나의 직접 구성"}</span><h2>{nights}박 {nights + 1}일 칭다오 여행</h2></div><button>7월 20일 ~ 7월 {20 + nights}일⌄</button></div><div className="qg-trip-metrics"><span><b>{28 + nights * 7}km</b>총 거리</span><span><b>{980 + nights * 300}위안</b>예상 비용</span><span><b>92점</b>여행 밸런스</span></div><div className="qg-day-tabs">{Array.from({length:nights + 1}, (_, index) => index + 1).map(x => <button className={day === x ? "active" : ""} onClick={() => setDay(x)} key={x}>{x}일차</button>)}<button>＋</button></div><p className="qg-plan-drop-help">장소를 이곳에 놓거나 일정 항목을 끌어 순서를 변경하세요.</p><div className="qg-builder-timeline">{plan.map((item, index) => <article draggable onDragStart={(event) => startPlanDrag(event, index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropOnPlan(event, index); }} key={`${item[1]}-${index}`}><time>{item[0]}</time><i></i><div className={`qg-itin-img ${item[3]}`}></div><div><b>{day === 1 ? item[1] : `${item[1]} 주변 자유 일정`}</b><span>{item[2]}</span></div><button onClick={() => setPlan(plan.filter((_, i) => i !== index))} aria-label={`${item[1]} 삭제`}>×</button><em>⋮⋮</em></article>)}</div><div className="qg-builder-actions"><button>이전 단계</button><button className="primary">다음 단계</button></div></section>

      <aside className="qg-spot-detail"><div className={`qg-detail-image ${selected.image}`}><button>♡</button></div><small>{selected.area}</small><h2>{selected.name}</h2><p>예상 체류시간 {selected.time}</p><p>여행 일정과 잘 어울리는 칭다오 추천 장소입니다. 상세 정보와 주변 동선을 확인한 뒤 일정에 추가하세요.</p><div><button>상세정보</button><button>지도보기</button><button>후기</button></div><button className="qg-add-plan" onClick={addSelected}>내 일정에 추가</button></aside>
    </section>

    <section className="qg-builder-bottom"><article><span>① 지역 선택</span><div className="qg-mini-map"><b>시남구</b><i></i><i></i><i></i></div><button>시남구 여행 보기</button></article><article><span>② 코스 선택</span><div className="qg-course-list"><button className="active"><b>칭다오 2박 3일 완벽 코스</b><small>관광 · 맛집 · 야경 · 체험</small></button><button><b>커플 힐링 2박 3일</b><small>로맨틱한 시간</small></button><button><b>부모님과 함께 2박 3일</b><small>편안한 이동</small></button></div></article><article><span>③ AI 일정 구성</span><h3>칭다오 2박 3일 완벽 코스</h3>{plan.slice(0,4).map(x => <p key={x[1]}><time>{x[0]}</time>{x[1]}</p>)}</article><article><span>④ 지도 확인</span><div className="qg-route-map"><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i></div><small>이동 동선과 예상 시간을 확인하세요.</small></article><article><span>⑤ 일정 저장 & 상담</span><h3>칭다오 2박 3일 추천 코스</h3><div className="qg-save-metrics"><b>42km<small>총 거리</small></b><b>1,580위안<small>예상 비용</small></b><b>92점<small>밸런스</small></b></div><button>상담 및 예약 문의</button></article></section>
    <QingdaoFooter />
  </main>;
}
