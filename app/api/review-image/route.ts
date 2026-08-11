import { requireMember } from "../../../lib/data";
import { getR2, jsonError } from "../../../lib/server";

const MAX_IMAGE_BYTES = 900 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function matchesImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const member = await requireMember(request);
    if (!member) return jsonError("회원 로그인이 필요합니다.", 401);
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return jsonError("안전하지 않은 업로드 요청입니다.", 403);
    }
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return jsonError("후기 사진을 선택해 주세요.");
    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) return jsonError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return jsonError("사진 자동 최적화에 실패했습니다. 사진을 다시 선택해 주세요.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, bytes)) {
      return jsonError("올바른 사진 파일인지 확인해 주세요.");
    }
    const key = `reviews/${Number(member.id)}/${crypto.randomUUID()}.${extension}`;
    await getR2().put(key, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { memberId: String(member.id) },
    });
    return Response.json({
      url: `/api/review-image?key=${encodeURIComponent(key)}`,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "후기 사진을 저장하지 못했습니다.",
      500,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const member = await requireMember(request);
    if (!member) return jsonError("회원 로그인이 필요합니다.", 401);
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return jsonError("안전하지 않은 삭제 요청입니다.", 403);
    }
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const memberPrefix = `reviews/${Number(member.id)}/`;
    if (
      !key.startsWith(memberPrefix) ||
      !/^reviews\/\d+\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key)
    ) {
      return jsonError("삭제할 사진을 확인할 수 없습니다.", 404);
    }
    await getR2().delete(key);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "후기 사진을 삭제하지 못했습니다.",
      500,
    );
  }
}

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!/^reviews\/\d+\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key)) {
      return new Response("Not found", { status: 404 });
    }
    const object = await getR2().get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
