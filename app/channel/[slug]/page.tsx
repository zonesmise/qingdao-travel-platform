import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Storefront from "../../../components/Storefront";
import { getPublicChannel } from "../../../lib/data";
import { getNativeMemberSessionFromHeaders } from "../../../lib/member-auth";
import { getStorePayload } from "../../api/store/route";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

const getCachedPublicChannel = cache(getPublicChannel);

function guestChannelShell() {
  return {
    settings: {},
    products: [],
    salesChannels: [],
    cart: [],
    addresses: [],
    wishlist: [],
    orders: [],
    reviewableItems: [],
    pointLogs: [],
    pointSummary: { earned: 0, used: 0, count: 0 },
    attendance: { enabled: false, todayChecked: false, today: null, streak: 0, dailyPoints: 0, streakDays: 0, streakBonus: 0, history: [] },
    finance: [],
    reviews: [],
    popups: [],
    notices: [],
    inquiries: [],
    memberAuthType: "guest" as const,
    member: { id: 0, email: "", name: "방문자", role: "guest", status: "guest", points: 0, phone: "" },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCachedPublicChannel(slug);
  if (!data) return { title: "채널을 찾을 수 없습니다" };
  return {
    title: `${data.channel.name} | ${data.settings.brand_name}`,
    description: String(data.channel.description || `${data.channel.name}의 방송과 추천 상품을 만나보세요.`),
    alternates: { canonical: `/channel/${data.channel.slug}` },
  };
}

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params;
  const requestHeaders = new Headers(await headers());
  const session = await getNativeMemberSessionFromHeaders(requestHeaders);
  const origin = `${requestHeaders.get("x-forwarded-proto") || "https"}://${
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || ""
  }`;
  const channelData = await getCachedPublicChannel(slug);
  if (!channelData) notFound();
  const catalog = session
    ? await getStorePayload(session.member, "native", origin, { skipCatalog: true })
    : guestChannelShell();

  const initialData = {
    ...catalog,
    settings: channelData.settings,
    products: channelData.products,
    catalog: channelData.catalog,
    salesChannels: [],
  };

  return <Storefront initialData={initialData} channelContext={{ channel: channelData.channel, otherChannels: channelData.otherChannels }} />;
}
