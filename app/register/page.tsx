import type { Metadata } from "next";
import MemberAuthForm from "../../components/MemberAuthForm";
import { getMemberAuthOptions } from "../../lib/data";

export const metadata: Metadata = {
  title: "회원가입",
  description: "포인트가든 회원가입 후 지급받은 리워드로 다양한 상품을 주문하세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const options = await getMemberAuthOptions();
  return (
    <MemberAuthForm
      mode="register"
      googleClientId={options.googleClientId}
      signupCodeRequired={options.signupCodeRequired}
      brand={options}
    />
  );
}
