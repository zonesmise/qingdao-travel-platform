import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCatalog } from "../../lib/data";

export const metadata: Metadata = {
  title: "리워드몰 이용안내",
  description: "회원가입부터 리워드 확인, 상품 주문, 배송 확인, 취소 환급까지 리워드몰 이용방법을 안내합니다.",
  alternates: { canonical: "/guide" },
};

export default async function GuidePage() {
  const { settings } = await getPublicCatalog();
  return (
    <main className="content-page">
      <Link className="content-brand" href="/" aria-label={`${settings.brand_name} 홈`}>
        <span>{settings.logo_text || "PG"}</span>
        <div><strong>{settings.brand_name}</strong><small>{settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
      </Link>
      <header><span>OVERSEAS DIRECT SHOPPING</span><h1>중국 판매자 해외직구 이용안내</h1><p>중국 판매자가 상품을 공급하고 플랫폼이 결제·배송·통관 안내·고객상담·취소·반품·환불 절차를 관리합니다.</p></header>
      <section className="guide-steps">
        {[
          ["01", "회원가입·로그인", "사이트 전용 이메일 계정으로 안전하게 로그인합니다."],
          ["02", "상품·해외배송 확인", `상품 상세의 중국 판매자, 예상 배송기간(영업일 ${settings.overseas_delivery_min_days || "7"}~${settings.overseas_delivery_max_days || "14"}일), 관세와 반품 조건을 확인합니다.`],
          ["03", "통관정보 입력", "수취인 이름·휴대전화·개인통관고유부호를 관세청 등록정보와 같게 입력합니다. 번호는 암호화되며 동의한 경우에만 다음 주문에 사용합니다."],
          ["04", "리워드·남은 금액 결제", `보유한 ${settings.point_name || "리워드"}를 적용하고 남은 금액을 안내된 결제수단으로 결제합니다.`],
          ["05", "국제배송·통관 확인", "중국 출고 준비, 현지 물류센터, 검수, 국제 운송, 한국 도착, 통관, 국내 배송 단계를 마이페이지에서 확인합니다."],
          ["06", "취소·반품·환불", "발송 전에는 주문 취소를, 배송 후에는 마이페이지에서 반품·교환을 신청합니다. 하자·오배송은 플랫폼 확인 후 판매자 부담, 단순 변심은 국제 반송비가 발생할 수 있습니다."],
        ].map(([no, title, body]) => <article key={no}><span>{no}</span><h2>{title}</h2><p>{body}</p></article>)}
      </section>
      <section className="content-callout"><h2>개인통관고유부호 확인</h2><p>{settings.overseas_customs_notice}</p><a href="https://unipass.customs.go.kr/per/persIndex.do?qryIssTp=1" target="_blank" rel="noreferrer">관세청 UNI-PASS에서 발급·조회하기 →</a></section>
      <section className="content-callout"><h2>배송 지연·세금 안내</h2><p>{settings.overseas_customs_delay_notice}</p><p>{settings.overseas_tax_notice}</p></section>
      <section className="content-callout"><h2>도움이 필요하신가요?</h2><p>고객센터 {settings.support_phone} · {settings.support_hours}</p><Link href="/notices">공지사항 확인하기 →</Link></section>
      <Link className="back-home" href="/">← 쇼핑몰 홈으로</Link>
    </main>
  );
}
