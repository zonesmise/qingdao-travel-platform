"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type BrandSettings = {
  brand_name?: string;
  brand_tagline?: string;
  logo_text?: string;
  primary_color?: string;
  secondary_color?: string;
};

export default function AdminLoginPage() {
  const [settings, setSettings] = useState<BrandSettings>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [credentialsChanged, setCredentialsChanged] = useState(false);
  const [returnTo, setReturnTo] = useState("/admin");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setUsername(params.get("username") ?? "");
      setPasswordChanged(params.get("passwordChanged") === "1");
      setCredentialsChanged(params.get("credentialsChanged") === "1");
      const requestedReturnTo = params.get("return_to") ?? "";
      if (requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")) {
        setReturnTo(requestedReturnTo);
      }
    }, 0);
    fetch("/api/store", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setSettings(payload.settings ?? {}))
      .catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "login",
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "로그인하지 못했습니다.");
      window.location.href = payload.forcePasswordChange
        ? "/admin/change-password"
        : returnTo;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const brand = settings.brand_name || "POINT GARDEN";
  const logo = settings.logo_text || "PG";
  const style = {
    "--brand": settings.primary_color || "#11243e",
    "--brand-2": settings.secondary_color || "#ff6b35",
  } as React.CSSProperties;

  return (
    <main className="admin-auth-page" style={style}>
      <section className="admin-auth-card">
        <header>
          <Link href="/" className="admin-auth-brand" aria-label={`${brand} 쇼핑몰`}>
            <span>{logo}</span>
            <div><strong>{brand}</strong><small>{settings.brand_tagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
          </Link>
          <p>ADMIN CENTER</p>
          <h1>관리자·슈퍼바이저 로그인</h1>
          <small>일반회원 이메일이 아닌 운영 계정 아이디를 입력해 주세요.</small>
        </header>
        <form onSubmit={submit}>
          {passwordChanged && (
            <div className="admin-auth-success">
              새 비밀번호가 저장·확인되었습니다. 아래 아이디로 다시 로그인해 주세요.
            </div>
          )}
          {credentialsChanged && (
            <div className="admin-auth-success">
              최고 관리자 아이디·비밀번호가 변경되었습니다. 새 정보로 다시 로그인해 주세요.
            </div>
          )}
          <label>
            관리자 아이디
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={4}
              required
              autoFocus
            />
          </label>
          <label>
            비밀번호
            <span className="password-input-wrap">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "보기"}
              </button>
            </span>
          </label>
          {error && <div className="admin-auth-error">{error}</div>}
          <button className="admin-auth-submit" disabled={busy}>
            {busy ? "확인 중…" : "관리자 로그인"}
          </button>
        </form>
        <div className="admin-owner-login">
          <span>최고 관리자</span>
          <p>현재 V2 소유자의 ChatGPT 계정으로 안전하게 접속합니다.</p>
          <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>
            ChatGPT 계정으로 최고 관리자 로그인
          </a>
        </div>
        <footer>
          <Link href="/">쇼핑몰로 돌아가기</Link>
        </footer>
      </section>
    </main>
  );
}
