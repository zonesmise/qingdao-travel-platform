import type { Metadata } from "next";
import MemberAuthForm from "../../components/MemberAuthForm";
import { getMemberAuthOptions } from "../../lib/data";

export const metadata: Metadata = {
  title: "회원 로그인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const options = await getMemberAuthOptions();
  return <MemberAuthForm mode="login" googleClientId={options.googleClientId} brand={options} />;
}
