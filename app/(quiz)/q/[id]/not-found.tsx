import { QuizNotFound } from "@/components/quiz/lobby/LobbyStates";

/** A quiz id that doesn't exist: a real 404, with the same message the lobby shows. */
export default function NotFound() {
  return <QuizNotFound />;
}
