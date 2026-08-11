import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCatalog } from "../../lib/data";

export const metadata: Metadata = { title: "이용약관", robots: { index: true, follow: true } };

export default async function TermsPage() {
  const { settings } = await getPublicCatalog();
  return (
    <main className="content-page legal-page">
      <Link className="content-brand" href="/" aria-label={`${settings.brand_name} 홈`}>
        <span>{settings.logo_text || "PG"}</span>
        <div><strong>{settings.brand_name}</strong><small>{settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
      </Link>
      <header><span>TERMS OF USE</span><h1>이용약관</h1></header>
      <article><p>{settings.terms_text}</p><h2>해외직구 거래 구조</h2><p>{settings.overseas_terms_notice}</p><h2>배송·통관·반품</h2><p>{settings.overseas_customs_notice}</p><p>{settings.overseas_return_notice}</p><p>통관 지연, 수입 제한, 제세금과 국제 반송비 등 주문 전 확인이 필요한 사항은 상품 상세와 주문서에서 다시 안내합니다.</p></article>
      <Link className="back-home" href="/">← 쇼핑몰 홈으로</Link>
    </main>
  );
}
