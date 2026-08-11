import { getD1 } from "../../../lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await getD1();
  const url = new URL(request.url);
  const channelSlug = String(url.searchParams.get("channel") || "").trim();
  const keys = [
    "youtube_live_enabled",
    "youtube_live_orientation",
    "youtube_live_title",
    "youtube_live_url",
    "youtube_live_notice",
    "youtube_live_product_ids",
    "youtube_live_slots",
    "youtube_live_current_number",
    "youtube_live_history",
  ];
  if (channelSlug) {
    const channel = await db.prepare("SELECT id, name, slug, broadcast_settings FROM sales_channels WHERE slug = ? AND status = 'active'").bind(channelSlug).first<Record<string, unknown>>();
    if (!channel) return Response.json({ error: "방송 채널을 찾을 수 없습니다." }, { status: 404 });
    let settings: Record<string, string> = {};
    try { settings = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { settings = {}; }
    settings = {
      ...settings,
      youtube_live_enabled: settings.youtube_live_enabled === "true" ? "true" : "false",
    };
    let slots: Array<{ productId?: number }> = [];
    try { const parsed = JSON.parse(String(settings.youtube_live_slots || "[]")); slots = Array.isArray(parsed) ? parsed : []; } catch { slots = []; }
    const productIds = Array.from(new Set(slots.map((slot) => Number(slot.productId || 0)).filter(Boolean)));
    const products = productIds.length
      ? await db.prepare(`SELECT id, name, image_url, point_price FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`).bind(...productIds).all()
      : { results: [] };
    return Response.json({
      channelId: Number(channel.id),
      channel: { id: Number(channel.id), name: String(channel.name), slug: String(channel.slug), broadcast_settings: String(channel.broadcast_settings || "{}") },
      settings,
      products: products.results,
    }, { headers: { "cache-control": "no-store" } });
  }
  const placeholders = keys.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).bind(...keys).all();
  const settings = Object.fromEntries(rows.results.map((row: Record<string, unknown>) => [String(row.key), String(row.value ?? "")])) as Record<string, string>;
  let slots: Array<{ productId?: number }> = [];
  try { const parsed = JSON.parse(String(settings.youtube_live_slots || "[]")); slots = Array.isArray(parsed) ? parsed : []; } catch { slots = []; }
  const productIds = Array.from(new Set(slots.map((slot) => Number(slot.productId || 0)).filter(Boolean)));
  const products = productIds.length
    ? await db.prepare(`SELECT id, name, image_url, point_price FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`).bind(...productIds).all()
    : { results: [] };
  return Response.json({ settings, products: products.results }, { headers: { "cache-control": "no-store" } });
}
