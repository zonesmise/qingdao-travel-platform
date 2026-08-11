import LiveAssistant from "../../../components/LiveAssistant";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAdminEmail } from "../../../lib/server";
import { getStaffAdminFromHeaders } from "../../../lib/admin-auth";
import { ensureSeedData } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function LiveAssistantPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isPreview = host.startsWith("terminal.local") || host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (isPreview) return <LiveAssistant />;
  await ensureSeedData();
  const staffAdmin = await getStaffAdminFromHeaders(requestHeaders);
  if (staffAdmin?.forcePasswordChange) redirect("/admin/change-password");
  if (staffAdmin) return <LiveAssistant />;
  const user = await getChatGPTUser();
  if (!user || !isAdminEmail(user.email)) redirect("/admin/login");
  return <LiveAssistant />;
}
