import { getAttempt, saveProgress } from "@/lib/server/attempts";
import {
  errorResponse,
  requireUserId,
  json,
  readJsonBody,
} from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The running attempt, for a resume after a reload. */
export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await requireUserId(request);
    return json(await getAttempt(id, userId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Autosave: answers, flags, position and the tab-switch and fullscreen-exit counts. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await requireUserId(request);
    const body = await readJsonBody(request);
    await saveProgress(id, userId, body);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
