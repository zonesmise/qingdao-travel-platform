"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AdminPasswordChangePage() {
  const [name, setName] = useState("관리자");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch("/api/admin-auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          window.location.href = "/admin/login";
          return null;
        }
        return response.json();
      })
      .then((payload) => {
        if (payload?.admin?.name) setName(payload.admin.name);
        if (payload?.admin?.username) setUsername(payload.admin.username);
      })
      .catch(() => {
        window.location.href = "/admin/login";
      });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "password.change",
          currentPassword,
          newPassword,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "비밀번호를 변경하지 못했습니다.");
      const confirmedUsername = String(payload.username ?? username);
      window.location.href = `/admin/login?passwordChanged=1&username=${encodeURIComponent(confirmedUsername)}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card password-card">
        <header>
          <div className="admin-auth-brand">
            <span>PW</span>
            <strong>보안 설정</strong>
          </div>
          <p>FIRST SIGN IN</p>
          <h1>{name}님, 비밀번호를 변경해 주세요</h1>
          <small>처음 발급된 임시 비밀번호는 계속 사용할 수 없습니다.</small>
          {username && <div className="admin-identity-note">관리자 아이디 <strong>{username}</strong></div>}
        </header>
        <form onSubmit={submit}>
          <label>
            현재 임시 비밀번호
            <span className="password-input-wrap">
              <input
                name="currentPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                autoFocus
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "보기"}
              </button>
            </span>
          </label>
          <label>
            새 비밀번호
            <span className="password-input-wrap">
              <input
                name="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={10}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "보기"}
              </button>
            </span>
            <small>영문과 숫자를 포함해 10자 이상</small>
          </label>
          <label>
            새 비밀번호 확인
            <span className="password-input-wrap">
              <input
                name="confirmation"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={10}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "보기"}
              </button>
            </span>
          </label>
          {error && <div className="admin-auth-error">{error}</div>}
          <button className="admin-auth-submit" disabled={busy}>
            {busy ? "변경 중…" : "비밀번호 변경 후 다시 로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
