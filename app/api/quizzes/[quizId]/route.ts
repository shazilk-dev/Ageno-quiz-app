import { getPublicQuiz } from "@/lib/server/quizzes";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";

type Context = { params: Promise<{ quizId: string }> };

/** One quiz for its lobby, with how many questions each level has. Public; no access code, no questions. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { quizId } = await params;
    return json(
      await getPublicQuiz(quizId),
      200,
      "public, s-maxage=30, stale-while-revalidate=120"
    );
  } catch (error) {
    return errorResponse(error);
  }
}
