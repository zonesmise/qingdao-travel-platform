import { canAdmin, isSameOriginMutation } from "../../../lib/admin-auth";
import { requireAdmin } from "../../../lib/data";
import { getR2, jsonError } from "../../../lib/server";

const MAX_IMAGE_BYTES = 1500 * 1024;
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

function validKey(value: string) {
  return /^products\/(?:\d+|drafts\/[a-z0-9_-]+)\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(
    value,
  );
}

function adminKey(value: string | number) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60) || "admin";
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonError("안전하지 않은 업로드 요청입니다.", 403);
    }
    const admin = await requireAdmin(request);
    if (!admin || !canAdmin(admin, "products")) {
      return jsonError("상품 사진을 등록할 관리자 권한이 필요합니다.", 403);
    }
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return jsonError("상품 사진을 선택해 주세요.");
    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) return jsonError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return jsonError("사진 자동 최적화에 실패했습니다. 사진을 다시 선택해 주세요.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, bytes)) {
      return jsonError("올바른 사진 파일인지 확인해 주세요.");
    }

    const requestedProduct = new URL(request.url).searchParams.get("productId") ?? "draft";
    const productFolder = /^\d+$/.test(requestedProduct)
      ? requestedProduct
      : `drafts/${adminKey(admin.id)}`;
    const key = `products/${productFolder}/${crypto.randomUUID()}.${extension}`;
    await getR2().put(key, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        adminId: String(admin.id),
        productId: /^\d+$/.test(requestedProduct) ? requestedProduct : "",
        originalName: file.name.slice(0, 160),
      },
    });
    return Response.json({
      url: `/api/product-image?key=${encodeURIComponent(key)}`,
      size: file.size,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "상품 사진을 저장하지 못했습니다.",
      500,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonError("안전하지 않은 삭제 요청입니다.", 403);
    }
    const admin = await requireAdmin(request);
    if (!admin || !canAdmin(admin, "products")) {
      return jsonError("상품 사진을 삭제할 관리자 권한이 필요합니다.", 403);
    }
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!validKey(key)) return jsonError("삭제할 상품 사진을 찾을 수 없습니다.", 404);
    await getR2().delete(key);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "상품 사진을 삭제하지 못했습니다.",
      500,
    );
  }
}

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!validKey(key)) return new Response("Not found", { status: 404 });
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
