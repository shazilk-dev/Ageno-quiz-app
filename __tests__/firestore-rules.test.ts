// Tests for firestore.rules, run in the Firestore emulator. The browser has no business in Firestore any more
// (everything goes through the server routes), so the rules deny every read and write to everyone:
//   npx firebase emulators:exec --only firestore --project demo-ageno-rules "npx vitest run __tests__/firestore-rules.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
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
import { afterAll, beforeAll, describe, it } from "vitest";

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
      await setDoc(doc(db, "attempts/someAttempt"), { userId: "alice", questions: [{ correctIndex: 1 }] });
      await setDoc(doc(db, "settings/appSettings"), { x: 1 });
      await setDoc(doc(db, "userActivities/a0"), { userId: "alice", type: "login" });
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  const guest = () => env.unauthenticatedContext().firestore();
  const alice = () => env.authenticatedContext("alice").firestore();
  const adminClaim = () => env.authenticatedContext("claimAdmin", { role: "admin" }).firestore();
  const adminDoc = () => env.authenticatedContext("adminDoc").firestore();

  describe.each([
    ["someone who isn't signed in", guest],
    ["a signed-in player", alice],
    ["an admin by role claim", adminClaim],
    ["an admin by profile role", adminDoc],
  ])("%s", (_name, ctx) => {
    it("can read nothing, not even their own profile, results or activity", async () => {
      await assertFails(getDoc(doc(ctx(), "quizzes/q1")));
      await assertFails(getDocs(collection(ctx(), "quizzes")));
      await assertFails(getDoc(doc(ctx(), "quizzes/q1/questions_easy/a")));
      await assertFails(getDocs(collection(ctx(), "quizzes/q1/questions")));
      await assertFails(getDoc(doc(ctx(), "users/alice")));
      await assertFails(getDoc(doc(ctx(), "users/adminDoc")));
      await assertFails(getDocs(collection(ctx(), "users")));
      await assertFails(getDoc(doc(ctx(), "responses/aliceAttempt")));
      await assertFails(getDocs(query(collection(ctx(), "responses"), where("userId", "==", "alice"))));
      await assertFails(getDoc(doc(ctx(), "responses/aliceAttempt/answers/a")));
      await assertFails(getDoc(doc(ctx(), "attempts/someAttempt")));
      await assertFails(getDoc(doc(ctx(), "settings/appSettings")));
      await assertFails(getDoc(doc(ctx(), "userActivities/a0")));
    });

    it("can write nothing: no scores, quizzes, roles, profiles or log entries", async () => {
      await assertFails(
        setDoc(doc(ctx(), "responses/forged"), { quizId: "q1", userId: "alice", score: 100, submittedAt: Timestamp.now() })
      );
      await assertFails(updateDoc(doc(ctx(), "responses/aliceAttempt"), { score: 100 }));
      await assertFails(deleteDoc(doc(ctx(), "responses/aliceAttempt")));
      await assertFails(updateDoc(doc(ctx(), "attempts/someAttempt"), { deadline: 0 }));
      await assertFails(setDoc(doc(ctx(), "quizzes/evil"), { title: "x" }));
      await assertFails(updateDoc(doc(ctx(), "quizzes/q1/questions_easy/a"), { correctIndex: 0 }));
      await assertFails(deleteDoc(doc(ctx(), "quizzes/q1")));
      await assertFails(setDoc(doc(ctx(), "users/carol"), { role: "user", email: "carol@example.com" }));
      await assertFails(updateDoc(doc(ctx(), "users/alice"), { displayName: "A", updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(ctx(), "users/alice"), { role: "admin" }));
      await assertFails(deleteDoc(doc(ctx(), "users/bob")));
      await assertFails(updateDoc(doc(ctx(), "settings/appSettings"), { x: 2 }));
      await assertFails(setDoc(doc(ctx(), "userActivities/a1"), { userId: "alice", type: "login" }));
    });
  });
});
