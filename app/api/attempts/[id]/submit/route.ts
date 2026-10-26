import { after } from "next/server";
import { submitAttempt } from "@/lib/server/attempts";
import { countResponse } from "@/lib/server/leaderboard-store";
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
    const result = await timing.time("db", () =>
      submitAttempt(id, userId, body, {
        // The quiz's result count is kept outside the transaction (see `countResponse`).
        onSubmitted: (quizId) => after(() => countResponse(quizId)),
      })
    );
    return timing.apply(json(result));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
