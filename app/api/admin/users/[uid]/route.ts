import { requireAdmin } from "@/lib/server/admin-access";
import { deleteUserAccount } from "@/lib/server/admin-users";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ uid: string }> };

/** Deletes a person's account and profile. Admin only. */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const actingUid = await requireAdmin(request);
    return json(await deleteUserAccount((await params).uid, actingUid));
  } catch (error) {
    return errorResponse(error);
  }
}
