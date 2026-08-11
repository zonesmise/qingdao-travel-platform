import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ProductDetailExperience from "../../../../../components/ProductDetailExperience";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { canAdmin, getStaffAdminFromHeaders } from "../../../../../lib/admin-auth";
import { getAdminPreviewProduct } from "../../../../../lib/data";
import { isAdminEmail } from "../../../../../lib/server";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 상품 미리보기",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminProductPreviewPage({ params }: Props) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId < 1) notFound();

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isLocalPreview =
    host.startsWith("terminal.local") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1");

  if (!isLocalPreview) {
    const staffAdmin = await getStaffAdminFromHeaders(requestHeaders);
    if (staffAdmin && !canAdmin(staffAdmin, "products")) redirect("/admin");
    if (!staffAdmin) {
      const user = await getChatGPTUser();
      if (!user || !isAdminEmail(user.email)) {
        redirect(`/admin/login?return_to=${encodeURIComponent(`/admin/products/${productId}/preview`)}`);
      }
    }
  }

  const data = await getAdminPreviewProduct(productId);
  if (!data) notFound();
  const { product, reviews, questions, related, categories, settings } = data;

  return (
    <ProductDetailExperience
      product={product}
      reviews={reviews}
      questions={questions}
      related={related}
      categories={categories}
      settings={settings}
      adminPreview={{ status: String(product.status) }}
    />
  );
}
