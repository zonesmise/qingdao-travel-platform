import { ensureSeedData } from "../../../lib/data";
import { getNativeMemberSessionFromHeaders } from "../../../lib/member-auth";
import { getRewardCenter, recordReferralVisit } from "../../../lib/rewards";
import { jsonError } from "../../../lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const session = await getNativeMemberSessionFromHeaders(request.headers);
    if (!session?.member || session.member.status !== "active") {
      return jsonError("회원 로그인이 필요합니다.", 401);
    }
    const url = new URL(request.url);
    return Response.json(
      await getRewardCenter(
        Number(session.member.id),
        `${url.protocol}//${url.host}`,
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "리워드 정보를 불러오지 못했습니다.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeedData();
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action !== "visit") return jsonError("지원하지 않는 요청입니다.");
    const ok = await recordReferralVisit(
      String(body.referralCode ?? ""),
      String(body.visitorToken ?? ""),
      String(body.landingPath ?? "/"),
    );
    return Response.json({ ok });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "추천 방문을 기록하지 못했습니다.",
      500,
    );
  }
}
