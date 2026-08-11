import { canAdmin, isSameOriginMutation } from "../../../lib/admin-auth";
import { requireAdmin, requireMember } from "../../../lib/data";
import { getD1, getR2, jsonError } from "../../../lib/server";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

function matchesImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

function validKey(value: string) {
  return /^channels\/(?:\d+|drafts\/[a-z0-9_-]+)\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(value);
}

function safePart(value: string | number) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60) || "admin";
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return jsonError("안전하지 않은 업로드 요청입니다.", 403);
    const requestedChannel = new URL(request.url).searchParams.get("channelId") ?? "draft";
    const admin = await requireAdmin(request);
    const member = admin ? null : await requireMember(request);
    const adminAllowed = Boolean(admin && canAdmin(admin, "live"));
    const memberAllowed = Boolean(member && /^\d+$/.test(requestedChannel) && await getD1().prepare("SELECT id FROM sales_channels WHERE id = ? AND owner_member_id = ? LIMIT 1").bind(Number(requestedChannel), Number(member.id)).first());
    if (!adminAllowed && !memberAllowed) return jsonError("자기 채널 사진만 등록할 수 있습니다.", 403);
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return jsonError("채널 대표 사진을 선택해 주세요.");
    const extension = ALLOWED_IMAGE_TYPES.get(file.type);
    if (!extension) return jsonError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return jsonError("사진은 2MB 이하로 올려 주세요.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, bytes)) return jsonError("올바른 사진 파일인지 확인해 주세요.");
    const actorId = admin ? `admin-${admin.id}` : `member-${member?.id || 0}`;
    const folder = /^\d+$/.test(requestedChannel) ? requestedChannel : `drafts/${safePart(actorId)}`;
    const key = `channels/${folder}/${crypto.randomUUID()}.${extension}`;
    await getR2().put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { actorId, originalName: file.name.slice(0, 160) } });
    return Response.json({ url: `/api/channel-image?key=${encodeURIComponent(key)}` });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "채널 사진을 저장하지 못했습니다.", 500);
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
