import type { Metadata } from "next";
import LiveAssistant from "../../../components/LiveAssistant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 채널 방송 보조창" };

export default function MemberLiveAssistantPage() {
  return <LiveAssistant memberMode />;
}
