import { headers } from "next/headers";
import { getPublicCatalog } from "./data";
import { getNativeMemberSessionFromHeaders } from "./member-auth";
import { getStorePayload } from "../app/api/store/route";

export async function getQingdaoStoreData() {
  const requestHeaders = new Headers(await headers());
  const session = await getNativeMemberSessionFromHeaders(requestHeaders);
  const origin = `${requestHeaders.get("x-forwarded-proto") || "https"}://${requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || ""}`;
  const data = session
    ? await getStorePayload(session.member, "native", origin)
    : await getPublicCatalog();
  return { data, signedIn: Boolean(session) };
}
