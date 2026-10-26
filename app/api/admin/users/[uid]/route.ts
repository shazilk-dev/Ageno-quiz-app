import { requireAdmin } from "@/lib/server/admin-access";
import { deleteUserAccount, setUserRole } from "@/lib/server/admin-users";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ uid: string }> };

/** Changes a person's role: `{ "role": "admin" | "user" }`. Admin only. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const actingUid = await requireAdmin(request);
    const body = await readJsonBody(request);
    return json(await setUserRole((await params).uid, body.role, actingUid));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Deletes a person's account and profile. Admin only. */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const actingUid = await requireAdmin(request);
    return json(await deleteUserAccount((await params).uid, actingUid));
  } catch (error) {
    return errorResponse(error);
  }
}
