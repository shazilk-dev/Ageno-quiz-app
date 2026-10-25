// Integration tests for the attempt routes (start, resume, autosave, submit) and the lobby's question
// counts, run against the Firestore emulator through the real route handlers. They need the emulator:
//   npx firebase emulators:exec --only firestore --project demo-ageno-attempts "npx vitest run __tests__/attempts-api.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/firebase/admin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-ageno-attempts" });
  return {
    db: getFirestore(app),
    // A token is "uid:<id>" here; anything else fails to verify.
    auth: {
      verifyIdToken: async (token: string) => {
        if (token.startsWith("uid:")) return { uid: token.slice(4) };
        throw new Error("invalid token");
      },
    },
  };
});

import { db } from "@/firebase/admin";
import { GET as getAttemptRoute, PATCH as patchRoute } from "@/app/api/attempts/[id]/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { POST as startRoute } from "@/app/api/attempts/start/route";
import { GET as summaryRoute } from "@/app/api/quizzes/[quizId]/summary/route";
import {
  SUBMIT_GRACE_MS,
  getAttempt,
  saveProgress,
  startAttempt,
  submitAttempt,
} from "@/lib/server/attempts";
import type { AttemptState, SubmitResult } from "@/lib/exam/types";

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
// The first call pays for connecting to the emulator, which can take longer than the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const option = (text: string, isCorrect: boolean) => ({ id: text, text, isCorrect });
const QUESTIONS: Record<string, Record<string, unknown>> = {
  q1: {
    text: "One",
    options: [option("a", false), option("b", true), option("c", false)],
    points: 1,
    explanation: "B is right.",
  },
  q2: { text: "Two", options: [option("a", true), option("b", false)], points: 1 },
  q3: {
    // Older shape: bare strings and a correctIndex.
    text: "Three",
    options: ["x", "y", "z"],
    correctIndex: 2,
    points: 1,
    imageUrl: "https://example.com/three.png",
  },
};
const RIGHT = { q1: 1, q2: 0, q3: 2 };

let counter = 0;
const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

async function seedQuiz(
  quiz: Record<string, unknown> = {},
  { level = "medium", questions = QUESTIONS, legacy = false } = {}
) {
  const id = unique("quiz");
  await db.collection("quizzes").doc(id).set({
    title: "Sample",
    description: "",
    isAutoCheck: true,
    duration: 10,
    accessCode: id.toUpperCase(),
    availableDifficulties: ["easy", "medium", "hard"],
    difficultySettings: { hard: { duration: 5, pointsMultiplier: 1.5 } },
    ...quiz,
  });
  const collection = legacy ? "questions" : `questions_${level}`;
  for (const [qid, data] of Object.entries(questions)) {
    await db.doc(`quizzes/${id}/${collection}/${qid}`).set(data);
  }
  return id;
}

const request = (url: string, method: string, user?: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { authorization: `Bearer uid:${user}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const start = (body: unknown, user?: string) =>
  startRoute(request("/api/attempts/start", "POST", user, body));
const startOk = async (quizId: string, difficulty = "medium", user?: string) => {
  const response = await start({ quizId, difficulty }, user);
  expect(response.status).toBe(201);
  return (await response.json()) as AttemptState;
};
const submit = (id: string, body: unknown, user?: string) =>
  submitRoute(request(`/api/attempts/${id}/submit`, "POST", user, body), ctx(id));
const patch = (id: string, body: unknown, user?: string) =>
  patchRoute(request(`/api/attempts/${id}`, "PATCH", user, body), ctx(id));
const get = (id: string, user?: string) =>
  getAttemptRoute(request(`/api/attempts/${id}`, "GET", user), ctx(id));

const errorCode = async (response: Response) => (await response.json()).error;

describe.skipIf(!emulator)("question counts for the lobby", () => {
  it("counts each level and shows no question content", async () => {
    const id = await seedQuiz({}, { level: "easy" });
    await db.doc(`quizzes/${id}/questions_hard/h1`).set(QUESTIONS.q1);
    const response = await summaryRoute(request(`/api/quizzes/${id}/summary`, "GET"), {
      params: Promise.resolve({ quizId: id }),
    });
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ counts: { easy: 3, medium: 0, hard: 1 } });
    expect(text).not.toContain("One");
  });

  it("falls back to the legacy collection for levels with no questions, like the exam does", async () => {
    const id = await seedQuiz({}, { legacy: true });
    const response = await summaryRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: id }) });
    expect((await response.json()).counts).toEqual({ easy: 3, medium: 3, hard: 3 });
  });

  it("404s for an unknown quiz and rejects odd ids", async () => {
    const missing = await summaryRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "nope" }) });
    expect(missing.status).toBe(404);
    const odd = await summaryRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "a/b" }) });
    expect(odd.status).toBe(400);
  });
});

describe.skipIf(!emulator)("starting an attempt", () => {
  it("returns the questions without any answer key, with the clock fixed on the server", async () => {
    const quizId = await seedQuiz();
    const before = Date.now();
    const response = await start({ quizId, difficulty: "medium" }, "alice");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;

    expect(response.status).toBe(201);
    expect(raw).not.toMatch(/correctIndex|isCorrect|explanation|B is right/);
    expect(state.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(state.questions[0]).toEqual({ id: "q1", text: "One", options: ["a", "b", "c"] });
    expect(state.questions[2].options).toEqual(["x", "y", "z"]);
    expect(state.questions[2].imageUrl).toBe("https://example.com/three.png");
    expect(state.durationSec).toBe(600); // the quiz's own 10 minutes for "medium"
    expect(state.deadline - state.startedAt).toBe(600_000);
    expect(state.startedAt).toBeGreaterThanOrEqual(before - 1);
    expect(Math.abs(state.serverNow - Date.now())).toBeLessThan(5_000);
    expect(state.answers).toEqual({ q1: null, q2: null, q3: null });
  });

  it("uses the level's own duration", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    expect((await startOk(quizId, "hard", "alice")).durationSec).toBe(300);
  });

  it("lets a guest in, and keeps an attempt for a guest out of a signed-in user's hands", async () => {
    const quizId = await seedQuiz();
    const guest = await startOk(quizId);
    expect((await get(guest.attemptId)).status).toBe(200);
    expect((await get(guest.attemptId, "alice")).status).toBe(404);
  });

  it("refuses a bad token rather than treating the person as a guest", async () => {
    const quizId = await seedQuiz();
    const response = await startRoute(
      new Request("http://localhost/api/attempts/start", {
        method: "POST",
        headers: { authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ quizId, difficulty: "medium" }),
      })
    );
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("invalid_token");
  });

  it("rejects a missing quiz, an inactive one, an empty level, a bad level and a bad body", async () => {
    expect((await start({ quizId: "doesnotexist", difficulty: "medium" })).status).toBe(404);

    const inactive = await seedQuiz({ active: false });
    const closed = await start({ quizId: inactive, difficulty: "medium" });
    expect(closed.status).toBe(403);
    expect(await errorCode(closed)).toBe("quiz_inactive");

    const quizId = await seedQuiz();
    const empty = await start({ quizId, difficulty: "easy" });
    expect(empty.status).toBe(422);
    expect(await errorCode(empty)).toBe("no_questions");

    expect((await start({ quizId, difficulty: "../x" })).status).toBe(400);
    expect((await start({ quizId, difficulty: "extreme" })).status).toBe(400);
    expect((await start({ quizId: "a/b", difficulty: "medium" })).status).toBe(400);
    expect((await start({})).status).toBe(400);
    const notJson = await startRoute(
      new Request("http://localhost/api/attempts/start", { method: "POST", body: "nope" })
    );
    expect(notJson.status).toBe(400);
  });

  it("closes the person's earlier unfinished attempt at the same quiz", async () => {
    const quizId = await seedQuiz();
    const first = await startOk(quizId, "medium", "carol");
    const second = await startOk(quizId, "medium", "carol");
    expect(second.attemptId).not.toBe(first.attemptId);

    expect((await get(first.attemptId, "carol")).status).toBe(409);
    expect((await get(second.attemptId, "carol")).status).toBe(200);
    const other = await startOk(quizId, "medium", "dave");
    expect((await get(other.attemptId, "dave")).status).toBe(200);
  });
});

describe.skipIf(!emulator)("resuming and autosave", () => {
  it("returns the saved answers, flags and position, still without the key", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    const saved = await patch(
      attemptId,
      { answers: { q1: 1, q2: null, q3: 0 }, flagged: { q3: true }, index: 2, tabSwitches: 3 },
      "erin"
    );
    expect(saved.status).toBe(200);

    const response = await get(attemptId, "erin");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;
    expect(raw).not.toMatch(/correctIndex|isCorrect/);
    expect(state.answers).toEqual({ q1: 1, q2: null, q3: 0 });
    expect(state.flagged).toEqual({ q3: true });
    expect(state.index).toBe(2);
    expect(state.tabSwitches).toBe(3);
  });

  it("only keeps whole option numbers for the attempt's own questions", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(
      attemptId,
      { answers: { q1: 7, q2: -1, q3: 1.5, other: 0 }, flagged: { other: true, q1: true }, index: 99 },
      "erin"
    );
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state.answers).toEqual({ q1: null, q2: null, q3: null });
    expect(state.flagged).toEqual({ q1: true });
    expect(state.index).toBe(2);
  });

  it("only lets the counters go up", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(attemptId, { tabSwitches: 5, fullscreenExits: 2 }, "erin");
    await patch(attemptId, { tabSwitches: 1, fullscreenExits: 0 }, "erin");
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state.tabSwitches).toBe(5);
    expect(state.fullscreenExits).toBe(2);
  });

  it("is private to the person who started it", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    expect((await get(attemptId, "mallory")).status).toBe(404);
    expect((await patch(attemptId, { answers: { q1: 0 } }, "mallory")).status).toBe(404);
    expect((await get("doesnotexist", "erin")).status).toBe(404);
    expect((await get("a/b", "erin")).status).toBe(400);
  });

  it("stops saving once the deadline and the grace period have passed", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "erin");
    await expect(
      saveProgress(state.attemptId, "erin", { answers: { q1: 1 } }, { now: state.deadline + SUBMIT_GRACE_MS - 1 })
    ).resolves.toBeUndefined();
    await expect(
      saveProgress(state.attemptId, "erin", { answers: { q1: 2 } }, { now: state.deadline + SUBMIT_GRACE_MS + 1 })
    ).rejects.toMatchObject({ status: 409, code: "time_expired" });
    // The late write didn't land.
    expect((await getAttempt(state.attemptId, "erin")).answers.q1).toBe(1);
  });
});

describe.skipIf(!emulator)("submitting", () => {
  it("scores on the server, writes the response and answers, and reveals the review", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "frank");
    const response = await submit(
      attemptId,
      { answers: { q1: 1, q2: 1, q3: null }, tabSwitches: 2, fullscreenExits: 1 },
      "frank"
    );
    const result = (await response.json()) as SubmitResult;

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      responseId: attemptId,
      graded: true,
      correct: 1,
      total: 3,
      answered: 2,
      rawPercent: 33,
      score: 33, // medium has no multiplier
      multiplier: 1,
      late: false,
      answers: { q1: 1, q2: 1, q3: null },
    });
    expect(result.review).toEqual({
      q1: { correctIndex: 1, explanation: "B is right." },
      q2: { correctIndex: 0 },
      q3: { correctIndex: 2 },
    });

    const doc = (await db.collection("responses").doc(attemptId).get()).data()!;
    expect(doc).toMatchObject({
      quizId,
      userId: "frank",
      attemptId,
      score: 33,
      rawPercent: 33,
      correctCount: 1,
      totalQuestions: 3,
      answeredCount: 2,
      pointsMultiplier: 1,
      tabSwitchCount: 2,
      fullscreenExits: 1,
      selectedDifficulty: "medium",
      late: false,
      cameraFlags: [],
    });
    expect(doc.startedAt.toMillis()).toBeLessThanOrEqual(doc.submittedAt.toMillis());

    const answers = await db.collection(`responses/${attemptId}/answers`).get();
    const byId = Object.fromEntries(answers.docs.map((d) => [d.id, d.data()]));
    expect(Object.keys(byId).sort()).toEqual(["q1", "q2"]);
    expect(byId.q1).toEqual({ questionId: "q1", selectedIndex: 1, isCorrect: true });
    expect(byId.q2).toEqual({ questionId: "q2", selectedIndex: 1, isCorrect: false });
  });

  it("applies the level's multiplier, capped at 100", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    const { attemptId } = await startOk(quizId, "hard", "gina");
    const result = (await (
      await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 0 } }, "gina")
    ).json()) as SubmitResult;
    expect(result).toMatchObject({ rawPercent: 67, multiplier: 1.5, score: 100 });

    const half = await startOk(quizId, "hard", "gina2");
    const halfResult = (await (
      await submit(half.attemptId, { answers: { q1: 1 } }, "gina2")
    ).json()) as SubmitResult;
    expect(halfResult).toMatchObject({ rawPercent: 33, score: 50 });
  });

  it("ignores anything in the body that isn't an answer, count or flag (no score from the browser)", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "hank");
    const result = (await (
      await submit(
        attemptId,
        { answers: { q1: 0, bogus: 1 }, score: 100, correct: 3, userId: "someone-else", multiplier: 9 },
        "hank"
      )
    ).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 0, correct: 0, multiplier: 1 });
    expect((await db.collection("responses").doc(attemptId).get()).data()!.userId).toBe("hank");
  });

  it("is exactly once: a second submit returns the stored result and writes nothing more", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "ivy");
    const first = (await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "ivy")).json()) as SubmitResult;
    // A retry (or a tampered resend) with different answers can't change it.
    const again = (await (await submit(attemptId, { answers: { q1: 0, q2: 1, q3: 0 } }, "ivy")).json()) as SubmitResult;
    expect(again).toEqual(first);
    expect(first.score).toBe(100);

    const responses = await db.collection("responses").where("attemptId", "==", attemptId).get();
    expect(responses.size).toBe(1);
    expect(responses.docs[0].data().score).toBe(100);
  });

  it("is exactly once even when two submits race", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "jack");
    const [a, b] = await Promise.all([
      submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "jack"),
      submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "jack"),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    expect((await db.collection("responses").where("attemptId", "==", attemptId).get()).size).toBe(1);
  });

  it("does not read a submit that arrives after the deadline plus grace: the last autosave counts", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "kim");
    await saveProgress(state.attemptId, "kim", { answers: { q1: 1 }, tabSwitches: 1 }, { now: state.deadline - 1_000 });

    const result = await submitAttempt(
      state.attemptId,
      "kim",
      { answers: { q1: 1, q2: 0, q3: 2 }, tabSwitches: 0 }, // a full set, sent too late
      { now: state.deadline + SUBMIT_GRACE_MS + 1 }
    );
    expect(result.late).toBe(true);
    expect(result.answers).toEqual({ q1: 1, q2: null, q3: null });
    expect(result).toMatchObject({ correct: 1, answered: 1, score: 33 });
    expect(result.timeTakenSec).toBe(600); // never more than the time allowed
    expect((await db.collection("responses").doc(state.attemptId).get()).data()).toMatchObject({
      late: true,
      tabSwitchCount: 1,
    });
  });

  it("accepts a submit that arrives a little late, inside the grace period", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "lee");
    const result = await submitAttempt(
      state.attemptId,
      "lee",
      { answers: { q1: 1, q2: 0, q3: 2 } },
      { now: state.deadline + SUBMIT_GRACE_MS - 1 }
    );
    expect(result).toMatchObject({ late: false, score: 100 });
  });

  it("scores what the attempt started with, even if the quiz is edited meanwhile", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    const { attemptId } = await startOk(quizId, "hard", "max");
    await db.doc(`quizzes/${quizId}/questions_hard/q1`).set({
      ...QUESTIONS.q1,
      options: [option("a", true), option("b", false), option("c", false)],
    });
    await db.doc(`quizzes/${quizId}`).update({
      difficultySettings: { hard: { duration: 5, pointsMultiplier: 1 } },
    });
    const result = (await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "max")).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 100, multiplier: 1.5, correct: 3 });
  });

  it("gives no score and no review for a quiz that is checked by hand", async () => {
    const quizId = await seedQuiz({ isAutoCheck: false });
    const { attemptId } = await startOk(quizId, "medium", "nina");
    const result = (await (await submit(attemptId, { answers: { q1: 1 } }, "nina")).json()) as SubmitResult;
    expect(result).toMatchObject({ graded: false, score: null, correct: null, rawPercent: null, review: null, answered: 1 });

    expect((await db.collection("responses").doc(attemptId).get()).data()!.score).toBeNull();
    const answer = (await db.doc(`responses/${attemptId}/answers/q1`).get()).data()!;
    expect(answer.isCorrect).toBeNull();
  });

  it("withholds the review when the quiz owner turned it off, but still scores", async () => {
    const quizId = await seedQuiz({ showAnswerReview: false });
    const { attemptId } = await startOk(quizId, "medium", "omar");
    const raw = await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "omar")).text();
    const result = JSON.parse(raw) as SubmitResult;
    expect(result).toMatchObject({ score: 100, review: null });
    expect(raw).not.toContain("B is right");
  });

  it("is private, and closed attempts can't be submitted", async () => {
    const quizId = await seedQuiz();
    const first = await startOk(quizId, "medium", "pat");
    expect((await submit(first.attemptId, { answers: {} }, "mallory")).status).toBe(404);
    expect((await submit(first.attemptId, { answers: {} })).status).toBe(404); // a guest isn't pat

    await startOk(quizId, "medium", "pat"); // closes the first one
    const closed = await submit(first.attemptId, { answers: { q1: 1 } }, "pat");
    expect(closed.status).toBe(409);
    expect(await errorCode(closed)).toBe("attempt_closed");
    expect((await db.collection("responses").doc(first.attemptId).get()).exists).toBe(false);
  });

  it("a guest's attempt is stored under the guest id", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId);
    await submit(attemptId, { answers: { q1: 1 } });
    expect((await db.collection("responses").doc(attemptId).get()).data()!.userId).toBe("anonymous");
  });

  it("rejects answers that aren't an object", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "quinn");
    const bad = await submit(attemptId, { answers: [1, 2, 3] }, "quinn");
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe("invalid_answers");
    // The attempt is still open after a rejected submit.
    expect((await get(attemptId, "quinn")).status).toBe(200);
  });

  it("falls back to the attempt's saved answers when the submit sends none", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "ray");
    await patch(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "ray");
    const result = (await (await submit(attemptId, {}, "ray")).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 100, answered: 3 });
  });
});
