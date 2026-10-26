import { after } from "next/server";
import { updateOwnProfile } from "@/lib/server/account";
import { logActivity } from "@/lib/server/activity";
import { errorResponse, json, readJsonBody, requireUser } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copies the caller's display name (and the email their token carries) into their own profile. */
export async function PATCH(request: Request) {
  const timing = new ServerTiming();
  try {
    const token = await timing.time("auth", requireUser(request));
    const body = await readJsonBody(request);
    const fields = await timing.time("db", () => updateOwnProfile(token, body));
    if (fields.length > 0) {
      const userAgent = request.headers.get("user-agent");
      after(() => logActivity(token.uid, "profile_updated", { fields }, userAgent));
    }
    return timing.apply(json({ success: true }));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
