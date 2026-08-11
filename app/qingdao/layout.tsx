import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "칭다오ON | 칭다오 여행의 모든 것",
  description: "맞춤 일정, 관광지, 맛집, 현지 가이드, 여행 후기와 쇼핑을 한곳에서 만나는 칭다오 여행 플랫폼",
};

export default function QingdaoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
