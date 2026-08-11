import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./channel-admin.css";
import "./qingdao/qingdao.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://qingdao-travel-platform.qldrh1990.chatgpt.site"),
  title: {
    default: "칭다오 트래블 플랫폼",
    template: "%s | 칭다오 트래블 플랫폼",
  },
  description: "맞춤 일정, 관광지, 맛집, 현지 가이드, 여행 후기와 리워드 쇼핑을 한곳에서 만나는 칭다오 여행 플랫폼",
  keywords: ["칭다오 여행", "칭다오 맞춤 일정", "칭다오 관광지", "현지 가이드", "여행 리워드"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "칭다오 트래블 플랫폼",
    description: "여행 준비부터 귀국 후 리워드 쇼핑까지 이어지는 칭다오 여행 플랫폼",
    url: "/",
    siteName: "칭다오 트래블 플랫폼",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "칭다오 트래블 플랫폼",
    description: "칭다오 여행의 모든 것을 한곳에서 준비하세요.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: [{ url: "/api/favicon-v2.svg?rev=2", type: "image/svg+xml", sizes: "any" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
