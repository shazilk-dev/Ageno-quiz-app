import { getQuestionCounts } from "@/lib/server/attempts";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/** How many questions each level has. Counts only, for the lobby; the questions come with an attempt. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { quizId } = await params;
    return json({ counts: await getQuestionCounts(quizId) });
  } catch (error) {
    return errorResponse(error);
  }
}
