import { requireAdmin } from "@/lib/server/admin-access";
import { getDashboard } from "@/lib/server/admin-reports";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The dashboard's numbers and latest items, from counts and small queries. Admin only. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await getDashboard());
  } catch (error) {
    return errorResponse(error);
  }
}
