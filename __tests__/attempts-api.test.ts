// Integration tests for the server routes players use: public quizzes, access codes, attempts (start,
// resume, autosave, submit), the leaderboard and "my attempts". They run the real route handlers against
// the Firestore emulator:
//   npx firebase emulators:exec --only firestore --project demo-ageno-attempts "npx vitest run __tests__/attempts-api.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import { describe, expect, it, vi } from "vitest";

// `after()` needs a real Next.js request around it; here its work just runs once the route has answered.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void Promise.resolve().then(task),
}));

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

import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { GET as getAttemptRoute, PATCH as patchRoute } from "@/app/api/attempts/[id]/route";
import { GET as resultRoute } from "@/app/api/attempts/[id]/result/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { POST as startRoute } from "@/app/api/attempts/start/route";
import { GET as leaderboardRoute } from "@/app/api/leaderboard/route";
import { GET as myAttemptsRoute } from "@/app/api/my-attempts/route";
import { GET as quizRoute } from "@/app/api/quizzes/[quizId]/route";
import { POST as resolveRoute } from "@/app/api/quizzes/resolve/route";
import { GET as listRoute } from "@/app/api/quizzes/route";
import {
  SUBMIT_GRACE_MS,
  getAttempt,
  saveProgress,
  startAttempt,
  submitAttempt,
} from "@/lib/server/attempts";
import type { AttemptState, SubmitResult } from "@/lib/exam/types";
import { LEADERBOARD_SHOWN, buildQuizBoard, type LeaderboardDTO } from "@/lib/leaderboard";
import { aggregate, entryId, type EntryDoc, type TotalsDoc } from "@/lib/leaderboard-stats";

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
// The first call pays for connecting to the emulator, which can take longer than the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const option = (text: string, isCorrect: boolean) => ({ id: text, text, isCorrect });
const QUESTIONS: Record<string, Record<string, unknown>> = {
  q1: {
    text: "One",
    options: [{ ...option("a", false), rationale: "A is wrong." }, option("b", true), option("c", false)],
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

// A single-answer question and a select-all one (two of four options are right), with reasons.
const MULTI_QUESTIONS: Record<string, Record<string, unknown>> = {
  m1: {
    schemaVersion: 2,
    type: "multiple",
    text: "Pick two",
    options: [
      option("a", true),
      option("b", false),
      { ...option("c", true), rationale: "C is right." },
      { ...option("d", false), rationale: "D is wrong." },
    ],
    points: 1,
    explanation: "A and C.",
  },
  s1: { schemaVersion: 2, type: "single", text: "Pick one", options: [option("a", true), option("b", false)], points: 1 },
};

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
    isPublic: true,
    requiresAccessCode: false,
    duration: 10,
    accessCode: unique("CODE").toUpperCase(),
    availableDifficulties: ["easy", "medium", "hard"],
    difficultySettings: { hard: { duration: 5, pointsMultiplier: 1.5 } },
    createdAt: Timestamp.now(),
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
const startOk = async (quizId: string, difficulty = "medium", user = "alice") => {
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
const ev = (seq: number, type: string, at = 1_000) => ({ seq, type, at });

describe.skipIf(!emulator)("public quiz routes", () => {
  it("lists switched-on, visible quizzes and never includes an access code or the owner", async () => {
    const open = await seedQuiz({ title: "Listed", accessCode: "LISTED1", createdBy: "owner-secret-id" });
    const off = await seedQuiz({ title: "Switched off", active: false });
    const hidden = await seedQuiz({ title: "Hidden", isPublic: false });

    const response = await listRoute();
    const text = await response.text();
    const ids = (JSON.parse(text).quizzes as { id: string }[]).map((q) => q.id);

    expect(response.status).toBe(200);
    expect(ids).toContain(open);
    expect(ids).not.toContain(off);
    expect(ids).not.toContain(hidden);
    // (`requiresAccessCode` is fine: it says a code is needed, not what it is.)
    for (const secret of ['"accessCode"', "LISTED1", "owner-secret-id", "createdBy", "isAutoCheck", "orrect"]) {
      expect(text).not.toContain(secret);
    }
    // Cached on the server until an admin edit; never by the CDN, which an edit couldn't clear.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("describes what a quiz needs: code required, levels, timing", async () => {
    const id = await seedQuiz({ requiresAccessCode: true, examMode: "strict" });
    const { quizzes } = await (await listRoute()).json();
    expect(quizzes.find((q: { id: string }) => q.id === id)).toMatchObject({
      id,
      title: "Sample",
      requiresAccessCode: true,
      examMode: "strict",
      duration: 10,
      availableDifficulties: ["easy", "medium", "hard"],
      difficultySettings: { hard: { duration: 5, pointsMultiplier: 1.5 } },
    });
  });

  it("returns one quiz with its question counts and no question content or code", async () => {
    const id = await seedQuiz({ accessCode: "ONE1X" }, { level: "easy" });
    await db.doc(`quizzes/${id}/questions_hard/h1`).set(QUESTIONS.q1);
    const response = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: id }) });
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.counts).toEqual({ easy: 3, medium: 0, hard: 1 });
    expect(body.active).toBe(true);
    expect(body.quiz.id).toBe(id);
    for (const secret of ["One", "ONE1X", '"accessCode"', "orrect"]) {
      expect(text).not.toContain(secret);
    }
    // Cached on the server until an admin edit; never by the CDN, which an edit couldn't clear.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to the legacy collection for levels with no questions, like the exam does", async () => {
    const id = await seedQuiz({}, { legacy: true });
    const response = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: id }) });
    expect((await response.json()).counts).toEqual({ easy: 3, medium: 3, hard: 3 });
  });

  it("says when a quiz is switched off, 404s for an unknown one and rejects odd ids", async () => {
    const off = await seedQuiz({ active: false });
    const info = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: off }) });
    expect((await info.json()).active).toBe(false);

    const missing = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "nope" }) });
    expect(missing.status).toBe(404);
    const odd = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "a/b" }) });
    expect(odd.status).toBe(400);
  });

  it("turns an access code into the quiz it belongs to, however it is typed", async () => {
    const id = await seedQuiz({ accessCode: "RESOLVE7" });
    for (const typed of ["RESOLVE7", "resolve7", " Resolve7 "]) {
      const response = await resolveRoute(request("/api/quizzes/resolve", "POST", undefined, { code: typed }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ quizId: id });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers 404 for a code nobody has and 400 for an empty one", async () => {
    const none = await resolveRoute(request("/x", "POST", undefined, { code: "NOSUCHCODE" }));
    expect(none.status).toBe(404);
    for (const code of ["", "   ", undefined, 42, "x".repeat(100)]) {
      const bad = await resolveRoute(request("/x", "POST", undefined, { code }));
      expect(bad.status).toBe(400);
    }
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
    expect(raw).not.toMatch(/correct|isCorrect|explanation|rationale|B is right|A is wrong/i);
    expect(state.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(state.questions[0]).toEqual({ id: "q1", text: "One", options: ["a", "b", "c"], type: "single" });
    expect(state.questions[2].options).toEqual(["x", "y", "z"]);
    expect(state.questions[2].imageUrl).toBe("https://example.com/three.png");
    expect(state.durationSec).toBe(600); // the quiz's own 10 minutes for "medium"
    expect(state.deadline - state.startedAt).toBe(600_000);
    expect(state.startedAt).toBeGreaterThanOrEqual(before - 1);
    expect(Math.abs(state.serverNow - Date.now())).toBeLessThan(5_000);
    expect(state.answers).toEqual({ q1: [], q2: [], q3: [] });
    expect(state).toMatchObject({ tabSwitches: 0, blurs: 0, fullscreenExits: 0, eventSeq: 0 });
  });

  it("uses the level's own duration", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    expect((await startOk(quizId, "hard")).durationSec).toBe(300);
  });

  it("needs a signed-in user: no token is a 401, and so is a bad one", async () => {
    const quizId = await seedQuiz();
    const none = await start({ quizId, difficulty: "medium" });
    expect(none.status).toBe(401);
    expect(await errorCode(none)).toBe("sign_in_required");

    const bad = await startRoute(
      new Request("http://localhost/api/attempts/start", {
        method: "POST",
        headers: { authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ quizId, difficulty: "medium" }),
      })
    );
    expect(bad.status).toBe(401);
    expect(await errorCode(bad)).toBe("invalid_token");
  });

  it("checks the access code on the server, however it is typed", async () => {
    const quizId = await seedQuiz({ requiresAccessCode: true, accessCode: "SECRET42" });

    const missing = await start({ quizId, difficulty: "medium" }, "alice");
    expect(missing.status).toBe(403);
    expect(await errorCode(missing)).toBe("access_code_required");

    const wrong = await start({ quizId, difficulty: "medium", accessCode: "NOPE" }, "alice");
    expect(wrong.status).toBe(403);
    expect(await errorCode(wrong)).toBe("access_code_invalid");
    const wrongType = await start({ quizId, difficulty: "medium", accessCode: 42 }, "alice");
    expect(wrongType.status).toBe(403);

    for (const typed of ["SECRET42", "secret42", "  Secret42 "]) {
      const ok = await start({ quizId, difficulty: "medium", accessCode: typed }, "alice");
      expect(ok.status).toBe(201);
    }
  });

  it("doesn't ask for a code when the quiz is open, or says so but has no code to match", async () => {
    const open = await seedQuiz({ requiresAccessCode: false });
    expect((await start({ quizId: open, difficulty: "medium" }, "alice")).status).toBe(201);
    const noCode = await seedQuiz({ requiresAccessCode: true, accessCode: "" });
    expect((await start({ quizId: noCode, difficulty: "medium" }, "alice")).status).toBe(201);
  });

  it("rejects a missing quiz, an inactive one, an empty level, a bad level and a bad body", async () => {
    expect((await start({ quizId: "doesnotexist", difficulty: "medium" }, "alice")).status).toBe(404);

    const inactive = await seedQuiz({ active: false });
    const closed = await start({ quizId: inactive, difficulty: "medium" }, "alice");
    expect(closed.status).toBe(403);
    expect(await errorCode(closed)).toBe("quiz_inactive");

    const quizId = await seedQuiz();
    const empty = await start({ quizId, difficulty: "easy" }, "alice");
    expect(empty.status).toBe(422);
    expect(await errorCode(empty)).toBe("no_questions");

    expect((await start({ quizId, difficulty: "../x" }, "alice")).status).toBe(400);
    expect((await start({ quizId, difficulty: "extreme" }, "alice")).status).toBe(400);
    expect((await start({ quizId: "a/b", difficulty: "medium" }, "alice")).status).toBe(400);
    expect((await start({}, "alice")).status).toBe(400);
    const notJson = await startRoute(
      new Request("http://localhost/api/attempts/start", {
        method: "POST",
        headers: { authorization: "Bearer uid:alice" },
        body: "nope",
      })
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
      {
        answers: { q1: [1], q2: [], q3: [0] },
        flagged: { q3: true },
        index: 2,
        events: [ev(1, "tab_hidden"), ev(2, "tab_hidden"), ev(3, "window_blur")],
      },
      "erin"
    );
    expect(saved.status).toBe(200);

    const response = await get(attemptId, "erin");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;
    expect(raw).not.toMatch(/correct|isCorrect|rationale/i);
    expect(state.answers).toEqual({ q1: [1], q2: [], q3: [0] });
    expect(state.flagged).toEqual({ q3: true });
    expect(state.index).toBe(2);
    expect(state).toMatchObject({ tabSwitches: 2, blurs: 1, fullscreenExits: 0, eventSeq: 3 });
  });

  it("only keeps whole option numbers for the attempt's own questions", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(
      attemptId,
      { answers: { q1: [7], q2: [-1], q3: [1.5], other: [0] }, flagged: { other: true, q1: true }, index: 99 },
      "erin"
    );
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state.answers).toEqual({ q1: [], q2: [], q3: [] });
    expect(state.flagged).toEqual({ q1: true });
    expect(state.index).toBe(2);
  });

  it("accepts the older single-number answers from a tab opened before the update", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "olga");
    await patch(attemptId, { answers: { q1: 1, q2: null, q3: 0, bogus: 2 } }, "olga");
    const state = (await (await get(attemptId, "olga")).json()) as AttemptState;
    expect(state.answers).toEqual({ q1: [1], q2: [], q3: [0] });
  });

  it("keeps a single-answer question to one pick, and sorts and de-duplicates the rest", async () => {
    const quizId = await seedQuiz({}, { questions: MULTI_QUESTIONS });
    const { attemptId } = await startOk(quizId, "medium", "pia");
    await patch(attemptId, { answers: { s1: [1, 0], m1: [3, 0, 0, 2, 9] } }, "pia");
    const state = (await (await get(attemptId, "pia")).json()) as AttemptState;
    expect(state.answers).toEqual({ s1: [0], m1: [0, 2, 3] });
  });

  it("counts from the events it is sent, never from a number the browser claims", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(attemptId, { tabSwitches: 99, fullscreenExits: 99, blurs: 99 }, "erin");
    let state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ tabSwitches: 0, blurs: 0, fullscreenExits: 0 });

    await patch(attemptId, { events: [ev(1, "fullscreen_exit"), ev(2, "fullscreen_exit")] }, "erin");
    state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ fullscreenExits: 2, eventSeq: 2 });
  });

  it("stamps each event with the server's time and ignores one it already has", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "erin");
    await saveProgress(state.attemptId, "erin", { events: [ev(1, "tab_hidden", 123)] }, { now: state.startedAt + 5_000 });
    // A resend (the first response was lost) plus a new one: the repeat doesn't count twice.
    await saveProgress(
      state.attemptId,
      "erin",
      { events: [ev(1, "tab_hidden", 123), ev(2, "window_blur", 456)] },
      { now: state.startedAt + 9_000 }
    );

    const stored = (await db.collection("attempts").doc(state.attemptId).get()).data()!;
    expect(stored.events).toEqual([
      { seq: 1, type: "tab_hidden", at: state.startedAt + 5_000, clientAt: 123 },
      { seq: 2, type: "window_blur", at: state.startedAt + 9_000, clientAt: 456 },
    ]);
    expect(stored).toMatchObject({ tabSwitches: 1, blurs: 1, eventSeq: 2 });
  });

  it("skips malformed and unknown events", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(
      attemptId,
      { events: [null, "x", ev(1, "teleport"), { seq: "2", type: "tab_hidden" }, ev(3, "tab_hidden")] },
      "erin"
    );
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ tabSwitches: 1, eventSeq: 3 });
  });

  it("is private to the person who started it", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    expect((await get(attemptId, "mallory")).status).toBe(404);
    expect((await patch(attemptId, { answers: { q1: 0 } }, "mallory")).status).toBe(404);
    expect((await get("doesnotexist", "erin")).status).toBe(404);
    expect((await get("a/b", "erin")).status).toBe(400);
    // And all of it needs a sign-in.
    expect((await get(attemptId)).status).toBe(401);
    expect((await patch(attemptId, { answers: {} })).status).toBe(401);
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
    expect((await getAttempt(state.attemptId, "erin")).answers.q1).toEqual([1]);
  });
});

describe.skipIf(!emulator)("submitting", () => {
  it("scores on the server, writes the response with its answer sheet, and reveals the review", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "frank");
    const response = await submit(
      attemptId,
      {
        answers: { q1: [1], q2: [1], q3: [] },
        events: [ev(1, "tab_hidden"), ev(2, "tab_hidden"), ev(3, "fullscreen_exit"), ev(4, "window_blur")],
      },
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
      answers: { q1: [1], q2: [1], q3: [] },
      tabSwitches: 2,
      blurs: 1,
      fullscreenExits: 1,
    });
    expect(result.review).toEqual({
      q1: { correct: [1], explanation: "B is right.", optionRationales: ["A is wrong.", null, null] },
      q2: { correct: [0] },
      q3: { correct: [2] },
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
      blurCount: 1,
      fullscreenExits: 1,
      selectedDifficulty: "medium",
      late: false,
    });
    expect(doc).not.toHaveProperty("cameraFlags");
    expect(doc.integrityEvents.map((e: { type: string }) => e.type)).toEqual([
      "tab_hidden",
      "tab_hidden",
      "fullscreen_exit",
      "window_blur",
    ]);
    expect(doc.integrityEvents[0].at).toBeGreaterThan(0);
    expect(doc.startedAt.toMillis()).toBeLessThanOrEqual(doc.submittedAt.toMillis());

    // One compact sheet on the response, not a document per answer.
    expect(doc.schemaVersion).toBe(2);
    expect(doc.sheet).toEqual({ q1: { p: [1], ok: true }, q2: { p: [1], ok: false } });
    expect((await db.collection(`responses/${attemptId}/answers`).get()).empty).toBe(true);
  });

  it("writes a handful of documents however many questions there are", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [
        `big${String(i).padStart(3, "0")}`,
        { text: `Question ${i}`, options: [option("a", i % 2 === 0), option("b", i % 2 === 1)], points: 1 },
      ])
    );
    const quizId = await seedQuiz({}, { questions: many });
    const me = unique("many");
    const state = await startOk(quizId, "medium", me);
    expect(state.questions).toHaveLength(400);
    const picks = Object.fromEntries(state.questions.map((q, i) => [q.id, [i % 2]]));
    const response = await submit(state.attemptId, { answers: picks }, me);
    expect(response.status).toBe(200);
    expect(((await response.json()) as SubmitResult).score).toBe(100);

    const doc = (await db.collection("responses").doc(state.attemptId).get()).data()!;
    expect(Object.keys(doc.sheet)).toHaveLength(400);
    expect((await db.collection(`responses/${state.attemptId}/answers`).get()).size).toBe(0);
    // The attempt document with 400 questions, their key and the sheet stays far below Firestore's 1 MiB.
    const attemptDoc = (await db.collection("attempts").doc(state.attemptId).get()).data()!;
    expect(Buffer.byteLength(JSON.stringify(attemptDoc))).toBeLessThan(300_000);
  });

  it("leaves out the integrity fields on a clean attempt", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "clean");
    await submit(attemptId, { answers: { q1: 1 } }, "clean");
    const doc = (await db.collection("responses").doc(attemptId).get()).data()!;
    expect(doc.tabSwitchCount).toBe(0);
    expect(doc).not.toHaveProperty("blurCount");
    expect(doc).not.toHaveProperty("fullscreenExits");
    expect(doc).not.toHaveProperty("integrityEvents");
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

  it("ignores anything in the body that isn't an answer or an event (no score or counts from the browser)", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "hank");
    const result = (await (
      await submit(
        attemptId,
        {
          answers: { q1: 0, bogus: 1 },
          score: 100,
          correct: 3,
          userId: "someone-else",
          multiplier: 9,
          tabSwitches: 50,
          fullscreenExits: 50,
        },
        "hank"
      )
    ).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 0, correct: 0, multiplier: 1, tabSwitches: 0, fullscreenExits: 0 });
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
    await saveProgress(
      state.attemptId,
      "kim",
      { answers: { q1: 1 }, events: [ev(1, "tab_hidden")] },
      { now: state.deadline - 1_000 }
    );

    const result = await submitAttempt(
      state.attemptId,
      "kim",
      { answers: { q1: 1, q2: 0, q3: 2 }, events: [ev(2, "tab_hidden"), ev(3, "tab_hidden")] }, // sent too late
      { now: state.deadline + SUBMIT_GRACE_MS + 1 }
    );
    expect(result.late).toBe(true);
    expect(result.answers).toEqual({ q1: [1], q2: [], q3: [] });
    expect(result).toMatchObject({ correct: 1, answered: 1, score: 33, tabSwitches: 1 });
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
    // Nothing is scored, so the sheet records the pick but not whether it was right.
    expect((await db.collection("responses").doc(attemptId).get()).data()!.sheet).toEqual({ q1: { p: [1] } });
  });

  it("withholds the review when the quiz owner turned it off, but still scores", async () => {
    const quizId = await seedQuiz({ showAnswerReview: false });
    const { attemptId } = await startOk(quizId, "medium", "omar");
    const raw = await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "omar")).text();
    const result = JSON.parse(raw) as SubmitResult;
    expect(result).toMatchObject({ score: 100, review: null });
    expect(raw).not.toContain("B is right");
  });

  it("is private, needs a sign-in, and closed attempts can't be submitted", async () => {
    const quizId = await seedQuiz();
    const first = await startOk(quizId, "medium", "pat");
    expect((await submit(first.attemptId, { answers: {} }, "mallory")).status).toBe(404);
    const anonymous = await submit(first.attemptId, { answers: {} });
    expect(anonymous.status).toBe(401);

    await startOk(quizId, "medium", "pat"); // closes the first one
    const closed = await submit(first.attemptId, { answers: { q1: 1 } }, "pat");
    expect(closed.status).toBe(409);
    expect(await errorCode(closed)).toBe("attempt_closed");
    expect((await db.collection("responses").doc(first.attemptId).get()).exists).toBe(false);
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

describe.skipIf(!emulator)("the precomputed leaderboard, kept by submits", () => {
  const entryOf = async (quizId: string, userId: string) =>
    (await db.collection("leaderboard").doc(entryId(quizId, userId)).get()).data() as EntryDoc | undefined;
  const totalsOf = async (userId: string) =>
    (await db.collection("userTotals").doc(userId).get()).data() as TotalsDoc | undefined;
  /** Starts and submits one attempt. q1 is 1, q2 is 0, q3 is 2 (all three right is 100). */
  const take = async (quizId: string, user: string, answers: Record<string, number>, difficulty = "medium") => {
    const { attemptId } = await startOk(quizId, difficulty, user);
    const response = await submit(attemptId, { answers }, user);
    expect(response.status).toBe(200);
    return { attemptId, result: (await response.json()) as SubmitResult };
  };

  it("puts a scored submit on the person's entry and totals, with their name, in the same write", async () => {
    const quizId = await seedQuiz();
    const me = unique("lb");
    await db.collection("users").doc(me).set({ displayName: "  Nadia ", email: "nadia@example.com" });
    const { result } = await take(quizId, me, { q1: 1, q2: 0 });

    expect(await entryOf(quizId, me)).toMatchObject({
      quizId,
      userId: me,
      displayName: "Nadia",
      score: result.score,
      difficulty: "medium",
      attempts: 1,
      levels: { medium: { score: result.score, attempts: 1 } },
    });
    expect(await totalsOf(me)).toMatchObject({
      userId: me,
      displayName: "Nadia",
      points: result.score,
      quizCount: 1,
      attempts: 1,
      levels: { medium: { points: result.score, quizCount: 1 } },
    });
  });

  it("keeps the best attempt and counts every one; a repeated submit counts nothing", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    const me = unique("lb");
    const best = await take(quizId, me, { q1: 1, q2: 0, q3: 2 }, "hard"); // 100
    const worse = await take(quizId, me, { q1: 1 }, "hard"); // 33 x 1.5 = 50
    expect(worse.result.score).toBe(50);
    // A retry of an attempt that already went through.
    expect((await submit(worse.attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, me)).status).toBe(200);

    const entry = await entryOf(quizId, me);
    expect(entry).toMatchObject({ score: 100, attempts: 2, difficulty: "hard" });
    expect(entry!.bestAt).toBe(
      (await db.collection("responses").doc(best.attemptId).get()).data()!.submittedAt.toMillis()
    );
    expect(await totalsOf(me)).toMatchObject({ points: 100, quizCount: 1, attempts: 2 });

    const other = await seedQuiz();
    await take(other, me, { q1: 1, q2: 0 }); // 67
    expect(await totalsOf(me)).toMatchObject({ points: 167, quizCount: 2, attempts: 3 });
  });

  it("counts two racing submits of one attempt once", async () => {
    const quizId = await seedQuiz();
    const me = unique("lb");
    const { attemptId } = await startOk(quizId, "medium", me);
    await Promise.all([
      submit(attemptId, { answers: { q1: 1 } }, me),
      submit(attemptId, { answers: { q1: 1 } }, me),
    ]);
    expect(await entryOf(quizId, me)).toMatchObject({ attempts: 1 });
    expect(await totalsOf(me)).toMatchObject({ attempts: 1 });
  });

  it("leaves a quiz checked by hand off the board", async () => {
    const quizId = await seedQuiz({ isAutoCheck: false });
    const me = unique("lb");
    await take(quizId, me, { q1: 1 });
    expect(await entryOf(quizId, me)).toBeUndefined();
    expect(await totalsOf(me)).toBeUndefined();
  });

  it("counts the quiz's results after the submit, once per result", async () => {
    const quizId = await seedQuiz({ responseCount: 0, responseCountTracked: true });
    const me = unique("lb");
    const { attemptId } = await take(quizId, me, { q1: 1 });
    await vi.waitFor(async () =>
      expect((await db.doc(`quizzes/${quizId}`).get()).data()!.responseCount).toBe(1)
    );
    await submit(attemptId, { answers: {} }, me); // a repeat
    await take(quizId, me, { q1: 0 });
    await vi.waitFor(async () =>
      expect((await db.doc(`quizzes/${quizId}`).get()).data()!.responseCount).toBe(2)
    );
  });
});

describe.skipIf(!emulator)("leaderboard", () => {
  const response = async (quizId: string, userId: string, score: number, extra: Record<string, unknown> = {}) => {
    await db.collection("responses").doc(unique("r")).set({
      quizId,
      userId,
      score,
      selectedDifficulty: "medium",
      startedAt: Timestamp.fromMillis(Date.now() - 120_000),
      submittedAt: Timestamp.now(),
      ...extra,
    });
  };
  const leaderboard = async (query: string, user = "alice") => {
    const res = await leaderboardRoute(request(`/api/leaderboard${query}`, "GET", user));
    expect(res.status).toBe(200);
    return (await res.json()) as LeaderboardDTO;
  };
  /** Board rows written the way submits write them, without running each attempt. */
  const seedBoard = async (quizId: string, people: Array<[string, number, string?]>) => {
    const now = Date.now();
    const { entries } = aggregate(
      people.map(([userId, score, difficulty = "medium"], i) => ({
        quizId,
        userId,
        score,
        difficulty,
        startedAt: now - 120_000,
        submittedAt: now - i,
      }))
    );
    await Promise.all(entries.map((e) => db.collection("leaderboard").doc(entryId(quizId, e.userId)).set(e)));
  };
  const scores = (body: LeaderboardDTO) =>
    body.entries.map((e) => [e.userId, "score" in e ? e.score : null]);

  it("ranks one quiz from the stored rows: each person's best, names from the profile, never an email", async () => {
    const quizId = await seedQuiz({ title: "Board quiz" });
    const named = unique("named");
    const unnamed = unique("unnamed");
    await db.collection("users").doc(named).set({ displayName: "Nadia", email: "nadia@example.com", role: "user" });
    await db.collection("users").doc(unnamed).set({ email: "private@example.com", role: "user" });
    const first = await startOk(quizId, "medium", named);
    await submit(first.attemptId, { answers: { q1: 1, q2: 0 } }, named); // 67
    const again = await startOk(quizId, "medium", named);
    await submit(again.attemptId, { answers: {} }, named); // 0: not their best
    const top = await startOk(quizId, "medium", unnamed);
    await submit(top.attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, unnamed); // 100

    const res = await leaderboardRoute(request(`/api/leaderboard?quizId=${quizId}`, "GET", named));
    const text = await res.text();
    const body = JSON.parse(text) as LeaderboardDTO;

    expect(body.mode).toBe("quiz");
    expect(body.entries.map((e) => [e.rank, e.username, "score" in e && e.score])).toEqual([
      [1, `User ${unnamed.slice(0, 6)}`, 100],
      [2, "Nadia", 67],
    ]);
    expect(body.total).toBe(2);
    expect(body.me).toMatchObject({ userId: named, rank: 2 });
    expect(body.quizzes[quizId]).toBe("Board quiz");
    // Display names only: no email ever leaves the server.
    expect(text).not.toMatch(/example\.com|@/);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("filters one quiz to a level, from the per-level rows", async () => {
    const quizId = await seedQuiz();
    await seedBoard(quizId, [
      ["lv-a", 90, "easy"],
      ["lv-b", 60, "hard"],
      ["lv-a", 40, "hard"],
    ]);
    expect(scores(await leaderboard(`?quizId=${quizId}&difficulty=hard`))).toEqual([
      ["lv-b", 60],
      ["lv-a", 40],
    ]);
    expect(scores(await leaderboard(`?quizId=${quizId}`))).toEqual([
      ["lv-a", 90],
      ["lv-b", 60],
    ]);
  });

  it("gives the viewer their place and the full count when they're below the rows shown", async () => {
    const quizId = await seedQuiz();
    await seedBoard(
      quizId,
      Array.from({ length: LEADERBOARD_SHOWN + 5 }, (_, i): [string, number] => [`many${i}`, 100 - i])
    );

    const body = await leaderboard(`?quizId=${quizId}`, "many53");
    expect(body.entries).toHaveLength(LEADERBOARD_SHOWN);
    expect(body.total).toBe(LEADERBOARD_SHOWN + 5);
    expect(body.me).toMatchObject({ userId: "many53", rank: 54, score: 47 });
    expect((await leaderboard(`?quizId=${quizId}`, "many2")).me).toMatchObject({ rank: 3 });
    expect((await leaderboard(`?quizId=${quizId}`, "not-on-it")).me).toBeNull();
  });

  it("ranks everyone overall from their totals, in the totals' own order", async () => {
    const quizId = await seedQuiz();
    const me = unique("overall");
    const { attemptId } = await startOk(quizId, "medium", me);
    await submit(attemptId, { answers: { q1: 1 } }, me);

    for (const difficulty of ["", "medium"]) {
      const body = await leaderboard(difficulty ? `?difficulty=${difficulty}` : "", me);
      const field = difficulty ? `levels.${difficulty}.rankKey` : "rankKey";
      const expected = (await db.collection("userTotals").orderBy(field, "desc").get()).docs.map((d) => d.id);
      expect(body.mode).toBe("overall");
      expect(body.total).toBe(expected.length);
      expect(body.entries.map((e) => e.userId)).toEqual(expected.slice(0, LEADERBOARD_SHOWN));
      expect(body.me).toMatchObject({ userId: me, rank: expected.indexOf(me) + 1, quizCount: 1 });
    }
  });

  it("works week and month boards out from that period's results, best per person", async () => {
    const quizId = await seedQuiz();
    const days = (n: number) => Timestamp.fromMillis(Date.now() - n * 24 * 3600_000);
    await response(quizId, "u-easy", 70, { selectedDifficulty: "easy" });
    await response(quizId, "u-easy", 75, { selectedDifficulty: "easy" });
    await response(quizId, "u-hard", 60, { selectedDifficulty: "hard" });
    await response(quizId, "u-old", 99, { submittedAt: days(60) });
    await response(quizId, "u-month", 80, { submittedAt: days(10) });

    const week = await leaderboard(`?quizId=${quizId}&timeFrame=week`, "u-hard");
    expect(scores(week)).toEqual([
      ["u-easy", 75],
      ["u-hard", 60],
    ]);
    expect(week.me).toMatchObject({ userId: "u-hard", rank: 2 });
    expect(week.total).toBe(2);

    expect(scores(await leaderboard(`?quizId=${quizId}&timeFrame=month&difficulty=easy`))).toEqual([["u-easy", 75]]);
    expect(scores(await leaderboard(`?quizId=${quizId}&timeFrame=month`)).map(([id]) => id)).toEqual([
      "u-month",
      "u-easy",
      "u-hard",
    ]);

    // The board is the shared builder over the same rows.
    const rows = (await db.collection("responses").where("quizId", "==", quizId).get()).docs
      .map((d) => d.data())
      .filter((d) => d.submittedAt.toMillis() >= days(7).toMillis())
      .map((d) => ({
        userId: d.userId,
        quizId,
        score: d.score,
        selectedDifficulty: d.selectedDifficulty,
        startedAt: d.startedAt.toMillis(),
        submittedAt: d.submittedAt.toMillis(),
      }));
    expect(scores(week)).toEqual(buildQuizBoard(rows, {}).map((e) => [e.userId, e.score]));
  });

  it("lists the quizzes people can pick, for the filter", async () => {
    const quizId = await seedQuiz({ title: "Pickable" });
    expect((await leaderboard("")).quizzes[quizId]).toBe("Pickable");
  });

  it("needs a sign-in and rejects filters it doesn't understand", async () => {
    expect((await leaderboardRoute(request("/api/leaderboard", "GET"))).status).toBe(401);
    for (const query of ["?timeFrame=century", "?quizId=a/b", "?difficulty=../x", "?difficulty=extreme"]) {
      expect((await leaderboardRoute(request(`/api/leaderboard${query}`, "GET", "alice"))).status).toBe(400);
    }
  });
});

describe.skipIf(!emulator)("my attempts", () => {
  const myAttempts = (user?: string) =>
    myAttemptsRoute(request("/api/my-attempts", "GET", user));

  it("returns only the caller's own attempts, newest first, with quiz titles", async () => {
    const quizA = await seedQuiz({ title: "Quiz A", description: "About A" });
    const quizB = await seedQuiz({ title: "Quiz B" });
    const me = unique("me");
    const add = (quizId: string, userId: string, score: number | null, ago: number) =>
      db.collection("responses").doc(unique("h")).set({
        quizId,
        userId,
        score,
        tabSwitchCount: 2,
        fullscreenExits: 1,
        selectedDifficulty: "hard",
        startedAt: Timestamp.fromMillis(Date.now() - ago - 60_000),
        submittedAt: Timestamp.fromMillis(Date.now() - ago),
      });
    await add(quizA, me, 40, 3_000_000);
    await add(quizB, me, null, 1_000_000);
    await add("missing-quiz", me, 10, 2_000_000);
    await add(quizA, "somebody-else", 100, 500_000);

    const res = await myAttempts(me);
    const { attempts } = await res.json();

    expect(res.status).toBe(200);
    expect(attempts.map((a: { quizTitle: string }) => a.quizTitle)).toEqual([
      "Quiz B",
      "Unknown quiz",
      "Quiz A",
    ]);
    expect(attempts[2]).toMatchObject({
      quizId: quizA,
      quizDescription: "About A",
      score: 40,
      tabSwitchCount: 2,
      fullscreenExits: 1,
      selectedDifficulty: "hard",
    });
    expect(attempts[0].score).toBeNull();
    expect(attempts[0].submittedAt).toBeGreaterThan(attempts[0].startedAt);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("returns an empty list for someone with no attempts, and needs a sign-in", async () => {
    expect((await (await myAttempts(unique("nobody"))).json()).attempts).toEqual([]);
    expect((await myAttempts()).status).toBe(401);
  });

  it("says which results can be opened again: those saved by a submit, not older ones", async () => {
    const quizId = await seedQuiz();
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    expect((await submit(attempt.attemptId, { answers: {} }, me)).status).toBe(200);
    // Written before attempts existed: no `attemptId`.
    await db.collection("responses").doc(unique("old")).set({
      quizId,
      userId: me,
      score: 0,
      startedAt: Timestamp.fromMillis(Date.now() - 600_000),
      submittedAt: Timestamp.fromMillis(Date.now() - 500_000),
    });

    const { attempts } = await (await myAttempts(me)).json();
    expect(attempts).toHaveLength(2);
    expect(attempts.find((a: { id: string }) => a.id === attempt.attemptId).hasResult).toBe(true);
    expect(attempts.filter((a: { hasResult: boolean }) => !a.hasResult)).toHaveLength(1);
  });
});

describe.skipIf(!emulator)("a finished attempt's result", () => {
  const result = (id: string, user?: string) =>
    resultRoute(request(`/api/attempts/${id}/result`, "GET", user), ctx(id));

  it("returns the stored result, the questions as they were and the title, to its owner", async () => {
    const quizId = await seedQuiz({ title: "Reviewable" });
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    const q = attempt.questions[0].id;
    const submitted = (await (await submit(attempt.attemptId, { answers: { [q]: 0 } }, me)).json()) as SubmitResult;

    // Editing the quiz afterwards must not change what the person sees.
    await db.doc(`quizzes/${quizId}`).update({ title: "Renamed" });
    await db.doc(`quizzes/${quizId}/questions_medium/${q}`).update({ text: "Edited later" });

    const response = await result(attempt.attemptId, me);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attemptId: attempt.attemptId,
      quizId,
      quizTitle: "Renamed",
      difficulty: "medium",
      result: submitted,
    });
    expect(body.questions.map((x: { text: string }) => x.text)).toEqual(attempt.questions.map((x) => x.text));
    expect(typeof body.submittedAt).toBe("number");
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("keeps the review off when it was off at submit time, and never adds an answer key", async () => {
    const quizId = await seedQuiz({ showAnswerReview: false });
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    await submit(attempt.attemptId, { answers: {} }, me);

    const text = await (await result(attempt.attemptId, me)).text();
    expect(JSON.parse(text).result.review).toBeNull();
    for (const secret of ["isCorrect", '"correct":[', "optionRationales", "B is right.", "A is wrong."]) {
      expect(text).not.toContain(secret);
    }
  });

  it("rebuilds the review from the attempt's own snapshot instead of storing it", async () => {
    const quizId = await seedQuiz({ title: "Derived" });
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    const submitted = (await (await submit(attempt.attemptId, { answers: { q1: [1] } }, me)).json()) as SubmitResult;
    expect(submitted.review?.q1).toEqual({
      correct: [1],
      explanation: "B is right.",
      optionRationales: ["A is wrong.", null, null],
    });

    // Not stored on the attempt (reasons and explanations live once, in the question snapshot)...
    const stored = (await db.collection("attempts").doc(attempt.attemptId).get()).data()!;
    expect(stored.result.review).toBeNull();

    // ...and the quiz being edited afterwards changes nothing in what the person sees.
    await db.doc(`quizzes/${quizId}/questions_medium/q1`).update({ explanation: "Changed later." });
    const again = await (await result(attempt.attemptId, me)).json();
    expect(again.result.review.q1.explanation).toBe("B is right.");
  });

  it("still reads a result stored before the key became a list", async () => {
    const quizId = await seedQuiz();
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    await submit(attempt.attemptId, { answers: { q1: [1], q2: [0] } }, me);

    // What an attempt submitted under the older model looked like on disk.
    await db.collection("attempts").doc(attempt.attemptId).update({
      questions: [
        { id: "q1", text: "One", options: ["a", "b", "c"], correctIndex: 1, explanation: "B is right." },
        { id: "q2", text: "Two", options: ["a", "b"], correctIndex: 0 },
        { id: "q3", text: "Three", options: ["x", "y", "z"], correctIndex: 2 },
      ],
      answers: { q1: 1, q2: 0, q3: null },
      "result.answers": { q1: 1, q2: 0, q3: null },
      "result.review": {
        q1: { correctIndex: 1, explanation: "B is right." },
        q2: { correctIndex: 0 },
        q3: { correctIndex: 2 },
      },
    });
    const body = await (await result(attempt.attemptId, me)).json();
    expect(body.result.answers).toEqual({ q1: [1], q2: [0], q3: [] });
    expect(body.result.review).toEqual({
      q1: { correct: [1], explanation: "B is right." },
      q2: { correct: [0] },
      q3: { correct: [2] },
    });
    expect(body.questions[0]).toEqual({ id: "q1", text: "One", options: ["a", "b", "c"], type: "single" });
  });

  it("refuses an attempt that is still running, someone else's, an unknown id, and no sign-in", async () => {
    const quizId = await seedQuiz();
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);

    const running = await result(attempt.attemptId, me);
    expect(running.status).toBe(409);
    expect(await errorCode(running)).toBe("attempt_not_finished");

    await submit(attempt.attemptId, { answers: {} }, me);
    expect((await result(attempt.attemptId, unique("other"))).status).toBe(404);
    expect((await result("does-not-exist", me)).status).toBe(404);
    expect((await result("a%2Fb", me)).status).toBe(400);
    expect((await result(attempt.attemptId)).status).toBe(401);
  });
});

describe.skipIf(!emulator)("select-all questions", () => {
  const seedMulti = () => seedQuiz({}, { questions: MULTI_QUESTIONS });
  const result = (id: string, user?: string) =>
    resultRoute(request(`/api/attempts/${id}/result`, "GET", user), ctx(id));

  it("tells the player the type and how many to choose, and nothing about which", async () => {
    const quizId = await seedMulti();
    const response = await start({ quizId, difficulty: "medium" }, "mona");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;

    expect(state.questions).toEqual([
      { id: "m1", text: "Pick two", options: ["a", "b", "c", "d"], type: "multiple", pickCount: 2 },
      { id: "s1", text: "Pick one", options: ["a", "b"], type: "single" },
    ]);
    expect(raw).not.toMatch(/isCorrect|rationale|C is right|D is wrong|A and C|"correct"/);

    // Resuming and the public routes say no more.
    const resumed = await (await get(state.attemptId, "mona")).text();
    expect(resumed).not.toMatch(/isCorrect|rationale|C is right|D is wrong|A and C|"correct"/);
    const publicQuiz = await (await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId }) })).text();
    expect(publicQuiz).not.toMatch(/isCorrect|rationale|C is right|A and C|Pick two/);
  });

  it("scores all or nothing: the picked set must equal the right set", async () => {
    const quizId = await seedMulti();
    const take = async (picks: number[], user: string) => {
      const { attemptId } = await startOk(quizId, "medium", user);
      return (await (await submit(attemptId, { answers: { m1: picks, s1: [0] } }, user)).json()) as SubmitResult;
    };
    expect(await take([0, 2], unique("u"))).toMatchObject({ correct: 2, score: 100 });
    expect(await take([2, 0], unique("u"))).toMatchObject({ correct: 2, score: 100 });
    expect(await take([0], unique("u"))).toMatchObject({ correct: 1, score: 50 }); // a missing pick
    expect(await take([0, 2, 3], unique("u"))).toMatchObject({ correct: 1, score: 50 }); // an extra pick
    expect(await take([1, 3], unique("u"))).toMatchObject({ correct: 1, score: 50 }); // the wrong two
    expect(await take([], unique("u"))).toMatchObject({ correct: 1, answered: 1, score: 50 });
  });

  it("reveals the right set and every reason in the review, and records the picks on the sheet", async () => {
    const quizId = await seedMulti();
    const me = unique("me");
    const { attemptId } = await startOk(quizId, "medium", me);
    const submitted = (await (await submit(attemptId, { answers: { m1: [0, 3], s1: [1] } }, me)).json()) as SubmitResult;

    expect(submitted.answers).toEqual({ m1: [0, 3], s1: [1] });
    expect(submitted.review).toEqual({
      m1: {
        correct: [0, 2],
        explanation: "A and C.",
        optionRationales: [null, null, "C is right.", "D is wrong."],
      },
      s1: { correct: [0] },
    });
    const doc = (await db.collection("responses").doc(attemptId).get()).data()!;
    expect(doc.sheet).toEqual({ m1: { p: [0, 3], ok: false }, s1: { p: [1], ok: false } });
  });

  it("finishes an attempt that began before the update, with its old snapshot and old answers", async () => {
    const quizId = await seedQuiz();
    const me = unique("old");
    const state = await startOk(quizId, "medium", me);
    // What the attempt document looked like when the key was one number and an answer was one number.
    await db.collection("attempts").doc(state.attemptId).update({
      questions: [
        { id: "q1", text: "One", options: ["a", "b", "c"], correctIndex: 1, explanation: "B is right." },
        { id: "q2", text: "Two", options: ["a", "b"], correctIndex: 0 },
        { id: "q3", text: "Three", options: ["x", "y", "z"], correctIndex: null },
      ],
      answers: { q1: 1, q2: 0, q3: null },
    });

    const resumed = (await (await get(state.attemptId, me)).json()) as AttemptState;
    expect(resumed.answers).toEqual({ q1: [1], q2: [0], q3: [] });
    expect(resumed.questions.map((q) => q.type)).toEqual(["single", "single", "single"]);

    // A tab from before the update still sends single numbers.
    const finished = (await (await submit(state.attemptId, { answers: { q1: 1, q2: 1, q3: 0 } }, me)).json()) as SubmitResult;
    expect(finished).toMatchObject({ correct: 1, answered: 3, total: 3, score: 33 });
    expect(finished.answers).toEqual({ q1: [1], q2: [1], q3: [0] });
    expect(finished.review).toEqual({
      q1: { correct: [1], explanation: "B is right." },
      q2: { correct: [0] },
      q3: { correct: [] },
    });
    expect((await result(state.attemptId, me)).status).toBe(200);
  });
});
