# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active roadmap & brand

- **Read `docs/IMPROVEMENT_ROADMAP.md` first.** It is the multi-session improvement plan: phases, checkbox tasks, status table, and a session log saying what's done and what's next. Follow its "How to use this file" rules and update it at the end of every session.
- Ageno Quiz is part of **Agenoverse**. All UI follows the Agenoverse design system (dark ink + teal, Geist fonts, no purple/gradients, no component library); see the roadmap's Brand and Design principles sections. Source tokens: `D:\PROJECTS\agenoverse\web\src\styles\theme.css` (read-only reference; don't edit that repo from here).

## Commands

```bash
npm run dev      # Next.js dev server on http://localhost:3000
npm run build    # production build
npm run lint     # next lint (ESLint 9 flat config in eslint.config.mjs)
npx tsc --noEmit # type check (no script defined for it)
```

Tests are Vitest files in `__tests__/` and there is **no `test` script**. `exam-logic.test.ts` and `quiz-attempt.test.tsx` are self-contained unit/component tests (jsdom, the attempt API mocked): `npx vitest run __tests__/exam-logic.test.ts __tests__/quiz-attempt.test.tsx`; `vitest.config.ts` only adds the `@/` alias. `attempts-api.test.ts` runs the attempt route handlers against the Firestore emulator (needs Java; it skips itself without `FIRESTORE_EMULATOR_HOST`): `npx firebase emulators:exec --only firestore --project demo-ageno-attempts "npx vitest run __tests__/attempts-api.test.ts"` (port set in `firebase.json`). On Windows `emulators:exec` can leave the emulator's `java.exe` running (it then fails with "port taken" next time): stop the `java.exe` whose command line mentions `cloud-firestore-emulator`. The other files are integration tests (single file: `npx vitest run __tests__/auth-api-integration.test.ts`) that hit a running dev server at `localhost:3000` and sign in to real Firebase with placeholder credentials hardcoded in the file, so they won't pass without editing those and starting `npm run dev` first. Manual auth test plans live in `docs/`.

### Environment

`.env*` is gitignored. Server-side code needs `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Admin SDK; `firebase/admin.ts` throws at import time if any are missing). The README's `NEXT_PUBLIC_FIREBASE_*` vars are **not** used: `firebase/client.ts` hardcodes the client `firebaseConfig` (and the integration test imports it).

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Firebase (Auth + Firestore). Path alias `@/*` maps to the repo root. There is no `src/` directory.

### Route groups don't appear in URLs

`app/(admin)`, `(auth)`, `(quiz)`, `(user)`, `(dev)` are route groups, so admin pages are served at `/dashboard`, `/quizzes`, `/users`, `/quiz-reports`, `/settings` (not `/admin/...`). The quiz-taking page is `app/(quiz)/[code]` at `/<accessCode>`, and `/join` is the code-entry page.

### Auth and session flow (spans several files)

1. Client signs in via Firebase Auth (`lib/actions/auth.actions.ts`, wrapped by `contexts/auth-context.tsx`; `hooks/useAuth.ts` layers SWR, profile/MFA actions on top of the context).
2. `lib/actions/session.actions.ts` posts the ID token to `app/api/auth/session/route.ts`, which verifies it with the Admin SDK, upserts the `users/{uid}` doc, syncs the `role` custom claim, and sets two httpOnly cookies: `session` (Firebase session cookie, 14 days) and `user_role`.
3. `middleware.ts` only checks that the `session` cookie *exists* (it does not verify it) and reads `user_role` for admin gating. Public paths are an allowlist at the top of the file; any `/[A-Za-z0-9]{6,}` path is treated as public (quiz access codes).
4. `auth-context` caches user data in localStorage (`lib/services/session.service.ts`) and refreshes the session every 30 minutes.

Gotcha: `middleware.ts` `isAdminPath()` matches `/admin...`, which no real route uses, so **admin pages are not protected by middleware**. Protection is client-side (`components/AdminProtected.tsx` in `app/(admin)/layout.tsx`) plus Firestore rules (`firestore.rules`, `isAdmin()` checks the `role` claim or `users/{uid}.role`). Roles are in `constants/role.ts`.

### Data layer

Admin screens, `/join`, `/my-quizzes` and the leaderboard read and write Firestore directly from the browser with the client SDK. **Taking a quiz does not**: the questions, the clock and the scoring are server-side (Admin SDK) behind `app/api/attempts/*` (start, resume, autosave, submit) and `app/api/quizzes/[quizId]/summary` (question counts for the lobby). The browser never sees which option is right until a submit returns the review; see "The quiz-taking flow" below. Two overlapping client modules exist:

- `firebase/firestore.ts`: the types (`Quiz`, `QuizQuestion`, `QuizAttempt`, `QuizSubmission`), converters, and the functions the join/lobby/my-quizzes pages use (`getQuizByCode`, `getQuizById`, `getUserQuizAttempts`, `getActiveQuizzes`). `getQuizByCode`/`getQuizById` return the quiz document only, never its questions. `lib/quiz-data.ts` (`quizFromData`) holds the field defaults, shared with the server.
- `services/quizService.ts` + `hooks/useQuiz.ts` (SWR): CRUD-style helpers used by the hooks. It duplicates some names (e.g. `getQuizById`), so check which module a caller imports before editing.

`types/quiz.ts` holds the lighter `QuizResponse` type used by analytics.

Questions are stored per difficulty in subcollections `quizzes/{id}/questions_{easy|medium|hard}` (see `firebase/quizDifficulty.ts`), with a fallback to the legacy `quizzes/{id}/questions`. Per-difficulty `difficultySettings` (duration, `pointsMultiplier`) live on the quiz doc; see `docs/DifficultySettings.md` and `utils/difficulty-helpers.ts`. Final score is raw % (of every question in the attempt) times the multiplier (1 when a level sets none), rounded and capped at 100, computed only by `lib/exam/scoring.ts` on the server; the response also stores `rawPercent`, `correctCount` and `pointsMultiplier`. `firestore.rules` is the **interim** ruleset (deployed 2026-10-25, see the roadmap): it still lets anyone read `quizzes/*/questions_*`, so the answers are reachable directly until P5.5 replaces it. Deploy with `firebase deploy --only firestore:rules --project ageno-quiz-af3ff`.

### Site shell and design system

- Pages never render a header or footer. `components/layout/SiteFrame.tsx` (header, the single `<main id="main-content">`, optional footer) is used by the `(auth)`, `(quiz)`, `(user)` and `(public)` layouts. `(admin)` has its own layout. Don't put `<main>` in a page.
- Tokens live in `app/theme.css` (Agenoverse port) and brand utilities in `app/globals.css`. The default Tailwind palette still exists until P7.6, and `<body>` is still light. New or redesigned screens sit on a dark surface (`data-theme="dark"` + `bg-bg text-text`) and use token classes (`bg-surface`, `text-text-muted`, `border-border`, `text-accent`), not `gray-*`/`indigo-*`.
- Primitives are in `components/ui/` (import from `@/components/ui`); use `cn()` from `lib/utils.ts`. Don't add a component library.

### Large files to know about

- **The quiz-taking flow.** `app/(quiz)/[code]/client.tsx` (~250 lines) only wires things together: `hooks/useQuizLoader.ts` (the quiz doc by code, plus question *counts* per level) → lobby (`components/quiz/lobby/`) or `ResumeAttempt` → `components/quiz/exam/QuizAttempt` (one attempt: `ExamShell`, `QuestionView`, `QuestionNavigator`, `SubmitDialog`, then `ResultsView`). Start/Resume/Retry call the attempt routes through `lib/exam/api.ts` (Bearer ID token; no token = guest, stored as userId `anonymous`) and turn the answer into a seed with `lib/exam/seed.ts` (corrects the server clock against the device clock). Server side: `lib/server/attempts.ts` (`startAttempt`, `getAttempt`, `saveProgress`, `submitAttempt`; Firestore `attempts/{id}` holds a snapshot of the questions with their key, the deadline, answers, flags and counters, readable only through the Admin SDK) and `lib/server/request.ts`. A submit runs in one transaction (exactly once; a repeat returns the stored result), writes `responses/{attemptId}` + `answers/{questionId}`, and a submit later than deadline + 30s is not read: the last autosave counts and the result says `late`. State for an attempt (answers, flags, submit guard, autosave to the device under `ageno:quiz:attempt:<quizId>:<uid>` and, debounced, to the server) is in `hooks/useQuizAttempt.ts`; pure helpers are in `lib/exam/` (`normalize.ts`, `scoring.ts`, `answers.ts`, `storage.ts`). Mount `QuizAttempt` with `key={attemptId}`: a retry is a new attempt. `Quiz.examMode` (`practice` default, `strict`) decides what leaving fullscreen does (`FullscreenNotice` vs `FullscreenGate`, exits counted in `fullscreenExits`); Start/Resume/Retry request fullscreen from the click (`lib/exam/fullscreen.ts`). While an attempt runs, `useExamMode` (`components/layout/QuizFrame.tsx`) removes the site header.
- `components/quiz/QuizForm.tsx`: the admin create/edit form (questions, images, import/export, difficulty settings), used by `quizzes/new` and `quizzes/[quizId]/edit`.
- `components/analytics/*`: Chart.js dashboards for `(admin)/quiz-reports`.

### Build config

`next.config.mjs` adds webpack aliases/fallbacks and `ProvidePlugin` for Node core modules (`process`, `buffer`, `stream`, `crypto`, etc.) on the client bundle, via the `*-browserify` devDependencies. Don't remove these without checking that the client build still works. Remote images are allowed only from `firebasestorage.googleapis.com`.
