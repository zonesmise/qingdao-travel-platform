import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCatalog } from "../../lib/data";

export const metadata: Metadata = { title: "개인정보처리방침", robots: { index: true, follow: true } };

export default async function PrivacyPage() {
  const { settings } = await getPublicCatalog();
  return (
    <main className="content-page legal-page">
      <Link className="content-brand" href="/" aria-label={`${settings.brand_name} 홈`}>
        <span>{settings.logo_text || "PG"}</span>
        <div><strong>{settings.brand_name}</strong><small>{settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
      </Link>
      <header><span>PRIVACY POLICY</span><h1>개인정보처리방침</h1></header>
      <article><p>{settings.privacy_text}</p><h2>해외직구 통관정보</h2><p>해외배송과 수입통관을 위해 수취인 이름, 연락처, 주소와 개인통관고유부호를 처리합니다. 개인통관고유부호는 암호화하여 보관하고, 화면에는 일부만 가려 표시하며, 동의한 경우에만 다음 주문에 사용합니다. 법정 보존기간 또는 통관·분쟁 처리 목적이 끝나면 안전하게 파기합니다.</p></article>
      <Link className="back-home" href="/">← 쇼핑몰 홈으로</Link>
    </main>
  );
}
