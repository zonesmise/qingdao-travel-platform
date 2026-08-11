import type { Metadata } from "next";
import MemberAuthForm from "../../../components/MemberAuthForm";
import { getMemberAuthOptions } from "../../../lib/data";

export const metadata: Metadata = {
  title: "회원가입 | 칭다오 여행 플랫폼",
  description: "칭다오 여행 일정, 예약, 리워드와 쇼핑을 한 계정으로 이용하세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QingdaoRegisterPage() {
  const options = await getMemberAuthOptions();
  const brand = {
    ...options,
    brandName: "QINGDAO TRAVEL PLATFORM",
    brandTagline: "여행 준비부터 귀국 후 쇼핑까지",
    logoText: "QD",
    primaryColor: "#1259d5",
    secondaryColor: "#4d7cff",
  };
  return <MemberAuthForm mode="register" googleClientId={options.googleClientId} signupCodeRequired={options.signupCodeRequired} brand={brand} experience="qingdao" />;
}
