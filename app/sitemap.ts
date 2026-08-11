import type { MetadataRoute } from "next";
import { getPublicCatalog } from "../lib/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { settings, products } = await getPublicCatalog();
  const base = String(settings.site_url || "https://reward-point-mall-v2.qldrh1990.chatgpt.site").replace(/\/$/, "");
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/notices`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...products.map((product) => ({
      url: `${base}/products/${product.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
