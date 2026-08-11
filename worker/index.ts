/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  POINT_MALL_ADMIN_EMAIL?: string;
  V2_SUPER_ADMIN_EMAIL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_VIDEO_MODEL?: string;
  AI_CONFIG_ENCRYPTION_KEY?: string;
  PERSONAL_DATA_ENCRYPTION_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    globalThis.__POINT_MALL_DB__ = env.DB;
    globalThis.__POINT_MALL_BUCKET__ = env.BUCKET;
    globalThis.__POINT_MALL_ADMIN_EMAIL__ =
      env.V2_SUPER_ADMIN_EMAIL || env.POINT_MALL_ADMIN_EMAIL;
    globalThis.__POINT_MALL_GEMINI_API_KEY__ = env.GEMINI_API_KEY;
    globalThis.__POINT_MALL_GEMINI_VIDEO_MODEL__ = env.GEMINI_VIDEO_MODEL;
    globalThis.__POINT_MALL_AI_CONFIG_ENCRYPTION_KEY__ = env.AI_CONFIG_ENCRYPTION_KEY;
    globalThis.__POINT_MALL_PERSONAL_DATA_ENCRYPTION_KEY__ = env.PERSONAL_DATA_ENCRYPTION_KEY;
    globalThis.__POINT_MALL_IMAGE_TRANSFORM__ = async (body, options, output) => {
      const result = await env.IMAGES.input(body).transform(options).output(output);
      return result.response();
    };
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
