import { isSameOriginMutation } from "../../../lib/admin-auth";
import { encryptGeminiApiKey } from "../../../lib/ai-secret";
import { requireAdmin } from "../../../lib/data";
import { getD1, jsonError, nowIso } from "../../../lib/server";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("관리자 권한이 필요합니다.", 403);
    const row = await getD1().prepare("SELECT value FROM settings WHERE key = 'gemini_api_key_encrypted'").first<{ value: string }>();
    return Response.json({ configured: Boolean(row?.value), canManage: admin.isSupervisor });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "AI 연결 상태를 확인하지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return jsonError("안전하지 않은 요청입니다. 페이지를 새로고침해 주세요.", 403);
    const admin = await requireAdmin(request);
    if (!admin?.isSupervisor) return jsonError("슈퍼바이저만 AI 연결을 변경할 수 있습니다.", 403);
    const body = await request.json() as { apiKey?: unknown; remove?: unknown };
    const db = getD1();
    if (body.remove) {
      await db.prepare("DELETE FROM settings WHERE key = 'gemini_api_key_encrypted'").run();
      return Response.json({ configured: false, canManage: true });
    }
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length < 20 || apiKey.length > 300) return jsonError("Gemini API 키를 정확히 입력해 주세요.");
    const encrypted = await encryptGeminiApiKey(apiKey);
    await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('gemini_api_key_encrypted', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(encrypted, nowIso()).run();
    return Response.json({ configured: true, canManage: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "AI 연결을 저장하지 못했습니다.", 500);
  }
}
