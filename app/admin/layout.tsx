import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "관리자 센터",
  robots: { index: false, follow: false, noarchive: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
