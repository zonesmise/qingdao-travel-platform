import { getPublicCatalog, getPublicChannel } from "../../../lib/data";

const positiveInt = (value: string | null, fallback: number, maximum: number) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const options = {
      page: positiveInt(url.searchParams.get("page"), 1, 100000),
      limit: positiveInt(url.searchParams.get("limit"), 8, 48),
      category: String(url.searchParams.get("category") || "전체").slice(0, 100),
      search: String(url.searchParams.get("search") || "").slice(0, 100),
      includeHomeProducts: false,
      trackView: false,
    };
    const channelSlug = String(url.searchParams.get("channel") || "").trim().slice(0, 120);
    const result = channelSlug
      ? await getPublicChannel(channelSlug, options)
      : await getPublicCatalog(options);
    if (!result) return Response.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
    return Response.json(
      { catalog: result.catalog },
      { headers: { "cache-control": "public, max-age=20, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "상품을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
