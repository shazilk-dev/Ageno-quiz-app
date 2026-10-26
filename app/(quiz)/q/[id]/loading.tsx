import { LobbySkeleton } from "@/components/quiz/lobby/LobbyStates";

/** A lobby's first visit is rendered on the server; this shows meanwhile. Later visits are static. */
export default function LobbyLoading() {
  return <LobbySkeleton />;
}
