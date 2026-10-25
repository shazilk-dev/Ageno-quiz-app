import type { SavedAttempt } from "./storage";
import type { AttemptSeed, AttemptState } from "./types";

/**
 * Turns the server's attempt into a seed for the exam. The clock is the server's: `startedAt` is moved
 * onto this device's clock using the gap measured when the response arrived, so a wrong local clock
 * doesn't shorten or lengthen the time allowed.
 *
 * When resuming, the copy saved on this device wins over the server's for answers, flags and position:
 * it is written on every change, while the server only hears about them a moment later.
 */
export function seedFromServer(
  state: AttemptState,
  options: { local?: SavedAttempt | null; receivedAt?: number; resume?: boolean } = {}
): AttemptSeed {
  const { local, receivedAt = Date.now(), resume = false } = options;
  const skew = state.serverNow - receivedAt;
  const saved = local && local.attemptId === state.attemptId ? local : null;

  return {
    attemptId: state.attemptId,
    startedAt: state.startedAt - skew,
    durationSec: state.durationSec,
    difficulty: state.difficulty,
    questions: state.questions,
    progress: resume
      ? {
          answers: saved?.answers ?? state.answers,
          flagged: saved?.flagged ?? state.flagged,
          index: saved?.index ?? state.index,
          tabSwitches: Math.max(saved?.tabSwitches ?? 0, state.tabSwitches),
          fullscreenExits: Math.max(
            saved?.fullscreenExits ?? 0,
            state.fullscreenExits
          ),
        }
      : undefined,
  };
}
