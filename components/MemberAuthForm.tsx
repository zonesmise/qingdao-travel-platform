"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback(response: { credential?: string }): void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ): void;
        };
      };
    };
  }
}

export default function MemberAuthForm({
  mode,
  googleClientId = "",
  signupCodeRequired = false,
  brand,
  experience = "mall",
}: {
  mode: "login" | "register";
  googleClientId?: string;
  signupCodeRequired?: boolean;
  brand: {
    brandName: string;
    brandTagline: string;
    logoText: string;
    primaryColor: string;
    secondaryColor: string;
  };
  experience?: "mall" | "qingdao";
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [returnTo, setReturnTo] = useState("/");
  const formRef = useRef<HTMLFormElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const isQingdao = experience === "qingdao";
  const loginPath = isQingdao ? "/qingdao/login" : "/login";
  const registerPath = isQingdao ? "/qingdao/register" : "/register";
  const homePath = isQingdao ? "/" : "/";

  useEffect(() => {
    setReturnTo(readReturnTo());
  }, []);

  useEffect(() => {
    if (mode !== "register") return;
    const params = new URLSearchParams(window.location.search);
    const incoming = (params.get("ref") || "").trim().toUpperCase();
    const stored = window.localStorage.getItem("point-mall-referral-code") || "";
    const storedAt = Number(window.localStorage.getItem("point-mall-referral-saved-at") || 0);
    const storedValid = storedAt > Date.now() - 30 * 24 * 60 * 60 * 1000;
    const selected = incoming || (storedValid ? stored : "");
    if (selected) {
      window.setTimeout(() => setReferralCode(selected), 0);
      window.localStorage.setItem("point-mall-referral-code", selected);
      window.localStorage.setItem("point-mall-referral-saved-at", String(Date.now()));
      const visitorTokenKey = "point-mall-referral-visitor";
      let visitorToken = window.localStorage.getItem(visitorTokenKey) || "";
      if (!visitorToken) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        visitorToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        window.localStorage.setItem(visitorTokenKey, visitorToken);
      }
      fetch("/api/reward", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "visit", referralCode: selected, visitorToken, landingPath: window.location.pathname }),
      }).catch(() => undefined);
    }
  }, [mode]);

  useEffect(() => {
    if (!googleClientId) return;

    function renderGoogleButton() {
      if (!window.google || !googleButtonRef.current) return;
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          if (!credential) {
            setError("Google 로그인 정보를 받지 못했습니다. 다시 시도해 주세요.");
            return;
          }
          setBusy(true);
          setError("");
          const form = formRef.current
            ? new FormData(formRef.current)
            : new FormData();
          try {
            const response = await fetch("/api/member-auth", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "google",
                mode,
                credential,
                signupCode: form.get("signupCode"),
                referralCode,
                termsAccepted: form.get("termsAccepted") === "on",
                privacyAccepted: form.get("privacyAccepted") === "on",
              }),
            });
            const result = await response.json();
            if (!response.ok) {
              throw new Error(result.error ?? "Google 로그인을 처리하지 못했습니다.");
            }
            window.location.replace(readReturnTo());
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Google 로그인을 처리하지 못했습니다.",
            );
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: mode === "register" ? "signup_with" : "signin_with",
        shape: "rectangular",
        width: 360,
        logo_alignment: "left",
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-identity="true"]',
    );
    if (existing) {
      if (window.google) renderGoogleButton();
      else existing.addEventListener("load", renderGoogleButton, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.addEventListener("load", renderGoogleButton, { once: true });
    script.addEventListener(
      "error",
      () => setError("Google 로그인 화면을 불러오지 못했습니다."),
      { once: true },
    );
    document.head.appendChild(script);
  }, [googleClientId, mode, referralCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/member-auth", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: mode,
        email: form.get("email"),
        password: form.get("password"),
        name: form.get("name"),
        phone: form.get("phone"),
        passwordConfirmation: form.get("passwordConfirmation"),
        signupCode: form.get("signupCode"),
        referralCode,
        termsAccepted: form.get("termsAccepted") === "on",
        privacyAccepted: form.get("privacyAccepted") === "on",
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "요청을 처리하지 못했습니다.");
      setBusy(false);
      return;
    }
    window.location.replace(result.redirectTo || readReturnTo());
  }

  return (
    <main className={`member-auth-shell${isQingdao ? " qingdao-member-auth" : ""}`} style={{ "--brand": brand.primaryColor, "--brand-2": brand.secondaryColor } as React.CSSProperties}>
      {isQingdao && <section className="qingdao-auth-intro" aria-label="칭다오 여행 회원 혜택">
        <span>ONE ACCOUNT, ONE JOURNEY</span>
        <h2>여행의 모든 순간을<br/>하나의 계정으로</h2>
        <p>맞춤 일정과 예약, 현지 활동 리워드,<br/>귀국 후 쇼핑까지 자연스럽게 이어집니다.</p>
        <div><b>01</b> 일정 저장</div><div><b>02</b> 여행 리워드</div><div><b>03</b> 주문·배송 확인</div>
      </section>}
      <a className="auth-brand" href={homePath}>
        <span>{brand.logoText || "PG"}</span>
        <div><strong>{brand.brandName}</strong><small>{brand.brandTagline || "취향을 선물하는 리워드 셀렉트숍"}</small></div>
      </a>
      <section className="member-auth-card">
        <header>
          <span>MEMBER ACCESS</span>
          <h1>{mode === "login" ? "회원 로그인" : isQingdao ? "칭다오 여행 회원가입" : "리워드몰 회원가입"}</h1>
          <p>
            {mode === "login"
              ? isQingdao ? "여행 일정, 예약, 포인트와 주문 내역을 한 계정으로 확인하세요." : "보유 리워드와 주문내역을 안전하게 확인하세요."
              : isQingdao ? "가입 후 맞춤 일정 저장부터 여행 리워드와 쇼핑까지 이어서 이용할 수 있습니다." : "사이트 전용 계정으로 가입하면 ChatGPT 없이 이용할 수 있습니다."}
          </p>
        </header>
        <form ref={formRef} onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                이름
                <input name="name" minLength={2} maxLength={40} autoComplete="name" required />
              </label>
              <label>
                휴대전화
                <input name="phone" autoComplete="tel" inputMode="tel" pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" placeholder="010-0000-0000" required />
              </label>
            </>
          )}
          {mode === "register" && referralCode && (
            <div className="referral-applied-note">
              <strong>친구추천 혜택이 적용되었습니다.</strong>
              <span>가입 인증과 첫 구매 완료 후 운영 중인 추천 보상조건에 따라 리워드가 지급됩니다.</span>
              <small>추천코드 {referralCode} · 가입 후 변경할 수 없습니다.</small>
            </div>
          )}
          <label>
            {mode === "login" ? "이메일 또는 아이디" : "이메일"}
            <input name="email" type={mode === "login" ? "text" : "email"} autoComplete="username" required />
          </label>
          <label>
            비밀번호
            <span className="password-input-wrap">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                minLength={10}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "보기"}
              </button>
            </span>
            {mode === "register" && <small>영문과 숫자를 포함해 10자 이상 입력</small>}
          </label>
          {mode === "register" && (
            <label>
              비밀번호 확인
              <input name="passwordConfirmation" type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" required />
            </label>
          )}
          {mode === "register" && (
            <label>
              친구 추천코드 <small>선택 입력 · 가입 후 변경 불가</small>
              <input
                name="referralCode"
                value={referralCode}
                onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                autoComplete="off"
                placeholder="추천코드가 있다면 입력"
              />
            </label>
          )}
          {mode === "register" && (
            <fieldset className="auth-agreements">
              <legend>필수 동의</legend>
              <label><input name="termsAccepted" type="checkbox" required /> <span><a href="/terms" target="_blank" rel="noreferrer">이용약관</a>에 동의합니다.</span></label>
              <label><input name="privacyAccepted" type="checkbox" required /> <span><a href="/privacy" target="_blank" rel="noreferrer">개인정보 수집·이용</a>에 동의합니다.</span></label>
            </fieldset>
          )}
          {mode === "register" && (
            <label>
              가입코드{" "}
              <small>
                {signupCodeRequired
                  ? "회원가입에 필요한 코드"
                  : "운영자가 설정한 경우에만 입력"}
              </small>
              <input
                name="signupCode"
                autoComplete="off"
                required={signupCodeRequired}
              />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          {googleClientId && (
            <div className="google-auth-option">
              <div className="auth-divider"><span>또는</span></div>
              <div
                ref={googleButtonRef}
                className="google-signin-button"
                aria-label={
                  mode === "register"
                    ? "Google 계정으로 회원가입"
                    : "Google 계정으로 로그인"
                }
              />
              <small>
                Google 비밀번호는 리워드몰에 저장되지 않습니다.
              </small>
            </div>
          )}
          <button disabled={busy}>
            {busy ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
        <footer>
          {mode === "login" ? (
            <><p>아직 회원이 아니신가요? <a href={`${registerPath}?return_to=${encodeURIComponent(returnTo)}`}>회원가입</a></p><p><a href="/forgot-password">비밀번호 재설정 요청</a></p></>
          ) : (
            <p>이미 계정이 있으신가요? <a href={`${loginPath}?return_to=${encodeURIComponent(returnTo)}`}>로그인</a></p>
          )}
          <a href={homePath}>← {isQingdao ? "칭다오 여행 홈으로" : "쇼핑몰로"} 돌아가기</a>
        </footer>
      </section>
      <div className="auth-trust-row">
        <span>✓ 비밀번호 암호화</span>
        <span>✓ 리워드·현금·혼합 결제</span>
        <span>✓ 리워드 이력 보관</span>
      </div>
    </main>
  );
}

function readReturnTo() {
  const requested = new URLSearchParams(window.location.search).get("return_to") || "/";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
}
