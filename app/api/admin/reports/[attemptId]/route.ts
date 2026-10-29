import { requireAdmin } from "@/lib/server/admin-access";
import { getAttemptForAdmin } from "@/lib/server/attempts";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ attemptId: string }> };

/** One finished attempt with the person's answers, the key and the integrity record. Admin only. */
export async function GET(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    return json(await getAttemptForAdmin((await params).attemptId));
  } catch (error) {
    return errorResponse(error);
  }
}
