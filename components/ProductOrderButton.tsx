"use client";

import { useState } from "react";

export default function ProductOrderButton({ productId }: { productId: number }) {
  const [state, setState] = useState("");

  async function add() {
    setState("처리 중...");
    const response = await fetch("/api/store", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cart.add", productId, quantity: 1 }),
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    const payload = await response.json();
    setState(response.ok ? "장바구니에 담았습니다" : payload.error ?? "다시 시도해 주세요");
  }

  return (
    <div className="product-detail-action">
      <button onClick={add}>장바구니 담기</button>
      {state && <span>{state}</span>}
    </div>
  );
}
