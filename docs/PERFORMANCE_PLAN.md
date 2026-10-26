# Ageno Quiz Performance Plan

**Purpose:** make sign-in, sign-up and every data screen (join, quiz lobby, starting a quiz, My quizzes, leaderboard, admin) feel instant. This file covers the audit (what is slow and why), the target architecture, and a phased plan that later sessions can follow the same way they follow `IMPROVEMENT_ROADMAP.md`.

- **Created:** 2026-10-26 (audit of branch `phase-7-polish` at `a458877`)
- **Status:** S0 and S1 code done (2026-10-26), not deployed yet. **Next:** you do `docs/MANUAL_STEPS.md` (confirm region, Speed Insights, deploy, checks), then S2.
- **Decisions (2026-10-26, user):** the recommended approach and the recommended answers in section 5 (sign-out is this device only plus "Sign out of all devices"; region `fra1`; cache until an admin edit, leaderboard up to 30 s stale).
- **Manual steps for the user** are in `docs/MANUAL_STEPS.md`.
- **Replaces:** the short "speed plan" note in the roadmap's Session 7 and 8 logs.

---

## 1. The short version

The app isn't slow because one query is slow. It's slow because **every screen waits on a long chain of network trips, one after another, and most of those trips cross the Atlantic.**

There are five root causes, ranked by how much time they cost:

| # | Root cause | Where it hurts | Rough cost per screen |
|---|---|---|---|
| A | **Server and database are on different continents.** Vercel functions run in `iad1` (Washington, the default for new projects; no `vercel.json` sets a region). Firestore is in `eur3` (Europe). Every Firestore read or write from an API route is a transatlantic round trip, about 80–100 ms. | Every API route; sign-in route makes ~5 of them in a row | 0.3–1 s |
| B | **Every data screen renders in the browser, after a waterfall.** HTML → JS bundle → Firebase Auth restores the user from IndexedDB → token → `fetch` → server verifies → Firestore → render. Nothing starts until the step before finishes, even though the server already has the `session` cookie on the very first request. | Join, lobby, My quizzes, leaderboard, result page, all admin screens | 0.5–1.5 s |
| C | **Sign-in and sign-up do non-essential work in the critical path, sequentially.** Activity logging from the browser (Firestore read + write, which also forces the Firestore SDK to load and open a channel), a forced token refresh, double token verification, an extra `getUser` call. | Sign-in, Google sign-in, sign-up, logout | 1–3 s |
| D | **Nothing is cached on the server.** The public quiz list and lobby hit Firestore on every cache miss (30 s CDN cache only), the lobby runs 1 + 3 `count()` queries even though the quiz doc already stores the counts, the leaderboard re-reads every quiz on each request, and starting a quiz re-reads all its questions. | Join, lobby, start, leaderboard | 0.2–0.6 s |
| E | **Heavy JavaScript on every page.** `AuthProvider` in the root layout imports `auth.actions.ts`, which pulls in the Firestore client SDK and the whole of Firebase Auth (MFA, phone, reCAPTCHA, TOTP) on every page, including the landing page. `next.config.mjs` also polyfills Node core modules into the client bundle. | First load of any page, especially on mobile | 0.3–1 s on mid-range phones |

Add **cold starts** on top of all of this: the Firestore Admin SDK uses gRPC by default, which is slow to start in a serverless function, so the first request after an idle period can take 1–3 s more.

**Recommended approach:** fix the plumbing first (region, cold start, sign-in chain; one session, biggest win for the least risk), then move data loading to the server with tag-based caching, then trim the bundle, then denormalise the few aggregates that are computed on every request. Details in section 4.

---

## 2. Audit findings

File and line references are from `a458877` and will drift.

### 2.1 Infrastructure

- **F1 Region mismatch.** No `vercel.json`, so functions run in `iad1`. Firestore is `eur3` (multi-region Europe: Belgium + Netherlands). Every server-side Firestore call pays a transatlantic round trip. The sign-in route alone does verify → user doc read → `getUser` → `createSessionCookie` in sequence. Users are likely in South Asia, for whom Europe is also closer than the US East Coast.
- **F2 gRPC cold start.** `firebase/admin.ts` uses `getFirestore()` with default settings. In serverless, loading gRPC is the main cold-start cost of the Admin SDK. `preferRest: true` makes it use REST until an operation actually needs gRPC (streaming listeners, which this app doesn't use on the server).
- **F3 Fire-and-forget writes that can be dropped.** `app/api/auth/session/route.ts:49-75` and `:90-95` start writes (`lastLoginAt`, new user doc, custom claims) without awaiting them. On serverless, work still running after the response is sent may be frozen or killed, so these can silently never happen. Next 15 has `after()` from `next/server` for exactly this. (This is a correctness bug as well as a speed one: a new Google user's profile doc can fail to exist.)
- **F4 No measurement.** No `Server-Timing` headers, no Speed Insights, no logged durations. We can't currently prove which step is slow in production.

### 2.2 Sign-in, sign-up, session

Email sign-in today (`contexts/auth-context.tsx:207` → `lib/actions/auth.actions.ts:146` → `lib/actions/session.actions.ts:13` → `app/api/auth/session/route.ts`):

```
browser  signInWithEmailAndPassword             Google Auth            ~1-2 RTT
browser  logActivityInUserDocument  (awaited)   Firestore getDoc       loads Firestore SDK + opens channel
browser                             (awaited)   Firestore updateDoc
browser  getIdToken(true)  (forced refresh)     Google securetoken     1 RTT, unnecessary: token is seconds old
server   verifyIdToken(token, checkRevoked)     Google Auth (getUser)  iad1 -> Google
server   users/{uid}.get()                      Firestore eur3         transatlantic
server   auth.getUser(uid)  (again)             Google Auth            duplicate of the revocation check
server   createSessionCookie                    Google Auth
browser  router.replace -> next page starts its own waterfall (section 2.3)
```

- **F5** `logActivityInUserDocument` (`auth.actions.ts:441`) is **awaited** on sign-in, sign-up, sign-out, profile changes, and reads the whole user doc first just to check it exists. It also makes the browser download and start the Firestore SDK during sign-in. It's an audit log: it should be written by the server, after the response, not by the browser before navigation.
- **F6** `createSession` forces `getIdToken(true)` (`session.actions.ts:18`) right after sign-in, when the token is brand new.
- **F7** The session route verifies with `checkRevoked: true` (an Auth API call) and then calls `auth.getUser` again for the claims (`route.ts:22`, `:85`). The decoded token already contains `role`; only set claims when `decoded.role !== userRole`.
- **F8** Sign-up runs `createUser` → `updateProfile` → `POST /api/auth/user` → `sendEmailVerification` → activity log, all sequential (`auth.actions.ts:82-143`), and still has a client-side Firestore fallback that the final rules forbid anyway. `sendEmailVerification` and the profile write can run in parallel; the log belongs on the server.
- **F9** `GET /api/auth/session/check` verifies the session cookie **twice** (once without and once with revocation, `check/route.ts:63-68`) and then reads the user doc with a hand-rolled 5 s timeout. One verify is enough.
- **F10** Every signed-out visitor, on every page load, calls `/api/auth/session/check` (`auth-context.tsx:160`) to "double-check" the server. That's a function invocation and a round trip for each anonymous page view, including the landing page.
- **F11** Logout revokes refresh tokens on **all devices** (`route.ts:198-203`), which is slow (verify + revoke) and surprising: signing out on a phone signs you out on your laptop. Industry default is to clear the cookie and revoke only on "Sign out everywhere" or a security event. (Behaviour change: needs your decision.)
- **F12** The header and every page that uses `useAuth()` render the signed-out state while Firebase restores the user client-side, even though the server knew who it was from the cookie. That causes a flash and delays anything gated on `user` (My quizzes doesn't start fetching until `user` arrives: `my-quizzes/page.tsx:51`).
- **F13** Artificial waits: `verify-email` reloads after a 3 s timer (`verify-email/page.tsx:37`), sign-up redirects after 4 s (`sign-up/page.tsx:65`).
- **F14** `hooks/useAuth.ts` (842 lines, SWR session polling) is only used by the dev page `useauth-test`. Dead weight and confusing; delete with the dev page or move it there.

### 2.3 Player data screens

- **F15 Join page** (`app/(quiz)/join/page.tsx`) is a client component that fetches `/api/quizzes` after hydration. The list is public and the same for everyone, so it can be rendered on the server (or statically) and shipped in the HTML.
- **F16 Quiz lobby** (`app/(quiz)/q/[id]/page.tsx` → `client.tsx` → `hooks/useQuizLoader.ts`) is the same pattern: the page is a server component that renders nothing but a skeleton, then the browser fetches `/api/quizzes/<id>`.
- **F17 Lobby counts.** `countQuestions` (`lib/server/quizzes.ts:17`) awaits a legacy `count()` and **then** runs one `count()` per level: two sequential round trips, four queries, on every lobby load. The quiz doc already stores `questionCountByDifficulty` (written by every admin save and the migration, `admin-quizzes.ts:227`); the admin list uses it, the public lobby doesn't.
- **F18 Quiz list reads everything.** `listPublicQuizzes` (`quizzes.ts:39`) reads every quiz document in full (no `select`, no `where`) and filters in memory. The leaderboard calls it on every request too (`leaderboard.ts:76`).
- **F19 Access codes.** `resolveQuizId` (`quizzes.ts:73`) can run up to three queries **one after another** (as typed, upper, lower). One `where("accessCode", "in", [...])` does it in one trip.
- **F20 Starting a quiz** (`lib/server/attempts.ts:204`): token verify → quiz read → (questions + previous attempts) → batch write: three sequential Firestore trips across the Atlantic plus a full read of the question subcollection every time. Question sets change only when an admin saves.
- **F21 Leaderboard is recomputed per request, and is subtly wrong.** It reads the top 100 `responses` by score and the client builds the "overall" board (sum of each person's best per quiz) from those 100 rows (`lib/leaderboard.ts`). With more than 100 results, people's totals are computed from an incomplete set. It also clears to a skeleton on every filter change (`leaderboard/page.tsx:50`) instead of keeping the old board visible.
- **F22 No client cache between screens.** Leaving My quizzes and coming back refetches and shows skeletons again. SWR is already a dependency but no data screen uses it.
- **F23 Autosave** runs a Firestore transaction every 2 s of activity (`useQuizAttempt.ts:31`, `attempts.ts:341`). Fine for correctness; each one is ~3 transatlantic trips today, which F1 fixes. No change needed beyond the region.

### 2.4 Admin

- **F24** Admin screens are client components that fetch after the server layout has already verified the admin. The page could fetch on the server in the same request.
- **F25** `requireAdmin` does `verifyIdToken(token, true)` (an Auth API call) **plus** a `users` doc read when the claim is missing, on every admin request. The revocation check is right for admin writes; for admin reads, a short-lived ID token is already a strong guarantee.
- **F26** `listAdminQuizzes` (`admin-quizzes.ts:78`) runs a `responses` `count()` per quiz, plus up to three question `count()`s per quiz with no stored counts: 1 + N×(1..4) queries. A `responseCount` counter on the quiz doc (incremented in the submit transaction) makes it one query.
- **F27** The dashboard and reports are already good (aggregation queries, `select`, batched name lookups, paging). Keep them.

### 2.5 Bundle and rendering

- **F28** `app/layout.tsx` wraps everything in `AuthProvider` → `auth-context.tsx` → `auth.actions.ts`, which imports `firebase/firestore` and all MFA/phone/TOTP/reCAPTCHA code. So every page ships Firestore and full Auth, though only the profile page needs MFA and nothing on a public page needs Firestore.
- **F29** `next.config.mjs` adds Node polyfills (`crypto-browserify`, `buffer`, `stream-browserify`, …) and a `ProvidePlugin` for `process`/`Buffer` to every client bundle. They date from an older setup; Firebase's browser SDK doesn't need them. Verify with the bundle analyzer and remove what nothing uses.
- **F30** No `loading.tsx` in any route group, so a navigation to a server-rendered route shows nothing until it's ready (once screens become server-rendered this matters).
- **F31** `images.domains` is deprecated in Next 15; use `images.remotePatterns` (housekeeping, same change set).

**Measured** (`npm run build`, 2026-10-26, First Load JS, gzip):

| Route | First Load JS |
|---|---|
| Framework baseline (`/_not-found`, no app code) | 104 kB |
| `/` landing page (static marketing content) | 242 kB |
| `/join`, `/leaderboard` | 245 kB |
| `/my-quizzes`, `/my-quizzes/[attemptId]` | 250–251 kB |
| `/q/[id]` lobby + exam | 261 kB |
| Admin screens | 241–248 kB |

About **135 kB of every page is the same app-wide code**, mostly Firebase (Auth with MFA, Firestore) pulled in by `AuthProvider` in the root layout. The landing page shows no user data yet pays the full cost.

---

## 3. Target architecture (what "production grade" looks like here)

1. **Compute next to data.** Functions in `fra1` (Frankfurt) or `cdg1` (Paris), a few ms from `eur3`. One trip to the database costs ~5 ms instead of ~90 ms.
2. **Render data on the server, stream the rest.** Pages are server components that read data directly through `lib/server/*` (no HTTP hop to our own API) and stream it inside `<Suspense>` with the existing skeletons as fallbacks. Interactive parts (filters, the exam, forms) stay as client islands that receive the data as props.
3. **Know who is signed in on the server.** A small `getSessionUser()` helper verifies the `session` cookie **without** the revocation check (a local signature check with cached Google keys, no network) for reads, and **with** it for anything sensitive (admin, writes). The server passes the user to `AuthProvider` as initial state, so the header is right on the first paint.
4. **Cache public data, invalidate on write.** The quiz list, a quiz's public shape and counts, and question sets are cached with `unstable_cache` (Next 15's stable API; `"use cache"` is still experimental) under tags such as `quizzes`, `quiz:<id>`, `questions:<id>:<level>`. Admin create/save/delete calls `revalidateTag` for those tags. Readers never wait on Firestore for data that hasn't changed; edits show up on the next request.
5. **Precompute what is read often.** Leaderboard entries (best score per person per quiz, and per-person totals) and per-quiz response counts are written inside the submit transaction, so reads are one small indexed query.
6. **Keep the critical path minimal.** Sign-in does only: authenticate → mint session cookie → navigate. Logging, `lastLoginAt` and claim syncing run in `after()` on the server.
7. **Ship less JavaScript.** Public pages load Firebase Auth core only. MFA and profile code load when the profile page opens. The browser doesn't load the Firestore SDK at all.
8. **Client cache for navigation.** Data that's fetched in the browser (filter changes, refreshes) goes through SWR with `keepPreviousData`, so going back to a screen is instant and filters never blank the page.
9. **Measure continuously.** `Server-Timing` on API routes, Vercel Speed Insights for real-user Core Web Vitals, budgets checked before each phase is closed.

### Performance budgets (done when these hold in production, p75)

| Metric | Target |
|---|---|
| API route, warm, server time | < 150 ms (most < 50 ms) |
| Sign-in click → destination page usable | < 1.5 s |
| Join / lobby LCP (4G mobile) | < 2.0 s, list visible in first HTML |
| My quizzes / leaderboard: data visible after navigation | < 600 ms |
| Start quiz click → first question | < 800 ms |
| First Load JS, public pages | under 170 kB gzip (today 242–261 kB) |
| INP | < 200 ms |

---

## 4. Phased plan

Each phase is independently shippable and leaves the app working. Same rules as the roadmap: read files before editing, `npx tsc --noEmit` + `npm run lint` after each task, the relevant tests, and `npm run build` at the end of each phase. Task IDs are `S<phase>.<n>`.

### Phase S0: Measure (short, do it first)

- [x] **S0.1** Add a tiny `lib/server/timing.ts` helper that records named spans and writes a `Server-Timing` header (`auth;dur=12, db;dur=40`). Use it in the session route, `/api/quizzes*`, attempts start/submit, leaderboard and my-attempts. Visible in the browser's Network tab, no third-party service. *Done: `lib/server/timing.ts` (`ServerTiming`), on the session route (`verify`, `session`) and every player route (`auth`, `db`). Admin routes not yet.*
- [ ] **S0.2** Add `@vercel/speed-insights` to the root layout (real-user LCP/INP/TTFB per route). *Code done (`@vercel/speed-insights@2.0.0`, `<SpeedInsights />` in `app/layout.tsx`); it must also be enabled in the Vercel dashboard (manual step 4).*
- [ ] **S0.3** (Manual steps 1, 6 and 7.) Record a baseline in this file: for each screen in the budgets table, the current number from production (Network tab with "Disable cache", once cold and once warm).

**Done when:** a baseline table exists here.

### Phase S1: Plumbing and the sign-in path (one session, biggest win)

- [ ] **S1.1 Region.** *`vercel.json` written with `fra1`; the Firestore location (the CLI couldn't reach the project from here), the deployed region and Fluid compute are manual steps 2–3.* Check the Firestore location in the Firebase console (expected `eur3`). Add `vercel.json` with `{"regions": ["fra1"]}` (or set it in Vercel → Settings → Functions). Confirm Fluid compute is on for the project (fewer cold starts). Middleware stays global.
- [x] **S1.2 Cold start.** In `firebase/admin.ts`, create Firestore with `initializeFirestore(app, { preferRest: true })`. *Verified with read-only queries against the real project. The emulator tests can't use REST (it asks Google for credentials even with `FIRESTORE_EMULATOR_HOST`), so their mocks keep the default transport.*
- [x] **S1.3 Session route.** Verify the ID token once (keep `checkRevoked`; it's a sign-in). Read `role` from the decoded token and the user doc in parallel with `createSessionCookie`. Move `lastLoginAt`, new-profile creation and claim syncing into `after()` so they're guaranteed to run but don't delay the response. Write the activity log entry (`login`, method) there too.
- [x] **S1.4 Client sign-in.** Remove the awaited `logActivityInUserDocument` from sign-in, sign-up, sign-out and Google sign-in (the server now logs). Drop the forced `getIdToken(true)` in `createSession`. Remove the client-side Firestore fallbacks for user docs (the rules forbid them). *Also: Google sign-in no longer calls `/api/auth/user` (the session route creates a new person's profile). Profile, email, password and MFA changes still log from the browser, now without waiting and without the read first; S4.3 moves them to the server.*
- [x] **S1.5 Sign-up.** Run `sendEmailVerification` and the profile registration in parallel. The server logs `account_created`.
- [x] **S1.6 Session check.** Verify the cookie once (with revocation) and use the decoded claims; read the user doc only if the caller needs fields that aren't in the token.
- [x] **S1.7 Signed-out visitors.** Stop calling `/api/auth/session/check` on every anonymous page load. Set a non-httpOnly, non-secret `signed_in=1` hint cookie alongside `session`; the client only runs the check when that hint is present but Firebase says nobody is signed in.
- [x] **S1.8 Logout.** (Decided: this device only.) Clear cookies and sign out locally; revoke tokens only from a "Sign out of all devices" action on the profile page.
- [x] **S1.9 Artificial waits.** `verify-email`: reload the user (`user.reload()`) instead of a 3 s page reload. Sign-up: redirect right away (or on a button) instead of after 4 s.

**Done when:** the session route's `Server-Timing` total is under 400 ms warm; sign-in to destination meets the budget; emulator suites, `access-control.test.ts` and the auth manual test plan in `docs/` pass. *Tests pass (see the session log); the production numbers wait for the deploy.*

### Phase S2: Server-side caching of public data

- [ ] **S2.1** `lib/server/quizzes.ts`: `listPublicQuizzes` reads only the public fields with `select(...)` (keep the in-memory `isPublic`/`active` filter: a `!=` query would skip docs missing the field), and is wrapped in `unstable_cache(..., ["public-quizzes"], { tags: ["quizzes"], revalidate: 300 })`.
- [ ] **S2.2** `getPublicQuiz`: use `questionCountByDifficulty` from the quiz doc; fall back to `count()` (in parallel, not after the legacy count) only for quizzes that don't have it. Cache per quiz with tag `quiz:<id>`.
- [ ] **S2.3** `resolveQuizId`: one `in` query for the three spellings.
- [ ] **S2.4** `startAttempt`: load the question set through a cache tagged `questions:<id>:<level>`; read the quiz doc and the previous attempts in parallel. (The attempt still stores its own snapshot of the questions, so a cache can never change a running attempt.)
- [ ] **S2.5** Admin create, save and delete (`lib/server/admin-quizzes.ts` callers in `app/api/admin/quizzes/*`) call `revalidateTag("quizzes")`, `revalidateTag("quiz:<id>")` and the question tags. The legacy migration script prints a reminder to redeploy or hits a revalidate route.
- [ ] **S2.6** Tests: emulator test that a save is visible on the next public read (tags revalidated), and that a hidden or inactive quiz drops out of the list.

**Done when:** a warm `/api/quizzes` and `/api/quizzes/<id>` do no Firestore reads (check `Server-Timing`), and edits appear immediately after an admin save.

### Phase S3: Render data on the server

- [ ] **S3.1** `lib/server/session.ts` `getSessionUser()`: verifies the `session` cookie (no revocation check, for reads), returns `{ uid, role, name, email, emailVerified }` or `null`. Wrapped in React `cache()` so one request verifies once.
- [ ] **S3.2** Root layout passes the session user to `AuthProvider` as `initialUser`; the header renders the right state on the first paint and `loading` starts `false` when the server already knows. Firebase Auth still runs in the background for ID tokens.
- [ ] **S3.3 Join page**: server component fetches the cached list and renders it; search, filter, sort and the code form remain client islands. Static with revalidation via the `quizzes` tag.
- [ ] **S3.4 Lobby**: `q/[id]/page.tsx` fetches the cached public quiz and passes it to `QuizClient` as `initialData`; `useQuizLoader` uses it instead of fetching. Real `notFound()` for missing quizzes (proper 404 status and metadata with the quiz title).
- [ ] **S3.5 My quizzes, result page, leaderboard**: server components call `getMyAttempts(uid)` / `getAttemptResult` / `getLeaderboard` directly and stream them in `<Suspense>`. The `(user)` layout redirects on the server when `getSessionUser()` is `null` (the client redirect becomes a fallback).
- [ ] **S3.6** Leaderboard filter changes stay client-side through SWR with `keepPreviousData` (no blank skeleton between filters), seeded with the server-rendered default board.
- [ ] **S3.7 Admin**: the admin pages fetch their first screen on the server (the layout already verified the admin) and keep client fetching for paging and edits.
- [ ] **S3.8** `loading.tsx` per route group using the existing skeletons.

**Done when:** viewing source of `/join`, `/q/<id>`, `/my-quizzes` shows the data in the HTML; budgets for those screens hold.

### Phase S4: Bundle diet

- [ ] **S4.1** Add `@next/bundle-analyzer` (dev only) and record the per-route First Load JS here.
- [ ] **S4.2** Split `auth.actions.ts`: `auth-core.ts` (sign in/up/out, Google, reset) and `auth-account.ts` (email/password change, MFA, TOTP, phone, reCAPTCHA). The profile page imports the second, loaded with `next/dynamic` where it's a dialog.
- [ ] **S4.3** Move the two remaining browser Firestore uses (profile updates, activity log) to server routes. Then the client bundle has no `firebase/firestore`, and `firestore.rules` can deny the browser everything (simpler, safer; redeploy rules after `firestore-rules.test.ts`).
- [ ] **S4.4** Remove the Node polyfills and `ProvidePlugin` from `next.config.mjs` one by one, rebuilding each time; drop the unused `*-browserify` devDependencies and `webpac`. Switch `images.domains` to `remotePatterns`.
- [ ] **S4.5** Delete `hooks/useAuth.ts` together with the `useauth-test` dev page (or move it under the dev page).

**Done when:** public pages are within the First Load JS budget and the build and all tests pass.

### Phase S5: Precomputed aggregates

- [ ] **S5.1** In the submit transaction, upsert `leaderboard/{quizId}_{uid}` (best score, difficulty, submittedAt, display name snapshot) when the new score beats the old one, and maintain `userTotals/{uid}` (sum of bests). Increment `quizzes/{id}.responseCount`.
- [ ] **S5.2** A one-time backfill script (dry run by default, like `migrate:questions`).
- [ ] **S5.3** `getLeaderboard` reads `leaderboard` (per quiz) or `userTotals` (overall) with one indexed, limited query. This also fixes F21: totals are computed from every result, not the top 100 rows. Week/month boards query `leaderboard` by `submittedAt` (index added to `firestore.indexes.json`).
- [ ] **S5.4** `listAdminQuizzes` uses `responseCount`, with a `count()` fallback only for quizzes without it. Deleting a quiz's results resets it.
- [ ] **S5.5** Display-name changes update the snapshot through `after()` in the profile route (or names are joined in a single batched read, as now).
- [ ] **S5.6** Emulator tests for the submit transaction (best-score logic, exactly-once), the backfill and the new leaderboard.

**Done when:** leaderboard and admin quiz list are one query each, and their numbers match the old computation on the backfilled data.

---

## 5. Decisions needed from you

1. **Logout scope (S1.8).** Today signing out signs you out on every device. Recommended: sign out this device only, plus a "Sign out of all devices" button on the profile page.
2. **Region (S1.1).** Recommended `fra1`. Confirm where most users are; if they're mostly in South Asia, Frankfurt is still the right choice because the database is in Europe and the database trip is the one that repeats.
3. **Cache freshness (S2).** Recommended: public quiz data is cached until an admin edit invalidates it (with a 5-minute safety revalidate). Leaderboard: up to 30 s stale is acceptable.

## 6. Recommended order

| Order | Phase | Size | Why this order |
|---|---|---|---|
| 1 | S0 + S1 | 1 session | Region and cold start speed up *every* request with almost no code; sign-in is the slowest flow you named. Low risk. |
| 2 | S2 | 1 session | Small, server-only change; makes S3's pages cheap to render. |
| 3 | S3 | 1–2 sessions | Biggest perceived change: data in the first HTML, no skeleton flashes. |
| 4 | S4 | 1 session | Faster first load on phones; also removes browser Firestore entirely. |
| 5 | S5 | 1 session | Needed for scale and leaderboard correctness; least urgent at today's data size. |

It is too big for one safe session (it touches auth, caching, rendering and the data model), but S0 + S1 alone should remove most of the slowness you notice today.

## 7. What was considered and not recommended

- **Firestore offline persistence in the browser** (from the Session 7 note): no longer relevant. Since Phase 5 the browser reads nothing from Firestore except its own profile.
- **Moving API routes to the Edge runtime:** `firebase-admin` doesn't run there, and the bottleneck is the distance to the database, not the function runtime.
- **A separate backend or Redis:** Next's data cache plus precomputed Firestore docs covers this app's scale with no new infrastructure.
- **Keeping functions warm with cron pings:** Fluid compute and `preferRest` handle cold starts properly; pings are a hack with a cost.
- **React Query or another data library:** SWR is already installed and enough.

## Session log

### 2026-10-26 — Planning
- Audit of auth, session, player and admin data paths, bundle and config; production build for bundle sizes. Plan written. Nothing implemented.

### 2026-10-26 — S0 and S1 (code)
- **Done:** S0.1, S1.2–S1.9; S0.2 and S1.1 code only (dashboard steps are manual).
  - `lib/server/timing.ts` and `Server-Timing` on the session route and every player API route.
  - `firebase/admin.ts`: Firestore over REST (`preferRest`).
  - `app/api/auth/session/route.ts` rewritten: one verify (with revocation), profile role read (`getAll` with a field mask, so the activity log isn't downloaded) in parallel with `createSessionCookie`; `lastLoginAt`, `emailVerified`, a new person's profile (`create`, so it never overwrites), the role claim (merged with existing claims, only when it differs) and the activity log run in `after()`. A "login" entry is written only within 5 minutes of the Firebase sign-in, so the 30-minute refresh doesn't log one. If the profile can't be read, the token's role is kept and nothing is changed (before, a failed read could reset an admin's claim to `user`). Sets a readable `signed_in=1` hint cookie.
  - `DELETE` signs out this browser only; `?scope=all` with a Bearer ID token revokes everywhere and reports failures. Logout is logged on the server.
  - `session/check`: one verification, answered from the cookie's claims, no Firestore read.
  - `lib/server/activity.ts` (`logActivity`) for server-side log entries; `/api/auth/user` logs `account_created`.
  - Browser: no awaited activity logging on sign-in/up/out, no forced token refresh in `createSession`, no Firestore fallbacks, sign-up's profile call and verification email in parallel, the unused `logUserActivity` removed, session check skipped without the hint cookie, `logout` clears server and Firebase at the same time, new `logoutEverywhere` and a confirm-first "Sign out of all devices" card on Profile → Security.
  - Sign-up redirects straight to sign-in (`?success=account_created`). The verify-email page no longer reloads (it was reloading every 3 s forever, because the link stays in the address); it refreshes the user in place.
  - `vercel.json` (`fra1`), `@vercel/speed-insights`.
- **Verification:** `npx tsc --noEmit` and `npm run lint` clean. All 16 unit/component suites pass (275 tests, including the new `session-route.test.ts`). Emulator suites pass: attempts-api, admin-api (its mock now stands in for `after()`), firestore-rules. `npm run build` passes; First Load JS dropped about 10 kB on every page (`/` 242 → 232 kB). Dev server: `Server-Timing` present; signed-out `session/check` 200; bad token 401. Read-only probe of the real project over REST worked.
- **Not verified (needs the deploy, `docs/MANUAL_STEPS.md`):** a real email and Google sign-in, sign-up, the verify link, both sign-out modes, region and timings in production.
- **Note:** existing signed-in browsers get the `signed_in` hint at their next session refresh (within 30 minutes). Until then, if Firebase loses the user in such a browser, the stale cookie isn't cleared by the check; the next sign-in replaces it.
