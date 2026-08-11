import AdminDashboard from "../../components/AdminDashboard";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import { isAdminEmail } from "../../lib/server";
import { getStaffAdminFromHeaders } from "../../lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isPreview =
    host.startsWith("terminal.local") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1");

  if (isPreview) return <AdminDashboard />;

  const staffAdmin = await getStaffAdminFromHeaders(requestHeaders);
  if (staffAdmin?.forcePasswordChange) redirect("/admin/change-password");
  if (staffAdmin) return <AdminDashboard />;

  const user = await getChatGPTUser();
  if (!user || !isAdminEmail(user.email)) redirect("/admin/login");

  return <AdminDashboard />;
}
