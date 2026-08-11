import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCatalog } from "../../lib/data";

export const metadata: Metadata = {
  title: "공지사항",
  description: "리워드몰 운영, 상품 주문, 리워드 이용과 배송 관련 최신 공지사항입니다.",
  alternates: { canonical: "/notices" },
};

export default async function NoticesPage() {
  const { settings, notices } = await getPublicCatalog();
  return (
    <main className="content-page">
      <Link className="content-brand" href="/" aria-label={`${settings.brand_name} 홈`}>
        <span>{settings.logo_text || "PG"}</span>
        <div><strong>{settings.brand_name}</strong><small>{settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
      </Link>
      <header><span>NOTICE CENTER</span><h1>공지사항</h1><p>이용 전에 알아두면 좋은 운영 안내를 확인하세요.</p></header>
      <section className="notice-list-page">
        {notices.map((notice, index) => (
          <article key={String(notice.id)}>
            <span>{String(notices.length - index).padStart(2, "0")}</span>
            <div><h2>{String(notice.title)}</h2><p>{String(notice.content)}</p></div>
            <time>{new Date(String(notice.created_at)).toLocaleDateString("ko-KR")}</time>
          </article>
        ))}
      </section>
      <Link className="back-home" href="/">← 쇼핑몰 홈으로</Link>
    </main>
  );
}
