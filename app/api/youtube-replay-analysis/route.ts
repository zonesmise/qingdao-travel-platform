import { canAdmin, isSameOriginMutation } from "../../../lib/admin-auth";
import { getStoredGeminiApiKey } from "../../../lib/ai-secret";
import { requireAdmin } from "../../../lib/data";
import { getD1, getGeminiVideoConfig, jsonError, nowIso } from "../../../lib/server";

type TimelineEntry = {
  id: string;
  time: number;
  broadcastNumber: number;
  productId: number;
  needsReview: boolean;
};

type Replay = {
  id: string;
  title: string;
  youtubeUrl: string;
  date: string;
  completed: boolean;
  timeline: TimelineEntry[];
  analyzedAt?: string;
  analysisModel?: string;
  analysisNote?: string;
};

function validYoutubeUrl(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be");
  } catch {
    return false;
  }
}

function collectText(value: unknown, found: string[] = []): string[] {
  if (!value || found.length > 50) return found;
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "text" || key === "output_text") && typeof child === "string") found.push(child);
      else collectText(child, found);
    }
  }
  return found;
}

function parseAnalysis(payload: unknown) {
  const candidates = collectText(payload);
  for (const text of candidates) {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const first = cleaned.indexOf("[");
    const last = cleaned.lastIndexOf("]");
    if (first < 0 || last <= first) continue;
    try {
      const parsed = JSON.parse(cleaned.slice(first, last + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next text field in the provider response.
    }
  }
  throw new Error("AI 분석 결과 형식을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function normalizedTimeline(items: unknown[], previous: TimelineEntry[]) {
  const normalized = items.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    const time = Math.max(0, Math.floor(Number(row.time ?? row.startTime ?? 0)));
    const broadcastNumber = Math.max(0, Math.min(9999, Math.floor(Number(row.broadcastNumber ?? row.number ?? 0))));
    const confidence = Math.max(0, Math.min(1, Number(row.confidence ?? 0)));
    const prior = previous.find((entry) => entry.broadcastNumber === broadcastNumber && Math.abs(entry.time - time) <= 10);
    return {
      id: prior?.id || `ai-${Date.now().toString(36)}-${index}`,
      time,
      broadcastNumber,
      productId: prior?.productId || 0,
      needsReview: broadcastNumber === 0 || confidence < 0.8 || Boolean(row.needsReview),
    };
  }).filter((entry) => entry.time >= 0);
  return normalized
    .sort((a, b) => a.time - b.time)
    .filter((entry, index, list) => index === 0 || entry.time !== list[index - 1].time || entry.broadcastNumber !== list[index - 1].broadcastNumber)
    .slice(0, 500);
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return jsonError("안전하지 않은 요청입니다. 페이지를 새로고침해 주세요.", 403);
    const admin = await requireAdmin(request);
    if (!admin || !canAdmin(admin, "live")) return jsonError("라이브 커머스 관리 권한이 필요합니다.", 403);

    const body = await request.json() as { replay?: Partial<Replay>; channelId?: number };
    const channelId = Math.max(0, Math.floor(Number(body.channelId || 0)));
    const input = body.replay || {};
    const id = String(input.id || "").trim().slice(0, 100);
    const youtubeUrl = String(input.youtubeUrl || "").trim().slice(0, 500);
    if (!id) return jsonError("재방송을 먼저 추가해 주세요.");
    if (!validYoutubeUrl(youtubeUrl)) return jsonError("공개 유튜브 재방송 주소를 정확히 입력해 주세요.");

    const config = getGeminiVideoConfig();
    const apiKey = config.apiKey || await getStoredGeminiApiKey();
    const model = config.model;
    if (!apiKey) return jsonError("AI 영상 분석 연결이 아직 준비되지 않았습니다. 운영자에게 Gemini API 연결을 요청해 주세요.", 503);

    const prompt = `이 영상은 한국어 라이브 쇼핑 재방송입니다. 영상 전체의 음성과 화면을 분석하여 진행자가 새 상품 소개를 시작하는 순간을 찾으세요.\n\n각 구간에서 방송 진열번호가 말로 언급되거나 화면에 표시되면 그 번호를 기록하세요. 같은 상품이나 같은 번호를 잠깐 반복하는 장면은 하나의 시작 구간으로 합치고, 나중에 다시 본격적으로 소개하면 새 구간으로 기록하세요. 번호를 확실히 알 수 없으면 0으로 기록하고 needsReview를 true로 하세요. 추측해서 번호를 만들지 마세요.\n\n반드시 JSON 배열만 반환하세요. 설명이나 마크다운은 쓰지 마세요. 각 항목 형식: {"time": 시작 초 정수, "broadcastNumber": 1~9999 또는 불명확하면 0, "confidence": 0~1, "needsReview": true 또는 false}. 시간순으로 최대 500개를 반환하세요.`;
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model, input: [{ type: "text", text: prompt }, { type: "video", uri: youtubeUrl }] }),
      signal: AbortSignal.timeout(290_000),
    });
    const providerPayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String((providerPayload as { error?: { message?: string } }).error?.message || "");
      if (/private|unlisted|not found|permission/i.test(providerMessage)) return jsonError("공개 상태의 유튜브 영상만 분석할 수 있습니다. 영상 공개 설정을 확인해 주세요.", 422);
      if (/quota|rate|limit/i.test(providerMessage)) return jsonError("오늘의 AI 영상 분석 한도를 사용했습니다. 잠시 후 다시 시도해 주세요.", 429);
      return jsonError("AI가 영상을 불러오지 못했습니다. 유튜브 주소와 영상 공개 상태를 확인해 주세요.", 502);
    }

    const db = getD1();
    const row = channelId
      ? await db.prepare("SELECT broadcast_settings FROM sales_channels WHERE id = ?").bind(channelId).first<{ broadcast_settings: string }>()
      : await db.prepare("SELECT value FROM settings WHERE key = 'youtube_replays'").first<{ value: string }>();
    let channelSettings: Record<string, string> = {};
    if (channelId) {
      if (!row) return jsonError("방송 채널을 찾을 수 없습니다.", 404);
      try { channelSettings = JSON.parse(String((row as { broadcast_settings?: string }).broadcast_settings || "{}")); } catch { channelSettings = {}; }
    }
    let saved: Replay[] = [];
    try { saved = JSON.parse(channelId ? channelSettings.youtube_replays || "[]" : (row as { value?: string } | undefined)?.value || "[]"); } catch { saved = []; }
    const existing = saved.find((item) => item.id === id);
    const previousTimeline = Array.isArray(input.timeline) ? input.timeline as TimelineEntry[] : existing?.timeline || [];
    const timeline = normalizedTimeline(parseAnalysis(providerPayload), previousTimeline);
    const analyzedAt = nowIso();
    const replay: Replay = {
      id,
      title: String(input.title || existing?.title || "재방송").trim().slice(0, 100),
      youtubeUrl,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? String(input.date) : (existing?.date || analyzedAt.slice(0, 10)),
      completed: Boolean(input.completed ?? existing?.completed),
      timeline,
      analyzedAt,
      analysisModel: model,
      analysisNote: timeline.some((entry) => entry.needsReview) ? "일부 구간은 관리자 확인이 필요합니다." : "모든 구간의 번호를 확인했습니다.",
    };
    const next = saved.some((item) => item.id === id) ? saved.map((item) => item.id === id ? replay : item) : [...saved, replay];
    if (channelId) {
      await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify({ ...channelSettings, youtube_replays: JSON.stringify(next) }), analyzedAt, channelId).run();
    } else {
      await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_replays', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(next), analyzedAt).run();
    }

    const reviewCount = timeline.filter((entry) => entry.needsReview).length;
    return Response.json({ replay, message: `상품 소개 구간 ${timeline.length}개를 찾았습니다.${reviewCount ? ` 확인이 필요한 구간은 ${reviewCount}개입니다.` : ""}` });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return jsonError("영상 분석 시간이 너무 길어 중단되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    return jsonError(error instanceof Error ? error.message : "영상을 분석하지 못했습니다.", 500);
  }
}
