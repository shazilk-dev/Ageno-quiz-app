import { submitAttempt } from "@/lib/server/attempts";
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

/** Scores the attempt on the server and returns the result (and the review, if the quiz allows it). */
export async function POST(request: Request, { params }: Context) {
  const timing = new ServerTiming();
  try {
    const { id } = await params;
    const userId = await timing.time("auth", requireUserId(request));
    const body = await readJsonBody(request);
    return timing.apply(json(await timing.time("db", () => submitAttempt(id, userId, body))));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
