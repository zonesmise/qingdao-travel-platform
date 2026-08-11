"use client";
/* eslint-disable @next/next/no-img-element */

import { ImgHTMLAttributes, useState } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string;
};

export default function SafeProductImage({
  src,
  alt = "",
  className,
  fallbackLabel = "상품 이미지",
  onError,
  ...props
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  if (failed) {
    return (
      <span
        className={["safe-product-image-fallback", className].filter(Boolean).join(" ")}
        role="img"
        aria-label={`${alt || fallbackLabel} 준비 중`}
      >
        <span aria-hidden="true">▧</span>
        <small>{fallbackLabel} 준비 중</small>
      </span>
    );
  }

  return (
    <img
      {...props}
      loading={props.loading ?? "lazy"}
      decoding={props.decoding ?? "async"}
      className={className}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailedSrc(String(src));
        onError?.(event);
      }}
    />
  );
}
