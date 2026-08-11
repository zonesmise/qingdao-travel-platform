import { requireAdmin } from "../../../lib/data";
import { isSameOriginMutation } from "../../../lib/admin-auth";
import { getD1, getR2, jsonError, nowIso } from "../../../lib/server";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function matchesImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return jsonError("안전하지 않은 업로드 요청입니다.", 403);
    const admin = await requireAdmin(request);
    if (!admin?.isSupervisor) return jsonError("쇼핑몰 설정 권한이 필요합니다.", 403);
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return jsonError("상담자 사진을 선택해 주세요.");
    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) return jsonError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return jsonError("사진은 2MB 이하로 올려 주세요.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, bytes)) return jsonError("올바른 사진 파일인지 확인해 주세요.");
    const key = "settings/contact/counselor";
    await getR2().put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name.slice(0, 160) } });
    const url = `/api/contact-image?v=${Date.now()}`;
    await getD1()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('contact_counselor_image_url', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(url, nowIso())
      .run();
    return Response.json(
      { url },
      { headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "상담자 사진을 저장하지 못했습니다.", 500);
  }
}

export async function GET() {
  try {
    const object = await getR2().get("settings/contact/counselor");
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
