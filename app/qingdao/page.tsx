import { QingdaoFooter, QingdaoHeader } from "../../components/QingdaoShell";
import { BellRing, Bot, BriefcaseBusiness, CalendarDays, CarFront, CircleDollarSign, Gift, Heart, House, Map, MapPin, MessageSquareText, PhoneCall, Search, ShieldCheck, Sparkles, Sun, UserRound, UserRoundCheck } from "lucide-react";

export const dynamic = "force-dynamic";
const fmt = (value: unknown) => Number(value || 0).toLocaleString("ko-KR");

const shortcuts = [
  [Sparkles, "AI 맞춤 일정", "나만의 일정 만들기", "/qingdao/planner"],
  [MapPin, "관광지", "칭다오 필수 명소", "/qingdao/guide"],
  [UserRoundCheck, "현지 가이드", "검증된 가이드와 여행", "/qingdao/guide#local-guide"],
  [MessageSquareText, "여행 후기", "생생한 실제 후기", "/?account=reviews"],
  [ShieldCheck, "여행 안전", "안전 정보와 긴급 연락처 안내", "/qingdao/travel#safety"],
];

const places = [
  ["p1", "팔대관", "시남구"], ["p2", "잔교", "시남구"], ["p6", "천주교당", "시남구"],
  ["p4", "오월의 바람", "시남구"], ["p3", "칭다오 맥주박물관", "시북구"],
];

const sampleProducts = [
  { id: "qg-snack-1", name: "칭다오 맥주효모 크래커", point_price: 6900, emoji: "🥨", color: "#fff0c9" },
  { id: "qg-tea-1", name: "노산 녹차 티백 20입", point_price: 11800, emoji: "🍵", color: "#dff3df" },
  { id: "qg-sauce-1", name: "해천 해산물 간장", point_price: 5900, emoji: "🥢", color: "#f8dfcb" },
  { id: "qg-cup-1", name: "청화자 찻잔 2P", point_price: 18900, emoji: "🍶", color: "#e2edff" },
  { id: "qg-glass-1", name: "복고 유리 맥주잔 2P", point_price: 16900, emoji: "🍺", color: "#ffedc6" },
  { id: "qg-gift-1", name: "칭다오 골목 마그넷 세트", point_price: 7900, emoji: "🧲", color: "#dcecff" },
];

export default async function QingdaoHome() {
  const products = sampleProducts;

  return <main className="qg-page qg-reference-home qg-home-exact"><QingdaoHeader home />
    <section className="qg-ref-hero">
      <div className="qg-ref-copy"><span>칭다오, 당신만의 여행을</span><h1>완벽하게<br/>디자인하세요</h1><p>AI 맞춤 일정부터 현지 가이드, 여행 후기까지<br/>칭다오 여행의 모든 것!</p><form action="/qingdao/guide"><label><Search aria-hidden="true"/><input name="q" aria-label="칭다오 여행 검색" placeholder="어디로 떠나시나요? (예: 팔대관, 맥주박물관)"/></label><button type="submit" aria-label="검색"><Search aria-hidden="true"/></button></form><div className="qg-ref-tags"><span>#팔대관</span><span>#맥주축제</span><span>#잔교</span><span>#요트광장</span><span>#해신탕</span></div></div>
      <div className="qg-ref-side qg-exact-side">
        <article className="qg-exact-weather"><h2>칭다오 날씨</h2><div className="qg-exact-temp"><Sun aria-hidden="true"/><div><strong>24°C</strong><span>맑음</span></div></div><hr/><dl><div><dt>미세먼지</dt><dd>좋음 <i></i></dd></div><div><dt>환율 (CNY/KRW)</dt><dd><strong>189.20</strong><em>+0.21</em></dd></div></dl><a href="/qingdao/travel">자세히 보기 ›</a></article>
      </div>
    </section>

    <nav className="qg-ref-shortcuts" aria-label="여행 서비스 바로가기">{shortcuts.map(([Icon,title,text,href]: any[]) => <a href={href} key={title}><i><Icon aria-hidden="true"/></i><b>{title}</b><span>{text}</span></a>)}</nav>

    <section className="qg-ref-section qg-home-places"><div className="qg-ref-heading"><h2>인기 관광지</h2><a href="/qingdao/guide">더보기 ›</a></div><div className="qg-ref-places">{places.map(([image,title,area]) => <a href="/qingdao/guide" key={title}><div className={`qg-place-image ${image}`}></div><h3>{title}</h3><span>⌖ {area}</span></a>)}</div><div className="qg-slider-dots"><i></i><i></i></div></section>

    <section className="qg-home-promos"><a href="/qingdao/planner"><b>AI 맞춤 일정 만들기</b><p>여행 기간, 테마를 선택하면<br/>최적의 코스를 추천해드려요!</p><span>일정 만들기</span><i><Bot aria-hidden="true"/></i></a><a href="/qingdao/planner"><b>2박 3일 추천 코스</b><p>인기 명소와 맛집을<br/>알차게 담은 코스</p><span>코스 보기</span><i><Map aria-hidden="true"/></i></a><a href="/?account=reviews"><b>여행 후기 이벤트</b><p>후기 남기고 포인트 받고,<br/>여행자 스토어 혜택까지!</p><span>후기 작성하기</span><i><Gift aria-hidden="true"/></i></a></section>

    <section className="qg-ref-section qg-home-store"><div className="qg-ref-heading"><h2>여행자 스토어 <small>(귀국 후 다시 만나는 칭다오)</small></h2><a href="/qingdao/store">더보기 ›</a></div><div className="qg-ref-products qg-home-sample-products">{products.map((product) => <a href="/qingdao/store" key={product.id}><div className="qg-home-product-art" style={{background: product.color}}><span>{product.emoji}</span></div><em>QINGDAO SELECT</em><h3>{product.name}</h3><b>{fmt(product.point_price)}원</b><i><Heart aria-hidden="true"/></i></a>)}</div></section>

    <section className="qg-ref-section qg-home-guides"><div className="qg-ref-heading"><h2>현지 인기 가이드</h2><a href="/qingdao/guide#local-guide">더보기 ›</a></div><div className="qg-ref-guides"><article><i>김</i><div><h3>김가이드 <span>예약 가능</span></h3><p>칭다오 거주 8년</p><small>한국어 OK　<strong>★ 4.9 (532)</strong></small></div></article><article><i>이</i><div><h3>이가이드 <span>예약 가능</span></h3><p>한국어 OK</p><small>맛집 전문　<strong>★ 4.9 (412)</strong></small></div></article><article><i>박</i><div><h3>박가이드 <span>예약 가능</span></h3><p>골프 & 비즈니스</p><small>전문　<strong>★ 4.8 (288)</strong></small></div></article><article><i>최</i><div><h3>최연수 가이드 <span>예약 가능</span></h3><p>가족 여행 전문</p><small>사진 잘 찍어요　<strong>★ 4.9 (201)</strong></small></div></article></div></section>

    <section className="qg-home-safety"><a href="/qingdao/travel#safety"><i><PhoneCall aria-hidden="true"/></i><b>긴급 연락처</b><span>경찰 110 | 구급차 120</span></a><a href="/qingdao/travel#safety"><i><ShieldCheck aria-hidden="true"/></i><b>안전 여행 수칙</b><span>현지에서 꼭 지켜야 할 안전 수칙 안내</span></a><a href="/qingdao/travel#safety"><i><CarFront aria-hidden="true"/></i><b>자가 운전 안전 길잡이</b><span>여행자들이 많이 질문하는 안전 Q&A</span></a><a href="/qingdao/travel#safety"><i><BellRing aria-hidden="true"/></i><b>실시간 안전 알림</b><span>칭다오 현지 안전 상황 및 공지</span></a></section>
    <QingdaoFooter/>
    <nav className="qg-home-bottom"><a href="/"><i><House aria-hidden="true"/></i><span>홈</span></a><a href="/qingdao/planner"><i><CalendarDays aria-hidden="true"/></i><span>일정</span></a><a href="/qingdao/my"><i><BriefcaseBusiness aria-hidden="true"/></i><span>내 여행</span></a><a href="/qingdao/rewards"><i><CircleDollarSign aria-hidden="true"/></i><span>포인트</span></a><a href="/qingdao/my"><i><UserRound aria-hidden="true"/></i><span>마이페이지</span></a></nav>
  </main>;
}
