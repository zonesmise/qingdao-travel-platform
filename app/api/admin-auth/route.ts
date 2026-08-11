import {
  authenticateStaffAdmin,
  deleteCurrentStaffSession,
  getStaffAdminFromHeaders,
  isSameOriginMutation,
  replaceStaffPassword,
} from "../../../lib/admin-auth";
import { ensureSeedData } from "../../../lib/data";
import { jsonError } from "../../../lib/server";

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const admin = await getStaffAdminFromHeaders(request.headers);
    if (!admin) return jsonError("로그인이 필요합니다.", 401);
    return Response.json({ admin }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "관리자 로그인을 확인하지 못했습니다.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonError("안전하지 않은 요청입니다. 페이지를 새로고침해 주세요.", 403);
    }
    await ensureSeedData();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "login") {
      const result = await authenticateStaffAdmin(
        String(body.username ?? ""),
        String(body.password ?? ""),
        request,
      );
      if (!result.ok) return jsonError(result.error, result.status);
      return Response.json(
        {
          ok: true,
          forcePasswordChange: result.admin.forcePasswordChange,
        },
        {
          headers: {
            "set-cookie": result.cookie,
            "cache-control": "no-store",
          },
        },
      );
    }

    if (action === "logout") {
      const cookie = await deleteCurrentStaffSession(request);
      return Response.json(
        { ok: true },
        {
          headers: {
            "set-cookie": cookie,
            "cache-control": "no-store",
          },
        },
      );
    }

    if (action === "password.change") {
      const admin = await getStaffAdminFromHeaders(request.headers);
      if (!admin) return jsonError("로그인이 필요합니다.", 401);
      const result = await replaceStaffPassword(
        admin,
        String(body.currentPassword ?? ""),
        String(body.newPassword ?? ""),
        request,
      );
      if (!result.ok) return jsonError(result.error, result.status);
      return Response.json(
        { ok: true, username: result.username },
        {
          headers: {
            "set-cookie": result.cookie,
            "cache-control": "no-store",
          },
        },
      );
    }

    return jsonError("지원하지 않는 로그인 요청입니다.");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "관리자 로그인 처리에 실패했습니다.",
      500,
    );
  }
}
