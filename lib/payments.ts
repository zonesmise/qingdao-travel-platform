import { getD1, nowIso } from "./server";

export async function processExpiredPaymentReservations() {
  const db = getD1();
  const expired = await db
    .prepare(
      `SELECT id, coupon_id FROM orders
       WHERE payment_status IN ('awaiting_cash', 'awaiting_kakao')
         AND point_reservation_status = 'reserved'
         AND payment_expires_at IS NOT NULL
         AND payment_expires_at <= ?
       ORDER BY id LIMIT 100`,
    )
    .bind(nowIso())
    .all<{ id: number; coupon_id: number | null }>();

  for (const row of expired.results) {
    const claimed = await db
      .prepare(
        `UPDATE orders
         SET status = '취소', payment_status = 'canceled',
             point_reservation_status = 'released'
         WHERE id = ? AND payment_status IN ('awaiting_cash', 'awaiting_kakao')
           AND point_reservation_status = 'reserved'`,
      )
      .bind(row.id)
      .run();
    if (!Number(claimed.meta.changes ?? 0)) continue;
    const items = await db
      .prepare("SELECT product_id, quantity, selected_options FROM order_items WHERE order_id = ?")
      .bind(row.id)
      .all<{ product_id: number; quantity: number; selected_options: string }>();
    const variantRestores = [];
    for (const item of items.results) {
      let selected: Record<string, string> = {};
      try { selected = JSON.parse(item.selected_options || "{}"); } catch { selected = {}; }
      if (!Object.keys(selected).length) continue;
      const product = await db.prepare("SELECT variants_json FROM products WHERE id = ?").bind(item.product_id).first<{ variants_json: string }>();
      try {
        const variants = JSON.parse(product?.variants_json || "[]");
        if (!Array.isArray(variants)) continue;
        const updated = variants.map((variant) => Object.entries(selected).every(([name, value]) => String(variant?.options?.[name]) === String(value)) ? { ...variant, stock: Number(variant.stock || 0) + item.quantity } : variant);
        variantRestores.push(db.prepare("UPDATE products SET variants_json = ? WHERE id = ?").bind(JSON.stringify(updated), item.product_id));
      } catch { /* malformed legacy option data does not block base-stock recovery */ }
    }
    await db.batch([
      ...items.results.map((item) =>
        db
          .prepare(
            "UPDATE products SET stock = stock + ?, sales_count = MAX(0, sales_count - ?) WHERE id = ?",
          )
          .bind(item.quantity, item.quantity, item.product_id),
      ),
      ...variantRestores,
      ...(row.coupon_id ? [db.prepare("UPDATE coupons SET status = '보관', used_by = NULL, used_at = NULL WHERE id = ? AND coupon_type = 'discount' AND status = '사용'").bind(row.coupon_id)] : []),
    ]);
  }
}

export function kakaoPaymentUrl(
  baseUrl: string,
  order: { orderNo: string; items: string; cashAmount: number },
) {
  const message = [
    `[리워드 쇼핑몰 카카오톡 송금 안내 요청]`,
    `주문번호: ${order.orderNo}`,
    `상품: ${order.items}`,
    `송금할 금액: ${order.cashAmount.toLocaleString("ko-KR")}원`,
  ].join("\n");
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.searchParams.set("text", message);
    return url.toString();
  } catch {
    return trimmed;
  }
}
