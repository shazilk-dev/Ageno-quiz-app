// Integration tests for the admin side of the data layer: the quiz routes (list, open, create, save,
// delete), user deletion, the admin guard, the registration route that used to let anyone become an admin,
// and the legacy-question migration. They run the real route handlers against the Firestore emulator:
//   npx firebase emulators:exec --only firestore --project demo-ageno-admin "npx vitest run __tests__/admin-api.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import { describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  claims: {} as Record<string, unknown>,
  deleted: [] as string[],
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
      deleteUser: async (uid: string) => {
        if (uid.startsWith("ghost")) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" });
        authState.deleted.push(uid);
      },
    },
  };
});

import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { POST as registerRoute } from "@/app/api/auth/user/route";
import { DELETE as deleteQuizRoute, GET as getQuizRoute, PUT as putQuizRoute } from "@/app/api/admin/quizzes/[quizId]/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/admin/quizzes/route";
import { GET as reportsRoute } from "@/app/api/admin/reports/route";
import { GET as statsRoute } from "@/app/api/admin/stats/route";
import { DELETE as deleteUserRoute } from "@/app/api/admin/users/[uid]/route";
import { POST as startRoute } from "@/app/api/attempts/start/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { GET as publicQuizRoute } from "@/app/api/quizzes/[quizId]/route";
import { GET as publicListRoute } from "@/app/api/quizzes/route";
import { migrateLegacyQuestions } from "@/lib/server/legacy-questions";
import type { DashboardData, ReportsPage } from "@/lib/admin-types";
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
      deleteUserRoute(request("/api/admin/users/x", "DELETE", token ?? undefined), { params: Promise.resolve({ uid: "x" }) }),
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
      input({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [{ text: "No key", options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }] } } }),
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

  it("refuses a save that needs more writes than one transaction holds, and changes nothing", async () => {
    const { id } = await createOk({ title: "Small" });
    const body = asInput(await open(id));
    body.levels = bigLevels();
    const response = await save(id, body);
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("too_many_changes");
    const after = await open(id);
    expect(after.title).toBe("Small");
    expect(after.levels.easy?.questions).toHaveLength(2);
    expect(after.levels.medium).toBeUndefined();
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
    body.levels.easy!.questions.push({ text: "Three", options: [{ text: "x", isCorrect: true }, { text: "y", isCorrect: false }] });
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

    const list = (await (await listRoute(request("/api/admin/quizzes", "GET", ADMIN))).json()) as { quizzes: AdminQuizSummary[] };
    expect(list.quizzes.find((row) => row.id === id)?.responseCount).toBe(3);

    const response = await remove(id);
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
    expect(data.totals.quizzes).toBe((await db.collection("quizzes").count().get()).data().count);
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
