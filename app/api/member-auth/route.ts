import { ensureSeedData } from "../../../lib/data";
import {
  authenticateGoogleMember,
  authenticateMember,
  createSupervisorMemberSession,
  logoutMember,
  registerMember,
  requestMemberPasswordReset,
} from "../../../lib/member-auth";
import { authenticateStaffAdmin, isSameOriginMutation } from "../../../lib/admin-auth";
import { jsonError } from "../../../lib/server";

function withCookies(payload: unknown, status: number, cookies: string[]) {
  const response = Response.json(payload, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0, must-revalidate",
      pragma: "no-cache",
      expires: "0",
      vary: "Cookie",
    },
  });
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonError("안전하지 않은 요청입니다. 페이지를 새로고침해 주세요.", 403);
    }
    await ensureSeedData();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "register") {
      const result = await registerMember(
        {
          email: String(body.email ?? ""),
          name: String(body.name ?? ""),
          phone: String(body.phone ?? ""),
          password: String(body.password ?? ""),
          passwordConfirmation: String(body.passwordConfirmation ?? ""),
          signupCode: String(body.signupCode ?? ""),
          referralCode: String(body.referralCode ?? ""),
          termsAccepted: body.termsAccepted === true,
          privacyAccepted: body.privacyAccepted === true,
        },
        request,
      );
      if (!result.ok) return jsonError(result.error, result.status);
      return withCookies({ ok: true }, result.status, result.cookies);
    }
    if (action === "login") {
      const identifier = String(body.email ?? "").trim();
      const result = await authenticateMember(
        identifier,
        String(body.password ?? ""),
        request,
      );
      if (!result.ok && !identifier.includes("@")) {
        const supervisor = await authenticateStaffAdmin(
          identifier,
          String(body.password ?? ""),
          request,
        );
        if (supervisor.ok && supervisor.admin.isSupervisor) {
          const memberCookies = await createSupervisorMemberSession(
            Number(supervisor.admin.id),
            supervisor.admin.name,
            request,
          );
          return withCookies(
            {
              ok: true,
              redirectTo: supervisor.admin.forcePasswordChange
                ? "/admin/change-password"
                : undefined,
            },
            200,
            [supervisor.cookie, ...memberCookies],
          );
        }
      }
      if (!result.ok) return jsonError(result.error, result.status);
      return withCookies({ ok: true }, result.status, result.cookies);
    }
    if (action === "password-reset-request") {
      await requestMemberPasswordReset(String(body.email ?? ""), String(body.phone ?? ""));
      return Response.json({ ok: true, message: "입력 정보가 가입 정보와 일치하면 관리자에게 재설정 요청이 전달됩니다." });
    }
    if (action === "google") {
      const result = await authenticateGoogleMember(
        String(body.credential ?? ""),
        body.mode === "register" ? "register" : "login",
        String(body.signupCode ?? ""),
        request,
        String(body.referralCode ?? ""),
        {
          termsAccepted: body.termsAccepted === true,
          privacyAccepted: body.privacyAccepted === true,
        },
      );
      if (!result.ok) return jsonError(result.error, result.status);
      return withCookies({ ok: true }, result.status, result.cookies);
    }
    if (action === "logout") {
      return withCookies({ ok: true }, 200, await logoutMember(request));
    }
    return jsonError("지원하지 않는 요청입니다.");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "로그인 요청을 처리하지 못했습니다.",
      500,
    );
  }
}
