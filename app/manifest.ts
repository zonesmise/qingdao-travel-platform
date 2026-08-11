import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "포인트가든 회원 리워드 쇼핑몰",
    short_name: "포인트가든",
    description: "현금·리워드·혼합 결제와 회원 혜택을 제공하는 쇼핑몰",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#11243e",
    icons: [
      {
        src: "/point-garden-browser-logo-v2.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
