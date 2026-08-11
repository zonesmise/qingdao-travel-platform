import type { MetadataRoute } from "next";
import { getPublicCatalog } from "../lib/data";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings } = await getPublicCatalog();
  const base = String(settings.site_url || "https://reward-point-mall-v2.qldrh1990.chatgpt.site").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products/", "/guide", "/notices", "/terms", "/privacy"],
        disallow: ["/admin", "/api", "/login", "/register"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
