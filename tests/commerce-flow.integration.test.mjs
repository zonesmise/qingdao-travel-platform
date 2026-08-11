import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";

const origin = "http://integration.local";

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

function request(path, body, cookie = "") {
  return new Request(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json", origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

test("real D1 flow: signup, reward grant, mixed order, idempotency, payment, and cancellation", async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-01-01",
    d1Databases: ["DB"],
  });
  globalThis.__POINT_MALL_DB__ = await mf.getD1Database("DB");

  try {
    const memberAuth = await import("../app/api/member-auth/route.ts");
    const adminAuth = await import("../app/api/admin-auth/route.ts");
    const store = await import("../app/api/store/route.ts");
    const admin = await import("../app/api/admin/route.ts");

    const email = `flow-${crypto.randomUUID()}@reward-v2.test`;
    const register = await memberAuth.POST(request("/api/member-auth", {
      action: "register",
      email,
      name: "통합검사 회원",
      phone: "01012345678",
      password: "RewardFlow2026",
      passwordConfirmation: "RewardFlow2026",
      termsAccepted: true,
      privacyAccepted: true,
    }));
    assert.equal(register.status, 201, await register.clone().text());
    const memberCookie = cookieFrom(register);

    let memberStore = await json(await store.GET(request("/api/store", null, memberCookie)));
    assert.equal(Number(memberStore.member.points), 0);
    assert.equal(Number(memberStore.member.reward_points), 0);
    assert.equal(Number(memberStore.member.charge_points), 0);
    assert.equal(memberStore.products.filter((item) => item.category === "신발").length, 16);
    assert.equal(memberStore.products.filter((item) => item.category === "가방").length, 4);
    assert.equal(memberStore.products.filter((item) => item.category === "의류").length, 4);
    const liveProductIds = JSON.parse(memberStore.settings.youtube_live_product_ids || "[]");
    assert.equal(liveProductIds.length, 12);
    assert.ok(liveProductIds.every((id) => memberStore.products.find((item) => Number(item.id) === Number(id))?.category === "신발"));

    const db = globalThis.__POINT_MALL_DB__;
    const copied = await db.prepare(`INSERT INTO products
      (name, category, brand, product_code, description, image_url, image_urls, media_json,
       options_json, variants_json, detail_content, shipping_info, point_price,
       point_usage_mode, point_max_percent, cash_payment_enabled, reward_on_cash_only,
       stock, status, badge, sales_count, created_at)
      SELECT '예전 생활용품', '생활', 'OLD', 'LEGACY-OLD-001', description, image_url,
       image_urls, media_json, '[]', '[]', detail_content, shipping_info, point_price,
       point_usage_mode, point_max_percent, cash_payment_enabled, reward_on_cash_only,
       stock, 'active', '', 0, created_at FROM products ORDER BY id LIMIT 1`).run();
    const legacyProductId = Number(copied.meta.last_row_id);
    await db.batch([
      db.prepare("UPDATE order_items SET product_id = ?, product_name = '예전 생활용품' WHERE id = (SELECT MIN(id) FROM order_items)").bind(legacyProductId),
      db.prepare("INSERT INTO carts (member_id, product_id, selected_options, quantity, created_at) VALUES (?, ?, '{}', 1, ?)").bind(Number(memberStore.member.id), legacyProductId, new Date().toISOString()),
      db.prepare("INSERT INTO wishlists (member_id, product_id, created_at) VALUES (?, ?, ?)").bind(Number(memberStore.member.id), legacyProductId, new Date().toISOString()),
      db.prepare("UPDATE inquiries SET product_id = ? WHERE id = (SELECT MIN(id) FROM inquiries)").bind(legacyProductId),
      db.prepare("UPDATE reviews SET product_id = ? WHERE id = (SELECT MIN(id) FROM reviews)").bind(legacyProductId),
      db.prepare("UPDATE settings SET value = '7' WHERE key = 'catalog_version'"),
      db.prepare("UPDATE settings SET value = ? WHERE key = 'home_display_sections'").bind(JSON.stringify([{ id: "recommended", title: "추천상품", visible: true, sort: "manual", productIds: [legacyProductId] }])),
      db.prepare("UPDATE settings SET value = ? WHERE key = 'youtube_shorts'").bind(JSON.stringify([{ id: "old-short", title: "예전 상품 쇼츠", youtubeUrl: "", productId: legacyProductId, visible: true }])),
    ]);

    memberStore = await json(await store.GET(request("/api/store", null, memberCookie)));
    assert.equal(memberStore.products.some((item) => item.name === "예전 생활용품"), true);
    const staleReferences = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE p.id IS NULL OR oi.product_name != p.name) +
      (SELECT COUNT(*) FROM carts c LEFT JOIN products p ON p.id = c.product_id WHERE p.id IS NULL) +
      (SELECT COUNT(*) FROM wishlists w LEFT JOIN products p ON p.id = w.product_id WHERE p.id IS NULL) +
      (SELECT COUNT(*) FROM reviews r LEFT JOIN products p ON p.id = r.product_id WHERE p.id IS NULL) +
      (SELECT COUNT(*) FROM inquiries i LEFT JOIN products p ON p.id = i.product_id WHERE i.product_id IS NOT NULL AND p.id IS NULL)
      AS count`).first();
    assert.equal(Number(staleReferences.count), 0);
    assert.ok(memberStore.cart.every((item) => ["신발", "가방", "의류"].includes(item.category)));
    assert.ok(JSON.parse(memberStore.settings.youtube_shorts || "[]").every((item) =>
      memberStore.products.find((product) => Number(product.id) === Number(item.productId))?.category === "신발"));

    const prepaid = await store.POST(request("/api/store", { action: "finance.create", amount: 1000 }, memberCookie));
    assert.equal(prepaid.status, 410);

    const adminLogin = await adminAuth.POST(request("/api/admin-auth", {
      action: "login",
      username: "admin",
      password: "admin123456",
    }));
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookieFrom(adminLogin);
    let adminData = await json(await admin.GET(request("/api/admin", null, adminCookie)));
    const newMember = adminData.members.find((item) => item.email === email);
    assert.ok(newMember);

    await json(await admin.POST(request("/api/admin", {
      action: "member.point",
      memberId: newMember.id,
      amount: 10_000,
      memo: "통합검사 지급",
    }, adminCookie)));
    memberStore = await json(await store.GET(request("/api/store", null, memberCookie)));
    assert.equal(Number(memberStore.member.points), 10_000);
    assert.equal(Number(memberStore.member.reward_points), 10_000);
    assert.equal(Number(memberStore.member.charge_points), 0);

    const product = memberStore.products.find((item) => Number(item.stock) >= 2);
    assert.ok(product);
    const selectedOptions = Object.fromEntries(
      JSON.parse(String(product.options_json || "[]")).map((option) => [option.name, option.values[0]]),
    );
    const initialStock = Number(product.stock);
    await json(await store.POST(request("/api/store", {
      action: "cart.add",
      productId: product.id,
      quantity: 1,
      selectedOptions,
    }, memberCookie)));

    const idempotencyKey = `flow_${crypto.randomUUID().replaceAll("-", "")}`;
    const orderBody = {
      action: "order.create",
      idempotencyKey,
      usedPoints: 1_000,
      cashPaymentChannel: "bank_transfer",
      recipient: "통합검사",
      phone: "01012345678",
      postalCode: "04524",
      address1: "서울특별시 중구 세종대로 110",
      addressDetail: "통합검사",
    };
    memberStore = await json(await store.POST(request("/api/store", orderBody, memberCookie)));
    const created = memberStore.orders.find((item) => item.idempotency_key === idempotencyKey);
    assert.ok(created);
    assert.equal(created.payment_status, "awaiting_cash");
    assert.equal(Number(memberStore.member.points), 10_000);
    assert.equal(Number(memberStore.member.available_points), 9_000);
    assert.equal(Number(memberStore.products.find((item) => item.id === product.id).stock), initialStock - 1);

    const repeated = await json(await store.POST(request("/api/store", orderBody, memberCookie)));
    assert.equal(repeated.orders.filter((item) => item.idempotency_key === idempotencyKey).length, 1);

    const confirmations = await Promise.all([
      admin.POST(request("/api/admin", { action: "order.payment_confirm", id: created.id }, adminCookie)),
      admin.POST(request("/api/admin", { action: "order.payment_confirm", id: created.id }, adminCookie)),
    ]);
    assert.equal(confirmations.filter((response) => response.ok).length, 1);

    memberStore = await json(await store.GET(request("/api/store", null, memberCookie)));
    assert.equal(Number(memberStore.member.reward_points), 9_000);
    assert.equal(memberStore.orders.find((item) => item.id === created.id).status, "상품준비");

    await json(await store.POST(request("/api/store", { action: "order.cancel.request", orderId: created.id }, memberCookie)));
    adminData = await json(await admin.POST(request("/api/admin", { action: "order.status", id: created.id, status: "취소" }, adminCookie)));
    assert.ok(adminData);

    memberStore = await json(await store.GET(request("/api/store", null, memberCookie)));
    assert.equal(Number(memberStore.member.reward_points), 10_000);
    assert.equal(Number(memberStore.member.charge_points), 0);
    assert.equal(memberStore.orders.find((item) => item.id === created.id).status, "취소");
    assert.equal(Number(memberStore.products.find((item) => item.id === product.id).stock), initialStock);
  } finally {
    globalThis.__POINT_MALL_DB__ = undefined;
    await mf.dispose();
  }
});
