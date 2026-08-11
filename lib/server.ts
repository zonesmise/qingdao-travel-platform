export type RequestUser = {
  email: string;
  name: string;
  isPreview: boolean;
};

declare global {
  // The Worker entry sets this binding before Vinext dispatches a request.
  // D1 is deployment-wide, so sharing the binding reference is concurrency-safe.
  var __POINT_MALL_DB__: D1Database | undefined;
  var __POINT_MALL_BUCKET__: R2Bucket | undefined;
  var __POINT_MALL_ADMIN_EMAIL__: string | undefined;
  var __POINT_MALL_GEMINI_API_KEY__: string | undefined;
  var __POINT_MALL_GEMINI_VIDEO_MODEL__: string | undefined;
  var __POINT_MALL_AI_CONFIG_ENCRYPTION_KEY__: string | undefined;
  var __POINT_MALL_PERSONAL_DATA_ENCRYPTION_KEY__: string | undefined;
  var __POINT_MALL_IMAGE_TRANSFORM__: ((
    body: ReadableStream,
    options: Record<string, unknown>,
    output: { format: string; quality: number },
  ) => Promise<Response>) | undefined;
}

export function getD1() {
  if (!globalThis.__POINT_MALL_DB__) {
    throw new Error("데이터베이스 연결을 확인해 주세요.");
  }
  return globalThis.__POINT_MALL_DB__;
}

export function getR2() {
  if (!globalThis.__POINT_MALL_BUCKET__) {
    throw new Error("사진 저장소 연결을 확인해 주세요.");
  }
  return globalThis.__POINT_MALL_BUCKET__;
}

export function getImageTransformer() {
  if (!globalThis.__POINT_MALL_IMAGE_TRANSFORM__) {
    throw new Error("상품 사진 변환 연결을 확인해 주세요.");
  }
  return globalThis.__POINT_MALL_IMAGE_TRANSFORM__;
}

export function getGeminiVideoConfig() {
  return {
    apiKey: globalThis.__POINT_MALL_GEMINI_API_KEY__?.trim() || "",
    model: globalThis.__POINT_MALL_GEMINI_VIDEO_MODEL__?.trim() || "gemini-3.6-flash",
  };
}

export function getAiConfigEncryptionKey() {
  return globalThis.__POINT_MALL_AI_CONFIG_ENCRYPTION_KEY__?.trim() || "";
}

export function getPersonalDataEncryptionKey() {
  return globalThis.__POINT_MALL_PERSONAL_DATA_ENCRYPTION_KEY__?.trim()
    || getAiConfigEncryptionKey();
}

export function isAdminEmail(email: string, isPreview = false) {
  if (isPreview) return true;
  const configuredEmail = globalThis.__POINT_MALL_ADMIN_EMAIL__
    ?.trim()
    .toLowerCase();
  return Boolean(configuredEmail && email.trim().toLowerCase() === configuredEmail);
}

export function getRequestUser(request: Request): RequestUser | null {
  const url = new URL(request.url);
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  const isPreview =
    url.hostname === "terminal.local" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";

  if (isPreview && url.searchParams.get("guest") === "1") return null;
  if (!email && !isPreview) return null;

  let name = email ?? "운영자 미리보기";
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      // Keep the email fallback when a forwarded name is malformed.
    }
  }
  return {
    email: email ?? "preview-admin@pointmall.local",
    name,
    isPreview,
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "private, no-store, max-age=0, must-revalidate",
        pragma: "no-cache",
        expires: "0",
        vary: "Cookie",
      },
    },
  );
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeOrderNo() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `PM${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
