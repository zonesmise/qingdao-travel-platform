"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function PasswordResetRequestForm({ brand }: { brand: { brandName: string; brandTagline: string; logoText: string; primaryColor: string; secondaryColor: string } }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/member-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "password-reset-request", email: form.get("email"), phone: form.get("phone") }),
    });
    const result = await response.json();
    setMessage(result.message || "재설정 요청을 접수했습니다.");
    setBusy(false);
  }
  return <main className="member-auth-shell" style={{ "--brand": brand.primaryColor, "--brand-2": brand.secondaryColor } as React.CSSProperties}><Link className="auth-brand" href="/"><span>{brand.logoText || "PG"}</span><div><strong>{brand.brandName}</strong><small>{brand.brandTagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div></Link><section className="member-auth-card"><header><span>ACCOUNT RECOVERY</span><h1>비밀번호 재설정 요청</h1><p>가입한 이메일과 휴대전화를 입력하면 관리자가 확인 후 임시 비밀번호를 발급합니다.</p></header><form onSubmit={submit}><label>가입 이메일<input name="email" type="email" autoComplete="email" required /></label><label>가입 휴대전화<input name="phone" autoComplete="tel" placeholder="010-0000-0000" required /></label>{message && <p className="auth-success">{message}</p>}<button disabled={busy}>{busy ? "요청 중..." : "재설정 요청"}</button></form><footer><p><Link href="/login">회원 로그인으로 돌아가기</Link></p><Link href="/">← 쇼핑몰로 돌아가기</Link></footer></section></main>;
}
