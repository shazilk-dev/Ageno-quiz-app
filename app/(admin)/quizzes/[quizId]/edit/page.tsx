import { QuizEditor } from "@/components/admin/quiz-editor/QuizEditor";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  return <QuizEditor mode="edit" quizId={quizId} />;
}
