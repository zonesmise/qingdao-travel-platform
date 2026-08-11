import type { ReactNode } from "react";
import { CalendarDays, CarFront, CircleDollarSign, ConciergeBell, Hotel, Luggage, MapPinned, Menu, MessageSquareText, Search, ShipWheel, ShoppingBag, ShoppingCart, Ticket, Utensils, Wifi } from "lucide-react";

export function QingdaoHeader({ home = false }: { home?: boolean }) {
  if (home) return <><header className="qg-home-header qg-platform-header">
    <a className="qg-home-logo" href="/"><ShipWheel aria-hidden="true"/><span>QINGDAO<small>TRAVEL PLATFORM</small></span></a>
    <nav aria-label="주요 메뉴">
      <a href="/qingdao/travel"><Luggage aria-hidden="true"/><span>여행 준비</span></a>
      <a href="/qingdao/planner"><CalendarDays aria-hidden="true"/><span>맞춤 일정</span></a>
      <a href="/qingdao/guide"><MapPinned aria-hidden="true"/><span>관광·맛집</span></a>
      <a href="/qingdao/guide#local-guide"><ConciergeBell aria-hidden="true"/><span>현지 서비스</span></a>
      <a href="/?account=reviews"><MessageSquareText aria-hidden="true"/><span>여행 후기</span></a>
      <a href="/qingdao/store"><ShoppingBag aria-hidden="true"/><span>쇼핑</span></a>
      <a href="/qingdao/rewards"><CircleDollarSign aria-hidden="true"/><span>리워드</span></a>
    </nav>
    <div className="qg-home-tools"><a href="/qingdao/guide" aria-label="검색"><Search aria-hidden="true"/></a><a className="qg-home-login" href="/qingdao/login?return_to=/">로그인</a><a className="qg-home-signup" href="/qingdao/register?return_to=/">회원가입</a><button type="button" aria-label="전체 메뉴"><Menu aria-hidden="true"/></button></div>
  </header><nav className="qg-platform-subnav" aria-label="여행 서비스 세부 메뉴"><a href="/qingdao/guide"><Ticket aria-hidden="true"/>관광지</a><a href="/qingdao/guide#food"><Utensils aria-hidden="true"/>맛집</a><a href="/qingdao/planner"><CarFront aria-hidden="true"/>차량·공항 이동</a><a href="/qingdao/planner"><Hotel aria-hidden="true"/>호텔</a><a href="/qingdao/travel"><Wifi aria-hidden="true"/>eSIM</a><a href="/qingdao/store"><ShoppingCart aria-hidden="true"/>귀국 후 쇼핑</a></nav></>;
  return <header className="qg-header qg-reference-header">
    <a className="qg-logo" href="/"><i>Q</i><span>QINGDAO<small>TRAVEL PLATFORM</small></span></a>
    <nav>
      <a href="/qingdao/travel">여행 전</a>
      <a href="/qingdao/planner">맞춤 일정</a>
      <a href="/qingdao/guide">관광지</a>
      <a href="/qingdao/guide#food">맛집</a>
      <a href="/qingdao/guide#local-guide">현지 가이드</a>
      <a href="/?account=reviews">여행 후기</a>
      <a href="/qingdao/travel#safety">여행 안전</a>
      <a href="/qingdao/rewards">이벤트</a>
      <a className="qg-shop-menu" href="/qingdao/store">쇼핑</a>
    </nav>
    <div className="qg-header-tools"><a aria-label="검색" href="/qingdao/guide">⌕</a><button type="button" aria-label="언어 선택">◎ KR⌄</button><a href="/qingdao/login?return_to=/">로그인</a><a className="qg-signup" href="/qingdao/register?return_to=/">회원가입</a></div>
  </header>;
}

export function QingdaoFooter() {
  return <footer className="qg-home-footer"><div className="qg-home-footer-brand"><a className="qg-home-logo" href="/"><ShipWheel aria-hidden="true"/><span>QINGDAO<small>TRAVEL PLATFORM</small></span></a><p>여행 준비부터 현지 경험, 귀국 후 쇼핑까지<br/>칭다오 여행의 모든 것을 한곳에서 만나보세요.</p></div><div><b>여행 서비스</b><a href="/qingdao/planner">맞춤 일정</a><a href="/qingdao/guide">관광지·맛집</a><a href="/qingdao/guide#local-guide">현지 가이드</a></div><div><b>쇼핑·리워드</b><a href="/qingdao/store">여행자 스토어</a><a href="/qingdao/rewards">포인트 안내</a><a href="/qingdao/my">나의 여행</a></div><div><b>고객 안내</b><a href="/qingdao/travel#safety">여행 안전</a><a href="/notices">공지사항</a><a href="/privacy">개인정보처리방침</a></div><small>© 2026 QINGDAO TRAVEL PLATFORM</small></footer>;
}

export function QingdaoPage({ eyebrow, title, description, children, accent = "blue" }: { eyebrow: string; title: string; description: string; children: ReactNode; accent?: "blue" | "teal" | "orange" | "purple" | "navy" }) {
  return <main className={`qg-page qg-section-page qg-accent-${accent}`}><QingdaoHeader home/><section className="qg-inner-hero"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></section><section className="qg-content">{children}</section><QingdaoFooter/></main>;
}
