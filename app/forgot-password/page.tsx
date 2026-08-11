import type { Metadata } from "next";
import PasswordResetRequestForm from "../../components/PasswordResetRequestForm";
import { getMemberAuthOptions } from "../../lib/data";

export const metadata: Metadata = { title: "비밀번호 재설정 요청", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const options = await getMemberAuthOptions();
  return <PasswordResetRequestForm brand={options} />;
}
