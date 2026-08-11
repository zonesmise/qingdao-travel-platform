import type { Metadata } from "next";
import MemberChannelStudio from "../../components/MemberChannelStudio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 방송 채널 관리" };

export default function MyChannelPage() {
  return <MemberChannelStudio />;
}
