// Tests for firestore.rules, run in the Firestore emulator. They check both what the app needs to keep
// working and what a hostile browser must not be able to do:
//   npx firebase emulators:exec --only firestore --project demo-ageno-rules "npx vitest run __tests__/firestore-rules.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const [host, port] = (emulatorHost ?? "127.0.0.1:8181").split(":");

describe.skipIf(!emulatorHost)("firestore.rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-ageno-rules",
      firestore: {
        rules: fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8"),
        host,
        port: Number(port),
      },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "quizzes/q1"), { title: "Q", accessCode: "SECRET1", isPublic: true });
      await setDoc(doc(db, "quizzes/q1/questions_easy/a"), { text: "?", options: [], correctIndex: 1 });
      await setDoc(doc(db, "quizzes/q1/questions/legacy"), { text: "?", correctIndex: 0 });
      await setDoc(doc(db, "users/alice"), { role: "user", displayName: "Alice", email: "alice@example.com" });
      await setDoc(doc(db, "users/bob"), { role: "user", displayName: "Bob", email: "bob@example.com" });
      await setDoc(doc(db, "users/adminDoc"), { role: "admin" });
      await setDoc(doc(db, "responses/aliceAttempt"), { quizId: "q1", userId: "alice", score: 80 });
      await setDoc(doc(db, "responses/aliceAttempt/answers/a"), { questionId: "a", selectedIndex: 1, isCorrect: true });
      await setDoc(doc(db, "responses/bobAttempt"), { quizId: "q1", userId: "bob", score: 90 });
      await setDoc(doc(db, "responses/bobAttempt/answers/a"), { questionId: "a", selectedIndex: 0, isCorrect: false });
      await setDoc(doc(db, "attempts/someAttempt"), { userId: "alice", questions: [{ correctIndex: 1 }] });
      await setDoc(doc(db, "settings/appSettings"), { x: 1 });
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  const guest = () => env.unauthenticatedContext().firestore();
  const alice = () => env.authenticatedContext("alice").firestore();
  const adminClaim = () => env.authenticatedContext("claimAdmin", { role: "admin" }).firestore();
  const adminDoc = () => env.authenticatedContext("adminDoc").firestore();

  describe("someone who isn't signed in", () => {
    it("can read nothing", async () => {
      await assertFails(getDoc(doc(guest(), "quizzes/q1")));
      await assertFails(getDocs(collection(guest(), "quizzes")));
      await assertFails(getDoc(doc(guest(), "quizzes/q1/questions_easy/a")));
      await assertFails(getDoc(doc(guest(), "users/alice")));
      await assertFails(getDoc(doc(guest(), "responses/aliceAttempt")));
      await assertFails(getDocs(collection(guest(), "responses")));
      await assertFails(getDoc(doc(guest(), "settings/appSettings")));
    });

    it("can write nothing", async () => {
      await assertFails(setDoc(doc(guest(), "responses/forged"), { quizId: "q1", userId: "anonymous", score: 100 }));
      await assertFails(setDoc(doc(guest(), "quizzes/evil"), { title: "x" }));
      await assertFails(setDoc(doc(guest(), "users/ghost"), { role: "user" }));
    });
  });

  describe("a signed-in player", () => {
    it("can't read quizzes or the answer key, so nothing leaks without going through the server", async () => {
      await assertFails(getDoc(doc(alice(), "quizzes/q1")));
      await assertFails(getDocs(collection(alice(), "quizzes")));
      await assertFails(getDoc(doc(alice(), "quizzes/q1/questions_easy/a")));
      await assertFails(getDocs(collection(alice(), "quizzes/q1/questions")));
    });

    it("can't read other people's profiles (emails) or results", async () => {
      await assertFails(getDoc(doc(alice(), "users/bob")));
      await assertFails(getDocs(collection(alice(), "users")));
      await assertFails(getDoc(doc(alice(), "responses/bobAttempt")));
      await assertFails(getDocs(collection(alice(), "responses")));
      await assertFails(getDoc(doc(alice(), "responses/bobAttempt/answers/a")));
    });

    it("can read their own profile, results and answers", async () => {
      await assertSucceeds(getDoc(doc(alice(), "users/alice")));
      await assertSucceeds(getDoc(doc(alice(), "responses/aliceAttempt")));
      await assertSucceeds(
        getDocs(query(collection(alice(), "responses"), where("userId", "==", "alice")))
      );
      await assertSucceeds(getDoc(doc(alice(), "responses/aliceAttempt/answers/a")));
    });

    it("can't create, change or delete a result, so no score can come from a browser", async () => {
      await assertFails(
        setDoc(doc(alice(), "responses/forged"), {
          quizId: "q1",
          userId: "alice",
          score: 100,
          submittedAt: Timestamp.now(),
        })
      );
      await assertFails(updateDoc(doc(alice(), "responses/aliceAttempt"), { score: 100 }));
      await assertFails(deleteDoc(doc(alice(), "responses/aliceAttempt")));
      await assertFails(
        setDoc(doc(alice(), "responses/aliceAttempt/answers/b"), { questionId: "b", isCorrect: true })
      );
      await assertFails(updateDoc(doc(alice(), "responses/bobAttempt"), { score: 0 }));
      await assertFails(deleteDoc(doc(alice(), "responses/bobAttempt")));
    });

    it("can't touch attempts, which hold the answer key and the clock", async () => {
      await assertFails(getDoc(doc(alice(), "attempts/someAttempt")));
      await assertFails(updateDoc(doc(alice(), "attempts/someAttempt"), { deadline: 0 }));
      await assertFails(setDoc(doc(alice(), "attempts/mine"), { userId: "alice" }));
    });

    it("can't create or edit quizzes, questions or settings", async () => {
      await assertFails(setDoc(doc(alice(), "quizzes/evil"), { title: "x" }));
      await assertFails(updateDoc(doc(alice(), "quizzes/q1"), { title: "x" }));
      await assertFails(deleteDoc(doc(alice(), "quizzes/q1")));
      await assertFails(updateDoc(doc(alice(), "quizzes/q1/questions_easy/a"), { correctIndex: 0 }));
      await assertFails(getDoc(doc(alice(), "settings/appSettings")));
      await assertFails(updateDoc(doc(alice(), "settings/appSettings"), { x: 2 }));
    });

    it("can register, and edit their profile but not their role", async () => {
      const carol = env.authenticatedContext("carol").firestore();
      await assertSucceeds(
        setDoc(doc(carol, "users/carol"), {
          role: "user",
          email: "carol@example.com",
          customClaims: { role: "user" },
          activityLogs: [],
        })
      );
      await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { displayName: "A", updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(alice(), "users/alice"), { role: "admin" }));
      await assertFails(updateDoc(doc(alice(), "users/alice"), { customClaims: { role: "admin" } }));
      await assertFails(updateDoc(doc(alice(), "users/bob"), { displayName: "x" }));
    });

    it("can't register as an admin, or register someone else", async () => {
      await assertFails(setDoc(doc(env.authenticatedContext("dave").firestore(), "users/dave"), { role: "admin" }));
      await assertFails(
        setDoc(doc(env.authenticatedContext("erin").firestore(), "users/erin"), {
          role: "user",
          customClaims: { role: "admin" },
        })
      );
      await assertFails(setDoc(doc(env.authenticatedContext("frank").firestore(), "users/zed"), { role: "user" }));
    });

    it("can log their own activity and no one else's", async () => {
      await assertSucceeds(setDoc(doc(alice(), "userActivities/a1"), { userId: "alice", type: "login" }));
      await assertFails(setDoc(doc(alice(), "userActivities/a2"), { userId: "bob", type: "login" }));
    });
  });

  describe.each([
    ["an admin by role claim", adminClaim],
    ["an admin by profile role", adminDoc],
  ])("%s", (_name, ctx) => {
    it("manages quizzes and questions", async () => {
      await assertSucceeds(setDoc(doc(ctx(), "quizzes/admin-made"), { title: "New" }));
      await assertSucceeds(getDoc(doc(ctx(), "quizzes/q1")));
      await assertSucceeds(setDoc(doc(ctx(), "quizzes/admin-made/questions_hard/z"), { text: "?" }));
      await assertSucceeds(getDocs(collection(ctx(), "quizzes/q1/questions_easy")));
      await assertSucceeds(updateDoc(doc(ctx(), "quizzes/admin-made"), { title: "Edited" }));
      await assertSucceeds(deleteDoc(doc(ctx(), "quizzes/admin-made/questions_hard/z")));
      await assertSucceeds(deleteDoc(doc(ctx(), "quizzes/admin-made")));
    });

    it("reads users and results for the admin screens", async () => {
      await assertSucceeds(getDocs(collection(ctx(), "users")));
      await assertSucceeds(getDocs(collection(ctx(), "responses")));
      await assertSucceeds(getDoc(doc(ctx(), "responses/bobAttempt/answers/a")));
    });

    it("manages users and settings", async () => {
      await assertSucceeds(updateDoc(doc(ctx(), "users/bob"), { displayName: "Robert" }));
      await assertSucceeds(updateDoc(doc(ctx(), "settings/appSettings"), { x: 2 }));
      await assertSucceeds(getDoc(doc(ctx(), "settings/appSettings")));
    });

    it("still can't write a result or open an attempt (those are the server's)", async () => {
      await assertFails(setDoc(doc(ctx(), "responses/adminForged"), { quizId: "q1", userId: "x", score: 100 }));
      await assertFails(updateDoc(doc(ctx(), "responses/aliceAttempt"), { score: 100 }));
      await assertFails(getDoc(doc(ctx(), "attempts/someAttempt")));
    });
  });

  it("an admin can delete a result (clean-up) and a user profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "responses/toDelete"), { quizId: "q1", userId: "alice", score: 1 });
      await setDoc(doc(ctx.firestore(), "users/toDelete"), { role: "user" });
    });
    await assertSucceeds(deleteDoc(doc(adminClaim(), "responses/toDelete")));
    await assertSucceeds(deleteDoc(doc(adminClaim(), "users/toDelete")));
    expect(true).toBe(true);
  });
});
