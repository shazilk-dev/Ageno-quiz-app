// Integration tests for the admin side of the data layer: the quiz routes (list, open, create, save,
// delete), user deletion, the admin guard, the registration route that used to let anyone become an admin,
// and the legacy-question migration. They run the real route handlers against the Firestore emulator:
//   npx firebase emulators:exec --only firestore --project demo-ageno-admin "npx vitest run __tests__/admin-api.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import { describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  claims: {} as Record<string, unknown>,
  deleted: [] as string[],
  revoked: [] as string[],
}));

// Next's data cache needs a running Next.js server: here nothing is cached, and invalidations are recorded.
const cacheState = vi.hoisted(() => ({ revalidated: [] as string[] }));
vi.mock("next/cache", () => ({
  unstable_cache: (load: () => Promise<unknown>) => load,
  revalidateTag: (tag: string) => cacheState.revalidated.push(tag),
}));

// `after()` needs a real Next.js request around it; here its work just runs once the route has answered.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void Promise.resolve().then(task),
}));

vi.mock("@/firebase/admin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-ageno-admin" });
  return {
    db: getFirestore(app),
    auth: {
      // "uid:<id>" is a signed-in person; "admin:<id>" has the admin claim; anything else is invalid.
      verifyIdToken: async (token: string) => {
        if (token.startsWith("uid:")) return { uid: token.slice(4), email: `${token.slice(4)}@example.com` };
        if (token.startsWith("admin:")) return { uid: token.slice(6), role: "admin" };
        throw new Error("invalid token");
      },
      setCustomUserClaims: async (uid: string, claims: unknown) => {
        authState.claims[uid] = claims;
      },
      getUser: async (uid: string) => {
        if (uid.startsWith("ghost")) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" });
        return { customClaims: authState.claims[uid] ?? { keep: "me" } };
      },
      revokeRefreshTokens: async (uid: string) => {
        authState.revoked.push(uid);
      },
      deleteUser: async (uid: string) => {
        if (uid.startsWith("ghost")) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" });
        authState.deleted.push(uid);
      },
    },
  };
});

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { POST as registerRoute } from "@/app/api/auth/user/route";
import { DELETE as deleteQuizRoute, GET as getQuizRoute, PUT as putQuizRoute } from "@/app/api/admin/quizzes/[quizId]/route";
import { POST as foreverRoute } from "@/app/api/admin/quizzes/[quizId]/delete-forever/route";
import { POST as restoreRoute } from "@/app/api/admin/quizzes/[quizId]/restore/route";
import { GET as insightsRoute } from "@/app/api/admin/quizzes/[quizId]/insights/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/admin/quizzes/route";
import { GET as reportsRoute } from "@/app/api/admin/reports/route";
import { GET as attemptDetailRoute } from "@/app/api/admin/reports/[attemptId]/route";
import { GET as playerResultRoute } from "@/app/api/attempts/[id]/result/route";
import { GET as statsRoute } from "@/app/api/admin/stats/route";
import { DELETE as deleteUserRoute, PATCH as patchUserRoute } from "@/app/api/admin/users/[uid]/route";
import { GET as listUsersRoute } from "@/app/api/admin/users/route";
import { POST as startRoute } from "@/app/api/attempts/start/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { GET as publicQuizRoute } from "@/app/api/quizzes/[quizId]/route";
import { GET as publicListRoute } from "@/app/api/quizzes/route";
import { POST as resolveRoute } from "@/app/api/quizzes/resolve/route";
import { backfillLeaderboard } from "@/lib/server/leaderboard-store";
import { backfillSheets } from "@/lib/server/response-sheets";
import { migrateLegacyQuestions } from "@/lib/server/legacy-questions";
import { buildOverallBoard, buildQuizBoard, type LeaderboardRow } from "@/lib/leaderboard";
import { entryId, totalsFromEntries, type EntryDoc, type TotalsDoc } from "@/lib/leaderboard-stats";
import type { AdminAttemptDetail, DashboardData, ReportsPage } from "@/lib/admin-types";
import type { QuizInsights } from "@/lib/item-analysis";
import type { AdminQuizDetail, AdminQuizSummary, QuizInput } from "@/lib/quiz-schema";
import type { AttemptState, SubmitResult } from "@/lib/exam/types";

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
vi.setConfig({ testTimeout: 30_000 });

let counter = 0;
const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

const request = (url: string, method: string, token?: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const quizCtx = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
const ADMIN = "admin:root";

const q = (text: string, correct = 1, extra: object = {}) => ({
  type: "single" as const,
  text,
  options: ["a", "b", "c"].map((t, i) => ({ text: t, isCorrect: i === correct })),
  ...extra,
});

const input = (overrides: Partial<QuizInput> & Record<string, unknown> = {}): QuizInput => ({
  title: unique("Quiz "),
  description: "About",
  duration: 20,
  accessCode: "",
  requiresAccessCode: false,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  showAnswerReview: true,
  examMode: "practice",
  levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [q("One"), q("Two", 0)] } },
  ...overrides,
});

// `null` means "no sign-in" (an omitted argument is the admin).
const create = (body: unknown, token: string | null = ADMIN) =>
  createRoute(request("/api/admin/quizzes", "POST", token ?? undefined, body));
const createOk = async (body: Partial<QuizInput> & Record<string, unknown> = {}) => {
  const response = await create(input(body));
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: number; accessCode: string };
};
const open = async (id: string) =>
  (await (await getQuizRoute(request(`/api/admin/quizzes/${id}`, "GET", ADMIN), quizCtx(id))).json()) as AdminQuizDetail;
const save = (id: string, body: unknown, token: string | null = ADMIN) =>
  putQuizRoute(request(`/api/admin/quizzes/${id}`, "PUT", token ?? undefined, body), quizCtx(id));
const remove = (id: string, token: string | null = ADMIN) =>
  deleteQuizRoute(request(`/api/admin/quizzes/${id}`, "DELETE", token ?? undefined), quizCtx(id));
/** One attempt at a quiz made by `createOk()` (two easy questions): every answer right, or none. */
async function play(quizId: string, player: string, right = true): Promise<number> {
  const key = new Map((await open(quizId)).levels.easy!.questions.map((x) => [x.text, x.options.findIndex((o) => o.isCorrect)]));
  const started = await startRoute(request("/api/attempts/start", "POST", `uid:${player}`, { quizId, difficulty: "easy" }));
  expect(started.status).toBe(201);
  const attempt = (await started.json()) as AttemptState;
  const answers = Object.fromEntries(attempt.questions.map((x) => [x.id, right ? key.get(x.text) : 2]));
  const submitted = await submitRoute(
    request(`/api/attempts/${attempt.attemptId}/submit`, "POST", `uid:${player}`, { answers }),
    { params: Promise.resolve({ id: attempt.attemptId }) }
  );
  expect(submitted.status).toBe(200);
  return ((await submitted.json()) as SubmitResult).score as number;
}
const restore = (id: string, token: string | null = ADMIN) =>
  restoreRoute(request(`/api/admin/quizzes/${id}/restore`, "POST", token ?? undefined), quizCtx(id));
const forever = (id: string, title: unknown, token: string | null = ADMIN) =>
  foreverRoute(request(`/api/admin/quizzes/${id}/delete-forever`, "POST", token ?? undefined, { title }), quizCtx(id));
const errorCode = async (response: Response) => (await response.json()).error;

/** The editor's copy of a stored quiz, ready to send back with changes. */
const asInput = (detail: AdminQuizDetail): QuizInput & { version: number } => {
  const { id, createdAt, createdBy, responseCount, ...rest } = detail;
  void id; void createdAt; void createdBy; void responseCount;
  return rest;
};

describe.skipIf(!emulator)("the admin guard", () => {
  it("turns away signed-out people, plain users and bad tokens, on every admin route", async () => {
    const id = (await createOk()).id;
    const calls = (token: string | null) => [
      listRoute(request("/api/admin/quizzes", "GET", token ?? undefined)),
      create(input(), token),
      getQuizRoute(request(`/api/admin/quizzes/${id}`, "GET", token ?? undefined), quizCtx(id)),
      save(id, { ...input(), version: 0 }, token),
      remove(id, token),
      restore(id, token),
      forever(id, "x", token),
      deleteUserRoute(request("/api/admin/users/x", "DELETE", token ?? undefined), { params: Promise.resolve({ uid: "x" }) }),
      patchUserRoute(request("/api/admin/users/x", "PATCH", token ?? undefined, { role: "admin" }), { params: Promise.resolve({ uid: "x" }) }),
      listUsersRoute(request("/api/admin/users", "GET", token ?? undefined)),
    ];
    for (const response of await Promise.all(calls(null))) expect(response.status).toBe(401);
    for (const response of await Promise.all(calls("bogus"))) expect(response.status).toBe(401);

    await db.doc("users/plain").set({ role: "user" });
    for (const response of await Promise.all(calls("uid:plain"))) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("admin_required");
    }
    // Nothing happened to the quiz.
    expect((await db.doc(`quizzes/${id}`).get()).exists).toBe(true);
  });

  it("lets an admin in by the role claim or by their profile", async () => {
    expect((await listRoute(request("/api/admin/quizzes", "GET", "admin:claimed"))).status).toBe(200);
    await db.doc("users/profiled").set({ role: "admin" });
    expect((await listRoute(request("/api/admin/quizzes", "GET", "uid:profiled"))).status).toBe(200);
  });
});

describe.skipIf(!emulator)("creating and opening a quiz", () => {
  it("stores one canonical shape and shows up in the list with counts", async () => {
    const { id, accessCode } = await createOk({
      title: "Stored shape",
      levels: {
        easy: { duration: 10, pointsMultiplier: 1, questions: [q("E1"), q("E2")] },
        hard: { duration: 5, pointsMultiplier: 2, questions: [q("H1", 2, { explanation: "Because." })] },
        medium: { duration: 8, pointsMultiplier: 1.5, questions: [] },
      },
    });
    expect(accessCode).toMatch(/^[A-Z2-9]{6}$/);

    const stored = (await db.doc(`quizzes/${id}`).get()).data()!;
    expect(stored).toMatchObject({
      title: "Stored shape",
      accessCode,
      availableDifficulties: ["easy", "hard"],
      difficultySettings: { easy: { duration: 10, pointsMultiplier: 1 }, hard: { duration: 5, pointsMultiplier: 2 } },
      questionCountByDifficulty: { easy: 2, hard: 1 },
      createdBy: "root",
    });
    expect(stored.difficultySettings.medium).toBeUndefined();
    expect(stored.createdAt).toBeInstanceOf(Timestamp);

    const easy = await db.collection(`quizzes/${id}/questions_easy`).get();
    expect(easy.docs.map((d) => d.data().text).sort()).toEqual(["E1", "E2"]);
    expect(easy.docs[0].data()).toMatchObject({ points: 1, type: "single" });
    expect(easy.docs.map((d) => d.data().order).sort()).toEqual([0, 1]);
    expect((await db.collection(`quizzes/${id}/questions_medium`).get()).empty).toBe(true);
    expect((await db.collection(`quizzes/${id}/questions`).get()).empty).toBe(true);

    const list = (await (await listRoute(request("/api/admin/quizzes", "GET", ADMIN))).json()) as { quizzes: AdminQuizSummary[] };
    expect(list.quizzes.find((row) => row.id === id)).toMatchObject({
      title: "Stored shape",
      accessCode,
      counts: { easy: 2, hard: 1 },
      responseCount: 0,
    });
  });

  it("opens a quiz with its answer key, in question order", async () => {
    const { id } = await createOk({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [q("First", 2), q("Second", 0), q("Third", 1)] } } });
    const detail = await open(id);
    expect(detail.levels.easy?.questions.map((x) => x.text)).toEqual(["First", "Second", "Third"]);
    expect(detail.levels.easy?.questions.map((x) => x.options.findIndex((o) => o.isCorrect))).toEqual([2, 0, 1]);
    expect(detail.levels.easy?.questions.every((x) => typeof x.id === "string")).toBe(true);
    expect(detail.version).toBeGreaterThan(0);
  });

  it("refuses a quiz that is not valid, and writes nothing", async () => {
    const before = (await db.collection("quizzes").count().get()).data().count;
    for (const bad of [
      input({ title: "" }),
      input({ levels: {} }),
      input({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [{ type: "single" as const, text: "No key", options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }] } } }),
      { not: "a quiz" },
    ]) {
      const response = await create(bad);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("invalid_quiz");
    }
    expect((await create("string")).status).toBe(400);
    expect((await db.collection("quizzes").count().get()).data().count).toBe(before);
  });

  it("keeps access codes unique, however they are typed", async () => {
    const code = unique("DUP").toUpperCase().slice(0, 9);
    await createOk({ accessCode: code });
    const again = await create(input({ accessCode: code.toLowerCase() }));
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("access_code_taken");
  });

  const bigLevels = () => {
    const many = Array.from({ length: 200 }, (_, i) => q(`Q${i}`, i % 3));
    return {
      easy: { duration: 10, pointsMultiplier: 1, questions: many },
      medium: { duration: 10, pointsMultiplier: 1, questions: many },
      hard: { duration: 10, pointsMultiplier: 1, questions: many },
    };
  };

  it("creates a quiz too big for one batch by writing the questions first and the quiz last", async () => {
    const { id } = await createOk({ title: unique("Big "), levels: bigLevels() });
    for (const level of ["easy", "medium", "hard"]) {
      expect((await db.collection(`quizzes/${id}/questions_${level}`).get()).size).toBe(200);
    }
    const stored = (await db.doc(`quizzes/${id}`).get()).data()!;
    expect(stored.questionCountByDifficulty).toEqual({ easy: 200, medium: 200, hard: 200 });
    // Order survives the split.
    const detail = await open(id);
    expect(detail.levels.hard?.questions.map((x) => x.text).slice(0, 3)).toEqual(["Q0", "Q1", "Q2"]);
  });

  describe("a save with more writes than one transaction holds", () => {
    const startAs = (player: string, quizId: string) =>
      startRoute(request("/api/attempts/start", "POST", `uid:${player}`, { quizId, difficulty: "easy" }));

    /** Makes the n-th batch commit fail, as a dropped connection would. */
    const failBatch = (nth: number) => {
      let calls = 0;
      const real = db.batch.bind(db);
      return vi.spyOn(db, "batch").mockImplementation(() => {
        const batch = real();
        const commit = batch.commit.bind(batch);
        batch.commit = async () => {
          if (++calls === nth) throw new Error("connection lost");
          return commit();
        };
        return batch;
      });
    };

    it("is written in chunks: all of it lands, the quiz is whole and not marked", async () => {
      const { id } = await createOk({ title: "Small" });
      const before = await open(id);
      const body = asInput(before);
      body.levels = bigLevels();
      cacheState.revalidated.length = 0;

      const response = await save(id, body);
      expect(response.status).toBe(200);
      const { version } = await response.json();
      expect(version).toBeGreaterThan(before.version);

      for (const level of ["easy", "medium", "hard"]) {
        expect((await db.collection(`quizzes/${id}/questions_${level}`).get()).size).toBe(200);
      }
      const stored = (await db.doc(`quizzes/${id}`).get()).data()!;
      expect(stored.importing).toBeUndefined();
      expect(stored.questionCountByDifficulty).toEqual({ easy: 200, medium: 200, hard: 200 });
      expect(stored.availableDifficulties).toEqual(["easy", "medium", "hard"]);
      const after = await open(id);
      expect(after.updateUnfinished).toBeUndefined();
      expect(after.levels.hard?.questions.map((x) => x.text).slice(0, 3)).toEqual(["Q0", "Q1", "Q2"]);
      expect(cacheState.revalidated).toContain(`quiz:${id}`);
      // And players can start it.
      expect((await startAs("p1", id)).status).toBe(201);
    });

    it("lets an attempt that began before it finish and be scored", async () => {
      const { id } = await createOk({ title: "Running", levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [q("Pick b", 1), q("Pick a", 0)] } } });
      const started = await startAs("early", id);
      expect(started.status).toBe(201);
      const attempt = (await started.json()) as AttemptState;

      const body = asInput(await open(id));
      body.levels = bigLevels();
      expect((await save(id, body)).status).toBe(200);

      // The old questions are gone from the quiz, but the attempt holds its own copy of them.
      const answers = Object.fromEntries(attempt.questions.map((x) => [x.id, x.text === "Pick b" ? 1 : 0]));
      const submitted = await submitRoute(
        request(`/api/attempts/${attempt.attemptId}/submit`, "POST", "uid:early", { answers }),
        { params: Promise.resolve({ id: attempt.attemptId }) }
      );
      expect(submitted.status).toBe(200);
      expect(((await submitted.json()) as SubmitResult).score).toBe(100);
    });

    it("says so when a chunk fails, keeps players out, and finishes when the same save is sent again", async () => {
      const { id } = await createOk({ title: "Interrupted" });
      const before = await open(id);
      const body = asInput(before);
      body.levels = bigLevels();

      const spy = failBatch(2);
      const failed = await save(id, body);
      spy.mockRestore();
      expect(failed.status).toBe(500);
      expect(await errorCode(failed)).toBe("update_interrupted");

      const stored = (await db.doc(`quizzes/${id}`).get()).data()!;
      expect(stored.importing).toMatchObject({ state: "interrupted" });
      // The quiz's own fields (and the version) have not moved, so the same request is still valid.
      expect(stored.availableDifficulties).toEqual(["easy"]);
      expect((await open(id)).updateUnfinished).toBe(true);
      const blocked = await startAs("late", id);
      expect(blocked.status).toBe(409);
      expect(await errorCode(blocked)).toBe("quiz_updating");

      expect((await save(id, body)).status).toBe(200);
      const done = (await db.doc(`quizzes/${id}`).get()).data()!;
      expect(done.importing).toBeUndefined();
      expect(done.questionCountByDifficulty).toEqual({ easy: 200, medium: 200, hard: 200 });
      for (const level of ["easy", "medium", "hard"]) {
        expect((await db.collection(`quizzes/${id}/questions_${level}`).get()).size).toBe(200);
      }
      expect((await startAs("late", id)).status).toBe(201);
    });

    it("puts the quiz back when the previous contents are sent after a failure", async () => {
      const { id } = await createOk({ title: "Undo" });
      const before = await open(id);
      const previous = asInput(before);
      const body = asInput(before);
      body.levels = bigLevels();

      const spy = failBatch(2);
      expect((await save(id, body)).status).toBe(500);
      spy.mockRestore();

      expect((await save(id, previous)).status).toBe(200);
      const after = await open(id);
      expect(after.updateUnfinished).toBeUndefined();
      expect(after.levels.easy?.questions.map((x) => x.text)).toEqual(["One", "Two"]);
      expect(after.levels.medium).toBeUndefined();
      expect((await db.collection(`quizzes/${id}/questions_medium`).get()).size).toBe(0);
    });

    it("refuses a second save while one is running, and takes over one that went stale", async () => {
      const { id } = await createOk({ title: "Busy" });
      const body = asInput(await open(id));
      await db.doc(`quizzes/${id}`).update({ importing: { state: "running", at: Timestamp.now() } });
      const refused = await save(id, body);
      expect(refused.status).toBe(409);
      expect(await errorCode(refused)).toBe("quiz_updating");

      await db.doc(`quizzes/${id}`).update({ importing: { state: "running", at: Timestamp.fromMillis(Date.now() - 10 * 60_000) } });
      expect((await save(id, body)).status).toBe(200);
      expect((await db.doc(`quizzes/${id}`).get()).data()!.importing).toBeUndefined();
    });

    it("does not let the quiz change under it: a stale version is refused before anything is written", async () => {
      const { id } = await createOk({ title: "Raced" });
      const body = asInput(await open(id));
      body.levels = bigLevels();
      body.version = 1;
      const response = await save(id, body);
      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("quiz_changed");
      expect((await db.collection(`quizzes/${id}/questions_medium`).get()).size).toBe(0);
      expect((await db.doc(`quizzes/${id}`).get()).data()!.importing).toBeUndefined();
    });
  });

  it("makes a quiz players can take: admin create, then start, answer and score", async () => {
    const { id, accessCode } = await createOk({
      title: "End to end",
      requiresAccessCode: true,
      levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [q("Pick b", 1), q("Pick a", 0), q("Pick c", 2), q("Pick b again", 1)] } },
    });
    const key = new Map((await open(id)).levels.easy!.questions.map((x) => [x.text, x.options.findIndex((o) => o.isCorrect)]));

    // The public routes never show the code or the key.
    const publicText = await (await publicQuizRoute(new Request("http://localhost/x"), quizCtx(id))).text();
    expect(publicText).not.toContain(accessCode);
    expect(publicText).not.toContain("isCorrect");
    expect(await (await publicListRoute()).text()).not.toContain(accessCode);

    const started = await startRoute(request("/api/attempts/start", "POST", "uid:player", { quizId: id, difficulty: "easy", accessCode }));
    expect(started.status).toBe(201);
    const attempt = (await started.json()) as AttemptState;
    // Questions arrive in the order the admin set.
    expect(attempt.questions.map((x) => x.text)).toEqual(["Pick b", "Pick a", "Pick c", "Pick b again"]);

    const answers = Object.fromEntries(attempt.questions.map((x) => [x.id, key.get(x.text)]));
    const submitted = await submitRoute(
      request(`/api/attempts/${attempt.attemptId}/submit`, "POST", "uid:player", { answers }),
      { params: Promise.resolve({ id: attempt.attemptId }) }
    );
    expect(submitted.status).toBe(200);
    expect(((await submitted.json()) as SubmitResult).score).toBe(100);
  });
});

describe.skipIf(!emulator)("saving a quiz", () => {
  it("applies fields and questions together and moves the version on", async () => {
    const { id } = await createOk();
    const detail = await open(id);
    const body = asInput(detail);
    body.title = "Renamed";
    body.levels.easy!.questions[0].text = "One, edited";
    body.levels.easy!.questions.push({ type: "single", text: "Three", options: [{ text: "x", isCorrect: true }, { text: "y", isCorrect: false }] });
    body.levels.hard = { duration: 7, pointsMultiplier: 2, questions: [q("Hard one")] };

    const response = await save(id, body);
    expect(response.status).toBe(200);
    const { version } = await response.json();
    expect(version).toBeGreaterThan(detail.version);

    const after = await open(id);
    expect(after.title).toBe("Renamed");
    expect(after.version).toBe(version);
    expect(after.levels.easy?.questions.map((x) => x.text)).toEqual(["One, edited", "Two", "Three"]);
    expect(after.levels.hard?.questions.map((x) => x.text)).toEqual(["Hard one"]);
    const stored = (await db.doc(`quizzes/${id}`).get()).data()!;
    expect(stored.availableDifficulties).toEqual(["easy", "hard"]);
    expect(stored.questionCountByDifficulty).toEqual({ easy: 3, hard: 1 });
    // The creator and creation time are not the editor's to change.
    expect(stored.createdBy).toBe("root");
  });

  it("removes deleted questions and dropped levels", async () => {
    const { id } = await createOk({
      levels: {
        easy: { duration: 10, pointsMultiplier: 1, questions: [q("Keep"), q("Drop")] },
        hard: { duration: 10, pointsMultiplier: 1, questions: [q("Hard")] },
      },
    });
    const body = asInput(await open(id));
    body.levels.easy!.questions = body.levels.easy!.questions.filter((x) => x.text === "Keep");
    delete body.levels.hard;
    expect((await save(id, body)).status).toBe(200);

    expect((await db.collection(`quizzes/${id}/questions_easy`).get()).docs.map((d) => d.data().text)).toEqual(["Keep"]);
    expect((await db.collection(`quizzes/${id}/questions_hard`).get()).empty).toBe(true);
  });

  it("does not rewrite a question that did not change", async () => {
    const { id } = await createOk();
    const detail = await open(id);
    const [first, second] = detail.levels.easy!.questions;
    const firstDoc = db.doc(`quizzes/${id}/questions_easy/${first.id}`);
    const secondDoc = db.doc(`quizzes/${id}/questions_easy/${second.id}`);
    const firstBefore = (await firstDoc.get()).updateTime!.toMillis();
    const secondBefore = (await secondDoc.get()).updateTime!.toMillis();

    const body = asInput(detail);
    body.levels.easy!.questions[1].text = "Two, edited";
    expect((await save(id, body)).status).toBe(200);

    expect((await firstDoc.get()).updateTime!.toMillis()).toBe(firstBefore);
    expect((await secondDoc.get()).updateTime!.toMillis()).toBeGreaterThan(secondBefore);
  });

  it("refuses a stale save and writes nothing", async () => {
    const { id } = await createOk({ title: "Original" });
    const mine = asInput(await open(id));
    const theirs = asInput(await open(id));

    theirs.title = "Theirs";
    expect((await save(id, theirs)).status).toBe(200);

    mine.title = "Mine";
    mine.levels.easy!.questions = [];
    mine.levels.hard = { duration: 5, pointsMultiplier: 1, questions: [q("Late")] };
    const response = await save(id, mine);
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("quiz_changed");

    const stored = await open(id);
    expect(stored.title).toBe("Theirs");
    expect(stored.levels.easy?.questions).toHaveLength(2);
    expect(stored.levels.hard).toBeUndefined();
  });

  it("lets only one of two saves from the same version through", async () => {
    const { id } = await createOk();
    const base = asInput(await open(id));
    const results = await Promise.all(
      ["A", "B", "C"].map((title) => save(id, { ...base, title }))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);
  });

  it("checks the version, the quiz and the new access code", async () => {
    const { id } = await createOk();
    const body = asInput(await open(id));
    expect(await errorCode(await save(id, { ...body, version: "soon" }))).toBe("invalid_version");
    expect((await save("no-such-quiz", body)).status).toBe(404);
    expect((await save("../bad", body)).status).toBe(400);
    expect((await save(id, { ...body, title: "" })).status).toBe(400);

    const other = await createOk({ accessCode: unique("TAKEN").toUpperCase().slice(0, 9) });
    const stolen = await save(id, { ...body, accessCode: (await open(other.id)).accessCode });
    expect(stolen.status).toBe(409);
    expect(await errorCode(stolen)).toBe("access_code_taken");
    // Keeping its own code is fine.
    expect((await save(id, body)).status).toBe(200);
  });

  it("moves an old shared `questions` collection into the levels on save", async () => {
    const id = unique("legacyquiz");
    await db.doc(`quizzes/${id}`).set({
      title: "Old quiz",
      description: "",
      duration: 15,
      accessCode: unique("OLD").toUpperCase().slice(0, 9),
      availableDifficulties: ["easy", "medium"],
      isAutoCheck: true,
      createdAt: Timestamp.now(),
    });
    await db.doc(`quizzes/${id}/questions/l1`).set({ text: "Old one", options: ["x", "y", "z"], correctIndex: 2 });
    await db.doc(`quizzes/${id}/questions/l2`).set({ text: "Old two", options: [{ text: "p", isCorrect: true }, { text: "q", isCorrect: false }], difficulty: "easy" });

    const detail = await open(id);
    expect(detail.version).toBe(0);
    // What players see today is what the editor shows: l1 at both levels, l2 only where it says.
    expect(detail.levels.easy?.questions.map((x) => x.text)).toEqual(["Old one", "Old two"]);
    expect(detail.levels.medium?.questions.map((x) => x.text)).toEqual(["Old one"]);
    expect(detail.levels.easy?.questions[0].options.map((o) => o.isCorrect)).toEqual([false, false, true]);
    expect(detail.levels.easy?.duration).toBe(15);

    expect((await save(id, asInput(detail))).status).toBe(200);
    expect((await db.collection(`quizzes/${id}/questions`).get()).empty).toBe(true);
    expect((await db.collection(`quizzes/${id}/questions_easy`).get()).size).toBe(2);
    expect((await db.collection(`quizzes/${id}/questions_medium`).get()).size).toBe(1);
    // Question ids survive the move.
    expect((await db.doc(`quizzes/${id}/questions_easy/l1`).get()).exists).toBe(true);
  });
});

describe.skipIf(!emulator)("deleting a quiz", () => {
  it("deletes the quiz, its questions, its results with their answers, and its attempts", async () => {
    const { id } = await createOk({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [q("A")] }, hard: { duration: 5, pointsMultiplier: 1, questions: [q("B")] } } });
    const other = await createOk();

    await db.doc(`quizzes/${id}/questions/legacy1`).set({ text: "Legacy" });
    for (let i = 0; i < 3; i++) {
      await db.doc(`responses/r${id}${i}`).set({ quizId: id, userId: "u", score: 50 });
      await db.doc(`responses/r${id}${i}/answers/a1`).set({ picked: 0 });
    }
    await db.doc(`attempts/at${id}`).set({ quizId: id, userId: "u" });
    await db.doc(`responses/keep${id}`).set({ quizId: other.id, userId: "u", score: 80 });
    await db.doc(`attempts/keep${id}`).set({ quizId: other.id, userId: "u" });

    // Results written behind the app's back aren't in the stored count; one without it is counted.
    await db.doc(`quizzes/${id}`).update({ responseCountTracked: FieldValue.delete() });
    const list = (await (await listRoute(request("/api/admin/quizzes", "GET", ADMIN))).json()) as { quizzes: AdminQuizSummary[] };
    expect(list.quizzes.find((row) => row.id === id)?.responseCount).toBe(3);

    // Deleting moves it to the trash; only "delete forever" removes data.
    const trashed = await remove(id);
    expect(trashed.status).toBe(200);
    expect(await trashed.json()).toEqual({ responseCount: 3 });
    expect((await db.doc(`quizzes/${id}`).get()).exists).toBe(true);
    expect((await db.collection("responses").where("quizId", "==", id).get()).size).toBe(3);

    const title = (await db.doc(`quizzes/${id}`).get()).data()!.title as string;
    const response = await forever(id, title);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedResults: 3 });

    expect((await db.doc(`quizzes/${id}`).get()).exists).toBe(false);
    for (const sub of ["questions", "questions_easy", "questions_hard"]) {
      expect((await db.collection(`quizzes/${id}/${sub}`).get()).empty).toBe(true);
    }
    expect((await db.collection("responses").where("quizId", "==", id).get()).empty).toBe(true);
    expect((await db.collection(`responses/r${id}0/answers`).get()).empty).toBe(true);
    expect((await db.collection("attempts").where("quizId", "==", id).get()).empty).toBe(true);

    // Another quiz's data is untouched.
    expect((await db.doc(`quizzes/${other.id}`).get()).exists).toBe(true);
    expect((await db.doc(`responses/keep${id}`).get()).exists).toBe(true);
    expect((await db.doc(`attempts/keep${id}`).get()).exists).toBe(true);
    expect((await db.collection(`quizzes/${other.id}/questions_easy`).get()).size).toBe(2);
  });

  it("says 404 for a quiz that isn't there", async () => {
    expect((await remove("never-existed")).status).toBe(404);
    expect((await remove("../up")).status).toBe(400);
    expect((await restore("never-existed")).status).toBe(404);
    expect((await forever("never-existed", "x")).status).toBe(404);
  });
});

describe.skipIf(!emulator)("the trash", () => {
  const publicIds = async () =>
    ((await (await publicListRoute()).json()) as { quizzes: { id: string }[] }).quizzes.map((q) => q.id);
  const startAs = (quizId: string, user: string, accessCode?: string) =>
    startRoute(request("/api/attempts/start", "POST", `uid:${user}`, { quizId, difficulty: "easy", accessCode }));

  it("hides a quiz from players, closes running attempts, keeps the results, and lists it as trashed", async () => {
    const { id, accessCode } = await createOk();
    const player = unique("p");
    const runner = unique("runner");
    const running = (await (await startAs(id, runner)).json()) as AttemptState;
    await play(id, player);
    expect(await publicIds()).toContain(id);

    expect((await remove(id)).status).toBe(200);

    expect(await publicIds()).not.toContain(id);
    expect((await publicQuizRoute(new Request("http://localhost/x"), quizCtx(id))).status).toBe(404);
    const resolved = await resolveRoute(request("/api/quizzes/resolve", "POST", undefined, { code: accessCode }));
    expect(resolved.status).toBe(404);
    expect((await startAs(id, unique("late"))).status).toBe(404);

    // An attempt that was running can't be submitted, so it can't put the quiz back on a board.
    const late = await submitRoute(
      request(`/api/attempts/${running.attemptId}/submit`, "POST", `uid:${runner}`, { answers: {} }),
      { params: Promise.resolve({ id: running.attemptId }) }
    );
    expect(late.status).not.toBe(200);
    expect((await db.doc(`attempts/${running.attemptId}`).get()).data()!.status).toBe("abandoned");

    // Nothing is deleted: the quiz, its questions and the results are all still there.
    const row = await (async () => {
      const list = (await (await listRoute(request("/api/admin/quizzes", "GET", ADMIN))).json()) as { quizzes: AdminQuizSummary[] };
      return list.quizzes.find((quiz) => quiz.id === id);
    })();
    expect(row).toMatchObject({ id, responseCount: 1, counts: { easy: 2 } });
    expect(row!.deletedAt).toBeGreaterThan(0);
    expect((await db.collection(`quizzes/${id}/questions_easy`).get()).size).toBe(2);
    expect((await db.collection("responses").where("quizId", "==", id).get()).size).toBe(1);
    expect((await db.doc(`quizzes/${id}`).get()).data()).toMatchObject({ deletedBy: "root" });
  });

  it("refuses to edit a quiz in the trash, and trashing twice is harmless", async () => {
    const { id } = await createOk();
    const detail = await open(id);
    expect((await remove(id)).status).toBe(200);
    const before = (await db.doc(`quizzes/${id}`).get()).data()!.deletedAt;
    expect((await remove(id)).status).toBe(200);
    expect((await db.doc(`quizzes/${id}`).get()).data()!.deletedAt).toEqual(before);

    const refused = await save(id, { ...asInput(detail), title: "Changed" });
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe("quiz_in_trash");
  });

  it("restores a quiz: listed again, startable, and its results back on the boards", async () => {
    const { id } = await createOk();
    const kept = await createOk();
    const both = unique("both");
    const onlyHere = unique("only");
    await play(id, both);
    await play(id, both, false);
    await play(kept.id, both);
    await play(id, onlyHere, false);
    const entryOf = async (quizId: string, userId: string) =>
      (await db.collection("leaderboard").doc(entryId(quizId, userId)).get()).data() as EntryDoc | undefined;
    const totalsOf = async (userId: string) =>
      (await db.collection("userTotals").doc(userId).get()).data() as TotalsDoc | undefined;
    const beforeEntry = await entryOf(id, both);
    const beforeTotals = await totalsOf(both);

    expect((await remove(id)).status).toBe(200);
    expect(await entryOf(id, both)).toBeUndefined();
    expect(await totalsOf(onlyHere)).toBeUndefined();
    expect(await totalsOf(both)).toMatchObject({ quizCount: 1 });

    expect((await restore(id)).status).toBe(200);
    expect(await publicIds()).toContain(id);
    expect((await startAs(id, unique("again"))).status).toBe(201);
    expect((await db.doc(`quizzes/${id}`).get()).data()!.deletedAt).toBeUndefined();

    // The same numbers as before it went to the trash.
    const pick = ({ score, attempts, difficulty }: EntryDoc) => ({ score, attempts, difficulty });
    expect(pick((await entryOf(id, both))!)).toEqual(pick(beforeEntry!));
    const sums = ({ points, quizCount, attempts }: TotalsDoc) => ({ points, quizCount, attempts });
    expect(sums((await totalsOf(both))!)).toEqual(sums(beforeTotals!));
    expect(await totalsOf(onlyHere)).toMatchObject({ quizCount: 1, points: 0 });
    // Restoring one that is not in the trash changes nothing.
    expect((await restore(id)).status).toBe(200);
  });

  it("leaves a trashed quiz out of the week and month boards and the dashboard count", async () => {
    const before = ((await (await statsRoute(request("/api/admin/stats", "GET", ADMIN))).json()) as DashboardData).totals.quizzes;
    const { id } = await createOk();
    expect(((await (await statsRoute(request("/api/admin/stats", "GET", ADMIN))).json()) as DashboardData).totals.quizzes).toBe(before + 1);
    expect((await remove(id)).status).toBe(200);
    expect(((await (await statsRoute(request("/api/admin/stats", "GET", ADMIN))).json()) as DashboardData).totals.quizzes).toBe(before);
  });

  it("deletes for good only from the trash, only with the exact title, and then really removes everything", async () => {
    const { id } = await createOk();
    const title = (await db.doc(`quizzes/${id}`).get()).data()!.title as string;
    await play(id, unique("p"));

    const notTrashed = await forever(id, title);
    expect(notTrashed.status).toBe(409);
    expect(await errorCode(notTrashed)).toBe("quiz_not_in_trash");

    expect((await remove(id)).status).toBe(200);
    for (const wrong of ["", "wrong title", undefined, 42]) {
      const response = await forever(id, wrong);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("title_mismatch");
    }
    expect((await db.doc(`quizzes/${id}`).get()).exists).toBe(true);

    const done = await forever(id, `  ${title} `);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ deletedResults: 1 });
    expect((await db.doc(`quizzes/${id}`).get()).exists).toBe(false);
    expect((await db.collection("responses").where("quizId", "==", id).get()).empty).toBe(true);
  });
});

describe.skipIf(!emulator)("the leaderboard and result counts", () => {
  const entryOf = async (quizId: string, userId: string) =>
    (await db.collection("leaderboard").doc(entryId(quizId, userId)).get()).data() as EntryDoc | undefined;
  const totalsOf = async (userId: string) =>
    (await db.collection("userTotals").doc(userId).get()).data() as TotalsDoc | undefined;
  const listed = async (id: string) =>
    ((await (await listRoute(request("/api/admin/quizzes", "GET", ADMIN))).json()) as { quizzes: AdminQuizSummary[] }).quizzes.find(
      (row) => row.id === id
    );


  it("lists a new quiz's stored count, kept by each submit, and counts an older quiz without one", async () => {
    const { id } = await createOk();
    expect(await listed(id)).toMatchObject({ responseCount: 0 });
    await play(id, unique("p"));
    await play(id, unique("p"), false);
    await vi.waitFor(async () => expect((await listed(id))?.responseCount).toBe(2));

    // From before stored counts (or before the backfill): counted, never the partial stored number.
    await db.doc(`quizzes/${id}`).update({ responseCount: 1, responseCountTracked: FieldValue.delete() });
    expect((await listed(id))?.responseCount).toBe(2);
  });

  it("deleting a quiz takes it off the board and works each person's totals out again", async () => {
    const gone = await createOk();
    const kept = await createOk();
    const both = unique("both");
    const onlyGone = unique("only");
    await play(gone.id, both);
    await play(kept.id, both, false);
    await play(kept.id, both);
    await play(gone.id, onlyGone);
    expect(await totalsOf(both)).toMatchObject({ points: 200, quizCount: 2, attempts: 3 });

    expect((await remove(gone.id)).status).toBe(200);

    expect(await entryOf(gone.id, both)).toBeUndefined();
    expect(await entryOf(gone.id, onlyGone)).toBeUndefined();
    expect(await entryOf(kept.id, both)).toMatchObject({ score: 100, attempts: 2 });
    const totals = await totalsOf(both);
    expect(totals).toMatchObject({ points: 100, quizCount: 1, attempts: 2 });
    expect(totals).toEqual(totalsFromEntries(both, null, [(await entryOf(kept.id, both))!]));
    expect(await totalsOf(onlyGone)).toBeUndefined();
  });

  it("clears the copied name when a person is deleted, and keeps their place", async () => {
    const { id } = await createOk();
    const uid = unique("named");
    await db.doc(`users/${uid}`).set({ role: "user", displayName: "Leaving" });
    await play(id, uid);
    expect(await entryOf(id, uid)).toMatchObject({ displayName: "Leaving" });

    const response = await deleteUserRoute(request(`/api/admin/users/${uid}`, "DELETE", ADMIN), {
      params: Promise.resolve({ uid }),
    });
    expect(response.status).toBe(200);
    expect(await entryOf(id, uid)).toMatchObject({ displayName: null, score: 100 });
    expect(await totalsOf(uid)).toMatchObject({ displayName: null, points: 100 });
  });
});

describe.skipIf(!emulator)("backfilling the leaderboard", () => {
  const days = (n: number) => Timestamp.fromMillis(Date.now() - n * 24 * 3600_000);

  async function seed() {
    const quizA = unique("bfA");
    const quizB = unique("bfB");
    for (const id of [quizA, quizB]) await db.doc(`quizzes/${id}`).set({ title: id, createdAt: Timestamp.now() });
    const ada = unique("ada");
    const bob = unique("bob");
    await db.doc(`users/${ada}`).set({ displayName: "Ada", email: "ada@example.com" });
    const results: Array<[string, string, number | null, string, number]> = [
      [quizA, ada, 60, "easy", 9],
      [quizA, ada, 90, "hard", 8],
      [quizA, ada, 70, "easy", 7],
      [quizB, ada, 40, "medium", 6],
      [quizA, bob, 95, "medium", 5],
      [quizB, bob, null, "medium", 4], // checked by hand: counted as a result, not ranked
      [quizB, bob, 30, "basic", 3], // a level that no longer exists: counts overall only
    ];
    for (const [quizId, userId, score, level, ago] of results) {
      await db.collection("responses").doc(unique("bfr")).set({
        quizId,
        userId,
        score,
        selectedDifficulty: level,
        startedAt: Timestamp.fromMillis(days(ago).toMillis() - 90_000),
        submittedAt: days(ago),
      });
    }
    return { quizA, quizB, ada, bob };
  }

  /** The old computation: the boards built straight from these people's results. */
  async function fromResponses(userIds: string[]): Promise<LeaderboardRow[]> {
    const snap = await db.collection("responses").where("userId", "in", userIds).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        userId: data.userId,
        quizId: data.quizId,
        score: data.score,
        selectedDifficulty: data.selectedDifficulty,
        startedAt: data.startedAt.toMillis(),
        submittedAt: data.submittedAt.toMillis(),
      };
    });
  }

  it("reports and writes nothing on a dry run", async () => {
    const { quizA, ada } = await seed();
    const report = await backfillLeaderboard(db, { apply: false });
    expect(report.applied).toBe(false);
    expect(report.responseCounts[quizA]).toBe(4);
    expect(report.scored).toBeLessThan(report.responses);
    expect((await db.collection("leaderboard").doc(entryId(quizA, ada)).get()).exists).toBe(false);
    expect((await db.doc(`quizzes/${quizA}`).get()).data()!.responseCount).toBeUndefined();
  });

  it("builds entries, totals and counts that match the boards computed from the results, and is safe to rerun", async () => {
    const { quizA, quizB, ada, bob } = await seed();
    await db.collection("leaderboard").doc("nothing_supports-this").set({ quizId: "nothing", userId: "x", rankKey: "1" });
    await db.collection("userTotals").doc(`ghost${bob}`).set({ userId: `ghost${bob}`, rankKey: "1" });

    await backfillLeaderboard(db, { apply: true });

    const entry = (await db.collection("leaderboard").doc(entryId(quizA, ada)).get()).data() as EntryDoc;
    expect(entry).toMatchObject({ displayName: "Ada", score: 90, difficulty: "hard", attempts: 3 });
    expect(entry.levels).toMatchObject({ easy: { score: 70, attempts: 2 }, hard: { score: 90, attempts: 1 } });
    expect((await db.collection("leaderboard").doc("nothing_supports-this").get()).exists).toBe(false);
    expect((await db.collection("userTotals").doc(`ghost${bob}`).get()).exists).toBe(false);
    expect((await db.doc(`quizzes/${quizA}`).get()).data()).toMatchObject({ responseCount: 4, responseCountTracked: true });
    expect((await db.doc(`quizzes/${quizB}`).get()).data()).toMatchObject({ responseCount: 3, responseCountTracked: true });

    // The same numbers as the old way: every board built straight from the results.
    const rows = await fromResponses([ada, bob]);
    const overall = buildOverallBoard(rows, {});
    const totals = await Promise.all(
      overall.map(async (e) => (await db.collection("userTotals").doc(e.userId).get()).data() as TotalsDoc)
    );
    expect(totals.map((t) => [t.userId, t.points, t.quizCount, t.attempts])).toEqual(
      overall.map((e) => [e.userId, e.points, e.quizCount, e.attempts])
    );
    expect(totals.find((t) => t.userId === bob)).toMatchObject({ points: 125, quizCount: 2, attempts: 2 });
    expect(totals.find((t) => t.userId === bob)!.levels).toEqual({
      medium: expect.objectContaining({ points: 95, quizCount: 1 }),
    });
    for (const quizId of [quizA, quizB]) {
      const board = buildQuizBoard(rows.filter((r) => r.quizId === quizId), {});
      const stored = await Promise.all(
        board.map(async (e) => (await db.collection("leaderboard").doc(entryId(quizId, e.userId)).get()).data() as EntryDoc)
      );
      expect(stored.map((s) => [s.userId, s.score, s.timeTakenSec])).toEqual(board.map((e) => [e.userId, e.score, e.timeTaken]));
    }

    // Built from scratch each time: a second run changes nothing.
    const again = await backfillLeaderboard(db, { apply: true });
    expect(again.stale).toBe(0);
    expect((await db.collection("leaderboard").doc(entryId(quizA, ada)).get()).data()).toEqual(entry);
  });
});

describe.skipIf(!emulator)("keeping the public cache fresh", () => {
  it("clears the list and the quiz on create, save and delete, and not on a refused save", async () => {
    cacheState.revalidated = [];
    const { id } = await createOk();
    expect(cacheState.revalidated).toEqual(["quizzes", `quiz:${id}`]);

    cacheState.revalidated = [];
    const detail = await open(id);
    expect((await save(id, { ...asInput(detail), title: "Fresh" })).status).toBe(200);
    expect(cacheState.revalidated).toEqual(["quizzes", `quiz:${id}`]);

    cacheState.revalidated = [];
    expect((await save(id, asInput(detail))).status).toBe(409); // stale version
    expect(cacheState.revalidated).toEqual([]);

    expect((await remove(id)).status).toBe(200);
    expect(cacheState.revalidated).toEqual(["quizzes", `quiz:${id}`]);
  });

  it("gives the lobby the counts the save stored, without counting the questions again", async () => {
    const { id } = await createOk();
    // A question written behind the editor's back isn't counted: the stored counts are what the lobby shows.
    await db.doc(`quizzes/${id}/questions_easy/extra`).set({ text: "Extra", options: ["a", "b"], correctIndex: 0 });
    const info = await (await publicQuizRoute(new Request("http://localhost/x"), quizCtx(id))).json();
    expect(info.counts).toEqual({ easy: 2 });
  });
});

describe.skipIf(!emulator)("deleting a user", () => {
  const del = (uid: string, token = ADMIN) =>
    deleteUserRoute(request(`/api/admin/users/${uid}`, "DELETE", token), { params: Promise.resolve({ uid }) });

  it("removes the sign-in account, the profile and what hangs off it, and keeps finished results", async () => {
    const uid = unique("leaver");
    await db.doc(`users/${uid}`).set({ role: "user", email: "x@example.com" });
    await db.doc(`users/${uid}/private/notes`).set({ a: 1 });
    await db.doc(`attempts/${uid}-a`).set({ userId: uid, quizId: "q" });
    await db.doc(`userActivities/${uid}-act`).set({ userId: uid, activityType: "login" });
    await db.doc(`responses/${uid}-r`).set({ userId: uid, quizId: "q", score: 70 });
    await db.doc(`attempts/other-${uid}`).set({ userId: "someone-else", quizId: "q" });

    const response = await del(uid);
    expect(response.status).toBe(200);
    expect(authState.deleted).toContain(uid);
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${uid}/private/notes`).get()).exists).toBe(false);
    expect((await db.doc(`attempts/${uid}-a`).get()).exists).toBe(false);
    expect((await db.doc(`userActivities/${uid}-act`).get()).exists).toBe(false);
    expect((await db.doc(`responses/${uid}-r`).get()).exists).toBe(true);
    expect((await db.doc(`attempts/other-${uid}`).get()).exists).toBe(true);
  });

  it("cleans up a profile whose sign-in account is already gone", async () => {
    await db.doc("users/ghost1").set({ role: "user" });
    expect((await del("ghost1")).status).toBe(200);
    expect((await db.doc("users/ghost1").get()).exists).toBe(false);
  });

  it("won't delete yourself or the last admin", async () => {
    await db.doc("users/root").set({ role: "admin" });
    const self = await del("root");
    expect(self.status).toBe(400);
    expect(await errorCode(self)).toBe("cannot_delete_self");
    expect((await db.doc("users/root").get()).exists).toBe(true);

    // Make "root" the only admin: everyone else with the role is demoted for this check.
    const admins = await db.collection("users").where("role", "==", "admin").get();
    await Promise.all(admins.docs.filter((d) => d.id !== "root").map((d) => d.ref.update({ role: "user" })));
    const last = await del("root", "admin:someone-else");
    expect(last.status).toBe(400);
    expect(await errorCode(last)).toBe("last_admin");
    expect((await db.doc("users/root").get()).exists).toBe(true);

    // With a second admin it goes through.
    await db.doc("users/second").set({ role: "admin" });
    expect((await del("root", "admin:second")).status).toBe(200);
  });
});

describe.skipIf(!emulator)("listing users and changing roles", () => {
  const setRole = (uid: string, body: unknown, token = ADMIN) =>
    patchUserRoute(request(`/api/admin/users/${uid}`, "PATCH", token, body), { params: Promise.resolve({ uid }) });

  it("lists people newest first with plain times, and no activity logs", async () => {
    const older = unique("older");
    const newer = unique("newer");
    await db.doc(`users/${older}`).set({
      email: "o@example.com", displayName: "Old", role: "user", emailVerified: true,
      createdAt: Timestamp.fromMillis(1_000), lastLoginAt: Timestamp.fromMillis(5_000), activityLogs: ["secret"],
    });
    await db.doc(`users/${newer}`).set({ email: "n@example.com", role: "admin", createdAt: Timestamp.fromMillis(2_000) });

    const response = await listUsersRoute(request("/api/admin/users", "GET", ADMIN));
    const text = await response.text();
    const body = JSON.parse(text) as { users: { id: string }[]; total: number };

    expect(response.status).toBe(200);
    expect(text).not.toContain("secret");
    expect(body.total).toBeGreaterThanOrEqual(2);
    const ids = body.users.map((u) => u.id);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    expect(body.users.find((u) => u.id === older)).toEqual({
      id: older, email: "o@example.com", displayName: "Old", role: "user", emailVerified: true,
      createdAt: 1_000, lastLoginAt: 5_000,
    });
    expect(body.users.find((u) => u.id === newer)).toMatchObject({
      role: "admin", displayName: "", emailVerified: false, lastLoginAt: null,
    });
  });

  it("promotes: sets the claim (keeping other claims) and the profile together", async () => {
    const uid = unique("promote");
    await db.doc(`users/${uid}`).set({ role: "user" });

    const response = await setRole(uid, { role: "admin" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: uid, role: "admin" });
    expect(authState.claims[uid]).toEqual({ keep: "me", role: "admin" });
    expect((await db.doc(`users/${uid}`).get()).data()?.role).toBe("admin");
    expect(authState.revoked).not.toContain(uid);
    // They can now use the admin routes.
    expect((await listRoute(request("/api/admin/quizzes", "GET", `uid:${uid}`))).status).toBe(200);
  });

  it("demotes: clears both and ends their current sessions", async () => {
    const uid = unique("demote");
    await db.doc(`users/${uid}`).set({ role: "admin" });

    expect((await setRole(uid, { role: "user" })).status).toBe(200);
    expect(authState.claims[uid]).toMatchObject({ role: "user" });
    expect((await db.doc(`users/${uid}`).get()).data()?.role).toBe("user");
    expect(authState.revoked).toContain(uid);
    expect((await listRoute(request("/api/admin/quizzes", "GET", `uid:${uid}`))).status).toBe(403);
  });

  it("won't change your own role, take an unknown role, or touch someone who doesn't exist", async () => {
    await db.doc("users/root").set({ role: "admin" });
    const self = await setRole("root", { role: "user" }, ADMIN);
    expect(self.status).toBe(400);
    expect(await errorCode(self)).toBe("cannot_change_own_role");
    expect((await db.doc("users/root").get()).data()?.role).toBe("admin");

    const uid = unique("someone");
    await db.doc(`users/${uid}`).set({ role: "user" });
    for (const role of ["owner", "", undefined, 1]) {
      const bad = await setRole(uid, { role });
      expect(bad.status).toBe(400);
      expect(await errorCode(bad)).toBe("invalid_role");
    }
    expect((await db.doc(`users/${uid}`).get()).data()?.role).toBe("user");

    const missing = await setRole(unique("nobody"), { role: "admin" });
    expect(missing.status).toBe(404);
    await db.doc("users/ghost2").set({ role: "user" });
    expect((await setRole("ghost2", { role: "admin" })).status).toBe(404);
    expect((await db.doc("users/ghost2").get()).data()?.role).toBe("user");
  });
});

describe.skipIf(!emulator)("the registration route", () => {
  // The body the app sends (lib/actions/auth.actions.ts), plus whatever an attacker adds.
  const register = (token: string | undefined, body: Record<string, unknown>) =>
    registerRoute(
      request("/api/auth/user", "POST", token, {
        displayName: "Someone",
        email: "someone@example.com",
        photoURL: null,
        emailVerified: false,
        ...body,
      }) as never
    );

  it("never makes anyone an admin, whatever the body says", async () => {
    const response = await register("uid:mallory", { uid: "mallory", role: "admin", displayName: "M" });
    expect(response.status).toBe(200);
    expect((await db.doc("users/mallory").get()).data()).toMatchObject({ role: "user", displayName: "M", email: "mallory@example.com" });
    expect(authState.claims.mallory).toEqual({ role: "user" });
  });

  it("leaves an existing role alone and refuses to write someone else's profile", async () => {
    await db.doc("users/boss").set({ role: "admin", displayName: "Boss" });
    expect((await register("uid:boss", { uid: "boss", role: "user", displayName: "Boss 2" })).status).toBe(200);
    expect((await db.doc("users/boss").get()).data()).toMatchObject({ role: "admin", displayName: "Boss 2" });

    await db.doc("users/victim").set({ role: "user", displayName: "Victim" });
    expect((await register("uid:mallory", { uid: "victim", role: "admin" })).status).toBe(403);
    expect((await db.doc("users/victim").get()).data()).toMatchObject({ role: "user", displayName: "Victim" });
  });

  it("needs a valid sign-in", async () => {
    expect((await register(undefined, { uid: "x" })).status).toBe(401);
    expect((await register("bogus", { uid: "x" })).status).toBe(401);
  });
});

describe.skipIf(!emulator)("an admin opening one person's attempt (A5.3)", () => {
  const detail = (attemptId: string, token: string | null = ADMIN) =>
    attemptDetailRoute(request(`/api/admin/reports/${attemptId}`, "GET", token ?? undefined), {
      params: Promise.resolve({ attemptId }),
    });

  /** Starts an attempt at a `createOk()` quiz (two easy questions) and submits every answer wrong, or leaves it running. */
  async function attemptAt(quizId: string, player: string, { submit = true } = {}) {
    const started = await startRoute(
      request("/api/attempts/start", "POST", `uid:${player}`, { quizId, difficulty: "easy" })
    );
    expect(started.status).toBe(201);
    const attempt = (await started.json()) as AttemptState;
    if (submit) {
      const answers = Object.fromEntries(attempt.questions.map((x) => [x.id, [2]]));
      const done = await submitRoute(
        request(`/api/attempts/${attempt.attemptId}/submit`, "POST", `uid:${player}`, { answers }),
        { params: Promise.resolve({ id: attempt.attemptId }) }
      );
      expect(done.status).toBe(200);
    }
    return attempt;
  }

  it("shows what a different person picked next to the key, with the player's name", async () => {
    const quizId = (await createOk({ title: "Wrong answers quiz" })).id;
    const player = unique("pl");
    await db.doc(`users/${player}`).set({ displayName: "Ada Lovelace", email: "ada@example.com" });
    const attempt = await attemptAt(quizId, player);

    const response = await detail(attempt.attemptId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data = (await response.json()) as AdminAttemptDetail;

    expect(data.player).toEqual({ id: player, name: "Ada Lovelace", email: "ada@example.com" });
    expect(data.quizTitle).toBe("Wrong answers quiz");
    expect(data.graded).toBe(true);
    expect(data.result.score).toBe(0);
    expect(data.questions).toHaveLength(2);
    // Everything was answered with option C; the key is B for the first question and A for the second.
    for (const question of data.questions) expect(data.result.answers[question.id]).toEqual([2]);
    const keys = data.questions.map((question) => data.result.review?.[question.id]?.correct);
    expect(keys.sort()).toEqual([[0], [1]]);
  });

  it("gives the admin the review even when the quiz hides it from players", async () => {
    const quizId = (await createOk({ showAnswerReview: false })).id;
    const player = unique("pl");
    const attempt = await attemptAt(quizId, player);

    const own = (await (
      await playerResultRoute(request(`/api/attempts/${attempt.attemptId}/result`, "GET", `uid:${player}`), {
        params: Promise.resolve({ id: attempt.attemptId }),
      })
    ).json()) as { result: SubmitResult };
    expect(own.result.review).toBeNull();

    const data = (await (await detail(attempt.attemptId)).json()) as AdminAttemptDetail;
    expect(data.result.review).not.toBeNull();
    expect(Object.keys(data.result.review ?? {})).toHaveLength(2);
  });

  it("keeps a person's own result route owner-only", async () => {
    const quizId = (await createOk()).id;
    const attempt = await attemptAt(quizId, unique("pl"));
    const other = await playerResultRoute(
      request(`/api/attempts/${attempt.attemptId}/result`, "GET", `admin:${unique("someone")}`),
      { params: Promise.resolve({ id: attempt.attemptId }) }
    );
    expect(other.status).toBe(404);
  });

  it("lists the recorded events in order, with the server's time, and says when some are not kept", async () => {
    const quizId = (await createOk()).id;
    const attempt = await attemptAt(quizId, unique("pl"));
    const at = Date.now();
    await db.doc(`attempts/${attempt.attemptId}`).update({
      events: [
        { seq: 1, type: "tab_hidden", at, clientAt: 5 },
        { seq: 2, type: "fullscreen_exit", at: at + 4_000, clientAt: 6 },
      ],
      tabSwitches: 1,
      fullscreenExits: 1,
    });
    let data = (await (await detail(attempt.attemptId)).json()) as AdminAttemptDetail;
    expect(data.events).toEqual([
      { type: "tab_hidden", at },
      { type: "fullscreen_exit", at: at + 4_000 },
    ]);
    expect(data.eventsTruncated).toBe(false);
    // The browser's own clock is context for the server only.
    expect(JSON.stringify(data.events)).not.toContain("clientAt");

    await db.doc(`attempts/${attempt.attemptId}`).update({ tabSwitches: 9 });
    data = (await (await detail(attempt.attemptId)).json()) as AdminAttemptDetail;
    expect(data.eventsTruncated).toBe(true);
  });

  it("reads an attempt that began under the older question model", async () => {
    const quizId = unique("oldq");
    const attemptId = unique("olda");
    const userId = unique("pl");
    await db.doc(`quizzes/${quizId}`).set({ title: "Older quiz" });
    await db.doc(`attempts/${attemptId}`).set({
      quizId,
      userId,
      difficulty: "easy",
      status: "submitted",
      startedAt: Timestamp.fromMillis(1_000),
      deadline: Timestamp.fromMillis(601_000),
      submittedAt: Timestamp.fromMillis(61_000),
      updatedAt: Timestamp.fromMillis(61_000),
      createdAt: Timestamp.fromMillis(1_000),
      durationSec: 600,
      questions: [
        { id: "q1", text: "One", options: ["a", "b", "c"], correctIndex: 1, explanation: "B is right." },
        { id: "q2", text: "Two", options: ["a", "b"], correctIndex: 0 },
      ],
      autoCheck: true,
      showAnswerReview: false,
      multiplier: 1,
      answers: { q1: 0, q2: null },
      flagged: {},
      index: 0,
      tabSwitches: 0,
      fullscreenExits: 0,
      result: {
        responseId: attemptId,
        graded: true,
        score: 0,
        rawPercent: 0,
        correct: 0,
        total: 2,
        answered: 1,
        multiplier: 1,
        timeTakenSec: 60,
        late: false,
        answers: { q1: 0, q2: null },
        tabSwitches: 0,
        blurs: 0,
        fullscreenExits: 0,
        review: null,
      },
    });

    const data = (await (await detail(attemptId)).json()) as AdminAttemptDetail;
    expect(data.player.name).toBe("Unknown user");
    expect(data.result.answers).toEqual({ q1: [0], q2: [] });
    expect(data.result.review?.q1).toMatchObject({ correct: [1], explanation: "B is right." });
    expect(data.result.review?.q2).toMatchObject({ correct: [0] });
  });

  it("is for admins only, and says plainly what it cannot show", async () => {
    const quizId = (await createOk()).id;
    const finished = await attemptAt(quizId, unique("pl"));
    const running = await attemptAt(quizId, unique("pl"), { submit: false });

    expect((await detail(finished.attemptId, null)).status).toBe(401);
    expect((await detail(finished.attemptId, "uid:plain")).status).toBe(403);
    expect((await detail(finished.attemptId, "bad-token")).status).toBe(401);

    const missing = await detail(unique("nothing"));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("attempt_not_found");

    const unfinished = await detail(running.attemptId);
    expect(unfinished.status).toBe(409);
    expect(await errorCode(unfinished)).toBe("attempt_not_finished");

    for (const bad of ["../x", "a/b", "x".repeat(300)]) {
      const response = await detail(encodeURIComponent(bad));
      expect([400, 404]).toContain(response.status);
    }
  });
});

describe.skipIf(!emulator)("results by question (A5.2)", () => {
  const insights = (quizId: string, token: string | null = ADMIN) =>
    insightsRoute(request(`/api/admin/quizzes/${quizId}/insights`, "GET", token ?? undefined), quizCtx(quizId));

  it("works out each question's share right and option picks from the stored sheets", async () => {
    const quizId = (await createOk()).id;
    // Ten results: six get every answer right, four get every answer wrong (option C).
    for (let i = 0; i < 10; i++) await play(quizId, unique("pl"), i < 6);
    // Results the analysis must tolerate: one with no sheet at all, one at a level the quiz doesn't have.
    await db.doc(`responses/${unique("nosheet")}`).set({ quizId, userId: "x", score: 10, selectedDifficulty: "easy", submittedAt: Timestamp.now() });
    await db.doc(`responses/${unique("otherlevel")}`).set({ quizId, userId: "x", score: 10, selectedDifficulty: "hard", sheet: { nope: { p: [0] } }, submittedAt: Timestamp.now() });

    const response = await insights(quizId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data = (await response.json()) as QuizInsights;

    expect(data.total).toBe(12);
    expect(data.analysed).toBe(12);
    expect(data.levels.map((level) => level.level)).toEqual(["easy"]);
    const easy = data.levels[0];
    expect(easy.attempts).toBe(11); // the 10 played + the one without a sheet; the "hard" one belongs elsewhere
    expect(easy.questions.map((q) => q.label)).toEqual(["One", "Two"]);
    for (const question of easy.questions) {
      expect(question).toMatchObject({ attempts: 11, answered: 10, correct: 6, enough: true });
      expect(question.difficulty).toBeCloseTo(6 / 11);
      // Everyone who got it wrong picked option C.
      expect(question.options[2].picks).toBe(4);
      expect(question.options.reduce((sum, option) => sum + option.picks, 0)).toBe(10);
    }
    // The key came from the quiz as it is: option B for "One", option A for "Two".
    expect(easy.questions[0].options.map((o) => o.correct)).toEqual([false, true, false]);
    expect(easy.questions[1].options.map((o) => o.correct)).toEqual([true, false, false]);
  });

  it("answers for a quiz nobody has taken, and does not mix in another quiz's results", async () => {
    const quizId = (await createOk()).id;
    await play((await createOk()).id, unique("pl"));
    const data = (await (await insights(quizId)).json()) as QuizInsights;
    expect(data).toMatchObject({ total: 0, analysed: 0, flagged: 0 });
    expect(data.levels[0].questions.every((q) => q.attempts === 0 && q.difficulty === null)).toBe(true);
  });

  it("is for admins only, and refuses a quiz that doesn't exist or a bad id", async () => {
    const quizId = (await createOk()).id;
    expect((await insights(quizId, null)).status).toBe(401);
    expect((await insights(quizId, "uid:plain")).status).toBe(403);
    const missing = await insights(unique("nothing"));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("quiz_not_found");
    expect((await insights("../x")).status).toBe(400);
  });
});

describe.skipIf(!emulator)("reports and the dashboard", () => {
  const FAR_FUTURE = Date.UTC(2100, 0, 1);
  let seeds = 0;
  const reports = (query = "", token: string | null = ADMIN) =>
    reportsRoute(request(`/api/admin/reports${query}`, "GET", token ?? undefined));

  /** Five results from the year 2100 (each call newer than the last), so they are the newest in a shared database. */
  async function seedResults() {
    const base = FAR_FUTURE + ++seeds * 10_000_000;
    const tag = unique("rep");
    const quizA = `${tag}A`;
    const quizB = `${tag}B`;
    await db.doc(`quizzes/${quizA}`).set({ title: "Alpha quiz" });
    await db.doc(`quizzes/${quizB}`).set({ title: "Beta quiz" });
    await db.doc(`users/${tag}-ann`).set({ displayName: "Ann", email: "ann@example.com" });
    await db.doc(`users/${tag}-bo`).set({ email: "bo@example.com" });
    const rows = [
      { quizId: quizA, userId: `${tag}-ann`, score: 90 },
      { quizId: quizA, userId: `${tag}-bo`, score: 70 },
      { quizId: quizB, userId: `${tag}-ann`, score: 50 },
      { quizId: quizB, userId: `${tag}-gone`, score: null },
      { quizId: `${tag}-deleted`, userId: `${tag}-bo`, score: 10 },
    ];
    for (const [i, row] of rows.entries()) {
      await db.doc(`responses/${tag}-r${i}`).set({
        ...row,
        startedAt: Timestamp.fromMillis(base + i * 1000 - 60_000),
        submittedAt: Timestamp.fromMillis(base + i * 1000),
        tabSwitchCount: i,
        fullscreenExits: 1,
        selectedDifficulty: "hard",
        // Heavy fields the screens don't use must not be sent.
        integrityEvents: Array.from({ length: 50 }, (_, n) => ({ seq: n, type: "tab_hidden", at: n })),
        answers: "not for the report",
      });
    }
    return { tag, quizA, quizB, base };
  }

  it("gives the newest results first with quiz titles and names looked up, and only the fields it needs", async () => {
    const { tag, base } = await seedResults();
    const page = (await (await reports("?limit=5")).json()) as ReportsPage;

    expect(page.rows.map((r) => r.id)).toEqual([4, 3, 2, 1, 0].map((i) => `${tag}-r${i}`));
    expect(page.rows[4]).toMatchObject({
      quizTitle: "Alpha quiz",
      userName: "Ann",
      score: 90,
      tabSwitchCount: 0,
      fullscreenExits: 1,
      blurCount: 0,
      difficulty: "hard",
    });
    // A person with no display name shows their email; a deleted quiz or person shows as unknown.
    expect(page.rows[3].userName).toBe("bo@example.com");
    expect(page.rows[1]).toMatchObject({ quizTitle: "Beta quiz", userName: "Unknown user", score: null });
    expect(page.rows[0]).toMatchObject({ quizTitle: "Unknown quiz" });
    expect(page.rows[4].startedAt).toBe(base - 60_000);
    expect(page.rows[4].submittedAt).toBe(base);
    expect(JSON.stringify(page)).not.toContain("not for the report");
    expect(JSON.stringify(page)).not.toContain("integrityEvents");

    expect(page.total).toBe((await db.collection("responses").count().get()).data().count);
    expect(page.quizzes.map((q) => q.title)).toEqual([...page.quizzes.map((q) => q.title)].sort((a, b) => a.localeCompare(b)));
    expect(page.quizzes.some((q) => q.title === "Alpha quiz")).toBe(true);
  });

  it("pages through results without repeats or gaps, and says when there are no more", async () => {
    const { tag } = await seedResults();
    const first = (await (await reports("?limit=2")).json()) as ReportsPage;
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).toBe(first.rows[1].id);

    const second = (await (await reports(`?limit=2&cursor=${first.nextCursor}`)).json()) as ReportsPage;
    expect(first.rows.map((r) => r.id)).toEqual([`${tag}-r4`, `${tag}-r3`]);
    expect(second.rows.map((r) => r.id)).toEqual([`${tag}-r2`, `${tag}-r1`]);
    const seen = new Set([...first.rows, ...second.rows].map((r) => r.id));
    expect(seen.size).toBe(4);

    // Walking to the end returns every finished result exactly once.
    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const page = (await (await reports(`?limit=7${cursor ? `&cursor=${cursor}` : ""}`)).json()) as ReportsPage;
      all.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((id) => id.startsWith(tag))).toHaveLength(5);
  });

  it("filters to one quiz on the server, with that quiz's own total and paging", async () => {
    const { tag, quizA, quizB } = await seedResults();
    const only = (await (await reports(`?quizId=${quizA}&limit=1`)).json()) as ReportsPage;
    expect(only.rows.map((r) => r.id)).toEqual([`${tag}-r1`]);
    expect(only.total).toBe(2);
    expect(only.nextCursor).toBe(`${tag}-r1`);
    expect(only.quizzes.length).toBeGreaterThan(1); // the dropdown still lists every quiz

    const next = (await (await reports(`?quizId=${quizA}&limit=1&cursor=${only.nextCursor}`)).json()) as ReportsPage;
    expect(next.rows.map((r) => r.id)).toEqual([`${tag}-r0`]);
    expect(next.nextCursor).toBeNull();

    const other = (await (await reports(`?quizId=${quizB}`)).json()) as ReportsPage;
    expect(other.rows.map((r) => r.id)).toEqual([`${tag}-r3`, `${tag}-r2`]);
    expect(((await (await reports("?quizId=nothing-here")).json()) as ReportsPage).total).toBe(0);
    expect((await reports("?quizId=../x")).status).toBe(400);
  });

  it("keeps the page size within bounds and refuses a made-up cursor", async () => {
    expect(((await (await reports("?limit=0")).json()) as ReportsPage).rows.length).toBeLessThanOrEqual(200);
    expect(((await (await reports("?limit=abc")).json()) as ReportsPage).rows.length).toBeLessThanOrEqual(200);
    expect(((await (await reports("?limit=100000")).json()) as ReportsPage).rows.length).toBeLessThanOrEqual(500);
    for (const bad of ["../x", "does-not-exist"]) {
      const response = await reports(`?cursor=${bad}`);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("invalid_cursor");
    }
  });

  it("shows one person's results, names them, and will not combine a person with a quiz", async () => {
    const { tag, quizA } = await seedResults();
    const ann = (await (await reports(`?userId=${tag}-ann`)).json()) as ReportsPage;
    expect(ann.person).toEqual({ id: `${tag}-ann`, name: "Ann" });
    expect(ann.total).toBe(2);
    expect(ann.rows.map((row) => row.userId)).toEqual([`${tag}-ann`, `${tag}-ann`]);
    expect(ann.rows[0].submittedAt).toBeGreaterThan(ann.rows[1].submittedAt as number);

    const nobody = (await (await reports(`?userId=${tag}-nobody`)).json()) as ReportsPage;
    expect(nobody).toMatchObject({ total: 0, rows: [], person: { name: "Unknown user" } });
    expect(((await (await reports(`?quizId=${quizA}`)).json()) as ReportsPage).person).toBeNull();

    const both = await reports(`?userId=${tag}-ann&quizId=${quizA}`);
    expect(both.status).toBe(400);
    expect(await errorCode(both)).toBe("invalid_filter");
    expect((await reports("?userId=../x")).status).toBe(400);
  });

  it("is for admins only", async () => {
    expect((await reports("", null)).status).toBe(401);
    expect((await reports("", "uid:plain")).status).toBe(403);
    expect((await statsRoute(request("/api/admin/stats", "GET", "uid:plain"))).status).toBe(403);
    expect((await statsRoute(request("/api/admin/stats", "GET"))).status).toBe(401);
  });

  it("counts for the dashboard from aggregations, and lists the latest few", async () => {
    const { tag } = await seedResults();
    const data = (await (await statsRoute(request("/api/admin/stats", "GET", ADMIN))).json()) as DashboardData;

    expect(data.totals.users).toBe((await db.collection("users").count().get()).data().count);
    // Quizzes in the trash are not counted.
    const inUse = (await db.collection("quizzes").select("deletedAt").get()).docs.filter((d) => !d.get("deletedAt"));
    expect(data.totals.quizzes).toBe(inUse.length);
    expect(data.totals.attempts).toBe((await db.collection("responses").count().get()).data().count);
    const scores = (await db.collection("responses").get()).docs.map((d) => d.data().score).filter((x) => typeof x === "number");
    expect(data.totals.averageScore).toBe(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));

    expect(data.recent.length).toBeLessThanOrEqual(50);
    expect(data.recent.slice(0, 5).map((r) => r.id)).toEqual([4, 3, 2, 1, 0].map((i) => `${tag}-r${i}`));
    expect(data.recentQuizzes.length).toBeLessThanOrEqual(5);
  });
});

describe.skipIf(!emulator)("migrating legacy questions", () => {
  async function legacyQuiz(extra: Record<string, unknown> = {}) {
    const id = unique("mig");
    await db.doc(`quizzes/${id}`).set({
      title: "Legacy",
      availableDifficulties: ["easy", "medium", "hard"],
      createdAt: Timestamp.now(),
      ...extra,
    });
    await db.doc(`quizzes/${id}/questions/n1`).set({ text: "Shared", options: ["x", "y"], correctIndex: 1 });
    await db.doc(`quizzes/${id}/questions/h1`).set({ text: "Hard only", options: ["x", "y"], correctIndex: 0, difficulty: "hard" });
    return id;
  }

  it("reports what it would do and changes nothing without apply", async () => {
    const id = await legacyQuiz();
    const report = await migrateLegacyQuestions(db, { apply: false });
    const mine = report.quizzes.find((r) => r.quizId === id)!;
    expect(mine).toMatchObject({ legacyCount: 2, copied: { easy: 1, medium: 1, hard: 2 }, applied: false });
    expect((await db.collection(`quizzes/${id}/questions`).get()).size).toBe(2);
    expect((await db.collection(`quizzes/${id}/questions_easy`).get()).empty).toBe(true);
  });

  it("copies into the level collections, then removes the old ones, and is safe to run twice", async () => {
    const id = await legacyQuiz();
    const withOwn = await legacyQuiz();
    await db.doc(`quizzes/${withOwn}/questions_hard/own`).set({ text: "Own hard", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] });

    await migrateLegacyQuestions(db, { apply: true });

    expect((await db.collection(`quizzes/${id}/questions`).get()).empty).toBe(true);
    const hard = await db.collection(`quizzes/${id}/questions_hard`).get();
    expect(hard.docs.map((d) => d.id).sort()).toEqual(["h1", "n1"]);
    expect(hard.docs.find((d) => d.id === "n1")!.data()).toMatchObject({
      text: "Shared",
      options: [{ text: "x", isCorrect: false }, { text: "y", isCorrect: true }],
      type: "single",
    });
    expect((await db.collection(`quizzes/${id}/questions_easy`).get()).docs.map((d) => d.id)).toEqual(["n1"]);
    expect((await db.doc(`quizzes/${id}`).get()).data()!.questionCountByDifficulty).toEqual({ easy: 1, medium: 1, hard: 2 });

    // A level that already had its own questions keeps exactly those.
    expect((await db.collection(`quizzes/${withOwn}/questions_hard`).get()).docs.map((d) => d.id)).toEqual(["own"]);
    expect((await db.collection(`quizzes/${withOwn}/questions`).get()).empty).toBe(true);

    const again = await migrateLegacyQuestions(db, { apply: true });
    expect(again.quizzes.find((r) => r.quizId === id)).toBeUndefined();
  });
});

describe.skipIf(!emulator)("backfilling answer sheets", () => {
  const seedOld = async (id: string, answers: Record<string, Record<string, unknown>>, extra: object = {}) => {
    await db.doc(`responses/${id}`).set({ quizId: "q", userId: "u", score: 50, answeredCount: Object.keys(answers).length, ...extra });
    for (const [questionId, data] of Object.entries(answers)) {
      await db.doc(`responses/${id}/answers/${questionId}`).set({ questionId, ...data });
    }
  };

  it("builds a sheet from the old answer documents, leaves new results alone and changes nothing on a dry run", async () => {
    const old = unique("old");
    const fresh = unique("fresh");
    const none = unique("none");
    const lost = unique("lost");
    await seedOld(old, { a: { selectedIndex: 2, isCorrect: true }, b: { selectedIndex: 0, isCorrect: false } });
    await db.doc(`responses/${fresh}`).set({ quizId: "q", userId: "u", schemaVersion: 2, sheet: { a: { p: [1], ok: true } }, answeredCount: 1 });
    await seedOld(none, {}, { answeredCount: 0 });
    await db.doc(`responses/${lost}`).set({ quizId: "q", userId: "u", answeredCount: 3 }); // answered, but nothing to read

    const dry = await backfillSheets(db, { apply: false });
    expect(dry).toMatchObject({ applied: false });
    expect(dry.built).toBeGreaterThanOrEqual(2);
    expect((await db.doc(`responses/${old}`).get()).data()!.sheet).toBeUndefined();

    const report = await backfillSheets(db, { apply: true });
    expect(report.unreadable).toBeGreaterThanOrEqual(1);
    expect((await db.doc(`responses/${old}`).get()).data()).toMatchObject({
      schemaVersion: 2,
      sheet: { a: { p: [2], ok: true }, b: { p: [0], ok: false } },
    });
    expect((await db.doc(`responses/${none}`).get()).data()).toMatchObject({ schemaVersion: 2, sheet: {} });
    expect((await db.doc(`responses/${fresh}`).get()).data()!.sheet).toEqual({ a: { p: [1], ok: true } });
    expect((await db.doc(`responses/${lost}`).get()).data()!.sheet).toBeUndefined();
    // The old documents stay where they are.
    expect((await db.doc(`responses/${old}/answers/a`).get()).exists).toBe(true);

    // Running again finds nothing more to build for these.
    const again = await backfillSheets(db, { apply: true });
    expect(again.built).toBe(0);
  });
});
