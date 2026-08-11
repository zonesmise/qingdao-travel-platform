import { ensureSeedData } from "../../../lib/data";
import { getD1 } from "../../../lib/server";

function safeColor(value: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? String(value) : fallback;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  await ensureSeedData();
  const rows = await getD1()
    .prepare(
      `SELECT key, value FROM settings
       WHERE key IN ('logo_text', 'logo_url', 'primary_color', 'secondary_color')`,
    )
    .all<{ key: string; value: string }>();
  const settings = Object.fromEntries(
    rows.results.map((row) => [row.key, row.value]),
  );

  if (settings.logo_url) {
    try {
      const logoUrl = new URL(settings.logo_url);
      if (logoUrl.protocol === "https:" || logoUrl.protocol === "http:") {
        return Response.redirect(logoUrl.toString(), 302);
      }
    } catch {
      // Fall back to the configurable text logo.
    }
  }

  const primary = safeColor(settings.primary_color, "#11243e");
  const secondary = safeColor(settings.secondary_color, "#ff6b35");
  const logo = escapeXml((settings.logo_text || "PG").trim().slice(0, 3) || "PG");
  const fontSize = logo.length > 2 ? 20 : 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="18" fill="${primary}"/>
    <path d="M42 0h4c9.94 0 18 8.06 18 18v4L42 0Z" fill="${secondary}"/>
    <text x="32" y="40" fill="white" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle">${logo}</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
