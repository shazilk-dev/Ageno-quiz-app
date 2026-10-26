import { getAttempt, saveProgress } from "@/lib/server/attempts";
import {
  errorResponse,
  requireUserId,
  json,
  readJsonBody,
} from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The running attempt, for a resume after a reload. */
export async function GET(request: Request, { params }: Context) {
  const timing = new ServerTiming();
  try {
    const { id } = await params;
    const userId = await timing.time("auth", requireUserId(request));
    return timing.apply(json(await timing.time("db", () => getAttempt(id, userId))));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}

/** Autosave: answers, flags, position and the tab-switch and fullscreen-exit counts. */
export async function PATCH(request: Request, { params }: Context) {
  const timing = new ServerTiming();
  try {
    const { id } = await params;
    const userId = await timing.time("auth", requireUserId(request));
    const body = await readJsonBody(request);
    await timing.time("db", () => saveProgress(id, userId, body));
    return timing.apply(json({ ok: true }));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
