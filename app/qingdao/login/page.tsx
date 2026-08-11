import type { Metadata } from "next";
import MemberAuthForm from "../../../components/MemberAuthForm";
import { getMemberAuthOptions } from "../../../lib/data";

export const metadata: Metadata = {
  title: "로그인 | 칭다오 여행 플랫폼",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QingdaoLoginPage() {
  const options = await getMemberAuthOptions();
  const brand = {
    ...options,
    brandName: "QINGDAO TRAVEL PLATFORM",
    brandTagline: "여행 준비부터 귀국 후 쇼핑까지",
    logoText: "QD",
    primaryColor: "#1259d5",
    secondaryColor: "#4d7cff",
  };
  return <MemberAuthForm mode="login" googleClientId={options.googleClientId} brand={brand} experience="qingdao" />;
}
