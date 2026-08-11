import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailExperience from "../../../components/ProductDetailExperience";
import { getPublicProduct, getPublicProductChannelContext } from "../../../lib/data";
import { getNativeMemberSessionFromHeaders } from "../../../lib/member-auth";
import { getStorePayload } from "../../api/store/route";
import { headers } from "next/headers";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ channel?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicProduct(Number(id));
  if (!data) return { title: "상품을 찾을 수 없습니다" };
  const product = data.product;
  return {
    title: `${product.name} | ${data.settings.brand_name}`,
    description: String(product.description),
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      title: String(product.name),
      description: String(product.description),
      images: [String(product.image_url)],
      type: "website",
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sourceChannelId = Math.max(0, Math.floor(Number((await searchParams)?.channel ?? 0)));
  const data = await getPublicProduct(Number(id));
  if (!data) notFound();
  const sourceChannelData = sourceChannelId
    ? await getPublicProductChannelContext(sourceChannelId, Number(id))
    : null;
  const requestHeaders = new Headers(await headers());
  const session = await getNativeMemberSessionFromHeaders(requestHeaders);
  const origin = `${requestHeaders.get("x-forwarded-proto") || "https"}://${
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || ""
  }`;
  const initialStoreData = session
    ? await getStorePayload(session.member, "native", origin, { skipCatalog: true })
    : null;
  const { product, reviews, questions, related, categories, settings } = data;
  const experienceSettings = sourceChannelData?.settings ?? settings;
  const experienceRelated = sourceChannelData
    ? sourceChannelData.products.filter((item: any) => Number(item.id) !== Number(product.id)).slice(0, 8)
    : related;
  let galleryImages = [String(product.image_url)];
  try {
    const parsed = JSON.parse(String(product.image_urls ?? "[]"));
    if (Array.isArray(parsed)) {
      galleryImages = Array.from(new Set([...galleryImages, ...parsed.map(String).filter(Boolean)]));
    }
  } catch {
    // Keep the representative product image when legacy gallery data is malformed.
  }
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: galleryImages,
    description: product.description,
    category: product.category,
    brand: product.brand || undefined,
    ...(Number(product.review_count) > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(product.rating).toFixed(1),
            reviewCount: Number(product.review_count),
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "KRW",
      price: Number(product.point_price),
      availability: Number(product.stock) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${settings.site_url || ""}/products/${product.id}`,
    },
  };

  return (
    <>
      <ProductDetailExperience
        product={product}
        reviews={reviews}
        questions={questions}
        related={experienceRelated}
        categories={categories}
        settings={experienceSettings}
        initialMember={initialStoreData?.member ?? null}
        initialWishlist={initialStoreData?.wishlist ?? []}
        initialCartCount={initialStoreData?.cart?.length ?? 0}
        sourceChannelId={sourceChannelData ? sourceChannelId : 0}
        sourceChannel={sourceChannelData?.channel ?? null}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </>
  );
}
