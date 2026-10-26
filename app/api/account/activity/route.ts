import { after } from "next/server";
import { readActivity } from "@/lib/server/account";
import { logActivity } from "@/lib/server/activity";
import { errorResponse, json, readJsonBody, requireUserId } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records an account change made in the browser (password, two-factor, ...) in the caller's activity log. */
export async function POST(request: Request) {
  try {
    const uid = await requireUserId(request);
    const { type, details } = readActivity(await readJsonBody(request));
    const userAgent = request.headers.get("user-agent");
    after(() => logActivity(uid, type, details, userAgent));
    return json({ success: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
