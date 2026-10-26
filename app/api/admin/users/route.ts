import { requireAdmin } from "@/lib/server/admin-access";
import { listUsers } from "@/lib/server/admin-users";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The people list for the Users screen. Admin only. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await listUsers());
  } catch (error) {
    return errorResponse(error);
  }
}
