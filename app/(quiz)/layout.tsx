import { QuizFrame } from "@/components/layout/QuizFrame";

export default function QuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <QuizFrame>{children}</QuizFrame>;
}
