import { submitAttempt } from "@/lib/server/attempts";
import {
  errorResponse,
  getRequestUserId,
  json,
  readJsonBody,
} from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Scores the attempt on the server and returns the result (and the review, if the quiz allows it). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await getRequestUserId(request);
    const body = await readJsonBody(request);
    return json(await submitAttempt(id, userId, body));
  } catch (error) {
    return errorResponse(error);
  }
}
