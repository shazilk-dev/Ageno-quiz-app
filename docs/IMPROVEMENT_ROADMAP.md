# Ageno Quiz Improvement Roadmap

**Purpose:** turn Ageno Quiz into a professional, industry-level quiz and exam platform that belongs to the **Agenoverse** brand. The plan spans multiple sessions and tracks its own progress.

- **Created:** 2026-10-23
- **Last updated:** 2026-10-26 (Session 10)
- **Current phase:** 7 (App-wide polish and accessibility). P7.1 to P7.5 are done; the user hasn't looked at any of them yet.
- **Next up:** P7.6 (palette: what still has stock colours is the four `(auth)` pages, the two `(dev)` pages and `app/layout.tsx`'s `<body>`). Items carried over: the raw-vs-weighted *headline* decision for the results screen (the leaderboard no longer depends on it), rate limiting, the speed plan (now its own file: `docs/PERFORMANCE_PLAN.md`; S0–S4 done, S5 next). Note for P7.6: the `useauth-test` dev page no longer exists (deleted in S4.5), so one `(dev)` page is left.

---

## How to use this file (for AI sessions)

1. Read the **Status** table and the **Session Log** (bottom) first.
2. Pick the first unchecked task in the current phase.
3. Read the files the task names **before** editing. The file:line references come from the 2026-10-23 audit and will drift over time.
4. After each task, run `npx tsc --noEmit` and `npm run lint`. At the end of each phase, also run `npm run build` and check the screens it touched in `npm run dev`.
5. Tick the task's box (`[x]`), update the Status table, "Current phase", "Next up" and "Last updated", and add a Session Log entry: date, tasks done, verification, notes or blockers.
6. Don't start a new phase until the previous one meets its **Done when**. Small fixes from later phases are fine if they're already open in the file you're editing. Note them in the log.
7. Never tick a box you didn't verify. If you only partly finish a task, leave it unchecked and explain in the log.
8. Reference task IDs (e.g. `P2.3`) in commit messages: `feat(join): P2.1 code entry form`.

Decisions already made with the user:
- UI work comes first, then integrity and security.
- The live app currently works, which means the deployed Firestore rules are looser than `firestore.rules`.
- Visual direction is the Agenoverse design system (see below).

---

## Status

| Phase | Title | Status |
|---|---|---|
| 0 | Quick fixes | Done |
| 1 | Design system (Agenoverse port) | Done (awaiting the user's visual check) |
| 2 | Join page | Done |
| 3 | Quiz lobby (intro) | Done |
| 4 | Exam-taking experience | Done (awaiting the user's check with a real quiz) |
| 5 | Integrity and security | Done |
| 6 | Data layer cleanup | Done |
| 7 | App-wide polish and accessibility | In progress (P7.1-P7.5 done) |
| 8 | Agenoverse integration and pro exam features | Backlog |

Status values: `Not started`, `In progress`, `Done`, `Blocked (reason)`.

---

## Brand: Ageno Quiz is part of Agenoverse

Ageno Quiz is the assessment product of **Agenoverse**, the "Let's Rise Together" AI community. It sits alongside Ageno Lab, Agenoversity and the Community.

- **The design source of truth is the Agenoverse repo at `D:\PROJECTS\agenoverse`. Read it; don't change it from this project.**
  - Tokens: `web/src/styles/theme.css`
  - Utilities: `web/src/styles/globals.css`
  - Rules: `CLAUDE.md` §Design Direction and §Motion System
  - Components: `web/src/components/ui/*` (Button, Badge, Chip, Field, SearchInput, Toast, CopyButton)
  - Logo: `web/src/components/brand/Logo.tsx` and `LogoWordmark.tsx`
  - Practice quiz block: `web/src/components/content/QuizBlock.tsx`
- When in doubt, match agenoverse.com. Don't invent a separate look.
- **Voice:** professional, calm, confident, kind. Plain, human copy that uses "you" and contractions.
  - Never use emoji, "✨ AI-powered" phrasing, or fake metrics, counts, testimonials or certificates.
  - Campaign line, where it fits: "Build with AI. Learn with AI. Rise together."
- Agenoverse has **no accounts yet**, so don't build cross-site login. Its rules also forbid component libraries.

---

## Design principles (apply to every UI phase)

### Style: "Dawn on the terminal"

- **Colours**
  - **Dark by default.** Use `data-theme="light"` (bone paper) for reading-heavy sections.
  - Ink `#0e1116` background; surfaces `#1c2028` and `#232831`; border `#2d333b`; text bone `#f6f5f1`; muted text `#a5a8ae`.
  - **Teal `#22c3b0` is the system:** primary buttons, links, focus, active and selected states, timer, progress.
  - **Amber `#f5b544` is the people:** community moments only, around 5% of a page. Examples are a leaderboard highlight, a "Rise together" CTA or a personal best. Never use it as a fill behind nav, cards or headings.
  - Put ink text on teal, never bone (bone on teal fails contrast). On bone sections, small text uses `text-link`.
- **Depth** comes from light rather than boxes: 1px borders, a subtle `bg-grid`, a soft teal glow, about 5% grain. At most one signature moment per page.
- **Don't use:**
  - purple or violet (the current app's whole palette goes)
  - mesh or blob gradients, or gradient text
  - glassmorphism (except backdrop blur on the navbar)
  - emoji icons, or headings with an icon in a coloured circle
  - centred-everything layouts or identical card grids everywhere
  - shadcn, Radix or any other component library

### Type and spacing

- **Geist Sans** for the UI, weights 400–600. Headings use weight 600, `-0.02em` tracking and `text-wrap: balance`.
- **Geist Mono** for `// LABEL`-style labels, access codes, the timer, scores and question numbers. Use tabular numbers.
- **Instrument Serif italic** only on 1–3 emotional words of a big heading, e.g. "Ready to *rise?*". Never use it inside the exam.
- Use the fluid type scale copied from Agenoverse (`--text-xs` … `--text-6xl`). Page titles are `text-3xl` or `text-4xl`. Body text has line-height 1.7 and a max width of 65ch.
- **Layout and radius:** 4px spacing steps, 1200px max width, 64px nav. Radius 6px small, 10px for buttons and inputs, 16px for cards, full for badges.

### Motion (Agenoverse rules)

- Animate only `transform`, `opacity` and `filter`.
- Hover lasts 150–250ms. Cards lift 2px and change border; buttons get `brightness-110`.
- Entrance: at most one subtle rise (16px, 700ms, `cubic-bezier(.16,1,.3,1)`), CSS-only above the fold. Don't stagger long lists.
- No looping effects except the logo cursor blink and loading spinners. **The exam has no decorative motion at all.**
- Add a global `prefers-reduced-motion` guard.
- Drop framer-motion from the join, lobby and exam screens. Agenoverse doesn't use it.

### Layout

- The primary action must be above the fold at 1366×768 and at 390×844.
- The header is exactly 64px and never changes height.

### Accessibility (WCAG 2.2 AA)

- Text contrast of at least 4.5:1, and visible `focus-visible` rings.
- Touch targets of at least 44px.
- Use real `<button>`, `<input>` and radio semantics, plus `role="alert"` and `role="status"` for messages.

### Copy and states

- No developer-facing text in the UI. Examples to remove: "Firestore permission denied", "press F12", "auto-selected and pre-loaded".
- Lists use skeletons, not spinners. Every list has a designed empty state and an error state with a Retry button.

---

## Phase 0: Quick fixes

One short session.

- [x] **P0.1 Header shake.**
  - **Cause:** `components/Header.tsx:14-28` switches `py-4` to `py-2` when `scrollY > 10`. That changes the header height by 16px, scroll anchoring then moves `scrollY` back across the threshold, and the header flips back and forth in a loop.
  - **Fix:**
    - Keep the height fixed at `h-16`, and change only shadow, background and border once scrolled.
    - Use `transition-[background-color,box-shadow]`.
    - Use a passive scroll listener throttled with requestAnimationFrame, plus hysteresis (e.g. turn on above 48px, off below 4px). Run the handler once on mount.
    - Remove the `.transition-all` and `will-change` header overrides from the mobile blocks in `app/globals.css`.
- [x] **P0.2 Sticky header.** The root `<main>` in `app/layout.tsx:107` uses `overflow-x-hidden`, which breaks `position: sticky`. Change it to `overflow-x-clip`. Change the nested `<main>` in `app/(quiz)/join/page.tsx` to a `<div>`.
- [x] **P0.3 Broken links:**
  - `/quiz/join` should be `/join` (`app/(quiz)/[code]/client.tsx:1457`).
  - `/admin/quizzes` should be `/quizzes` (`app/(admin)/quizzes/[quizId]/edit/page.tsx:367,733`).
  - `/admin/quizzes/${id}/edit` should be `/quizzes/${id}/edit` (`app/(admin)/dashboard/page.tsx:345`).
- [x] **P0.4 Join search.** Replace the two conflicting filter effects in `app/(quiz)/join/page.tsx:74-102` with one `useMemo` that matches title, description and code. Right now the second effect wins and only matches titles.
- [x] **P0.5 Debug noise.**
  - Remove live `console.log` calls from:
    - `components/quiz/DifficultySelect.tsx`, `FixedScoreDisplay.tsx`, `auto-load-questions.js`, `QuizTimer.tsx`, `SafeQuizLoader.tsx`
    - `firebase/firestore.ts` (especially `:896`, which logs full response docs)
    - `app/(quiz)/layout.tsx`, `app/(user)/layout.tsx`, `app/(user)/my-quizzes/page.tsx`
    - `app/api/auth/*`
  - Delete the big commented-out log blocks in `client.tsx`.
- [x] **P0.6 Answers on screen.** Remove the on-screen `JSON.stringify(currentQuestion)` in `client.tsx:1295`. It exposes the correct answers.

**Done when:**
- The header stays still while scrolling slowly near the top of `/join` and `/`, in both Chrome and Firefox.
- All the links above work.
- Search matches description and code.
- tsc, lint and build all pass.

---

## Phase 1: Design system (Agenoverse port)

- [x] **P1.1 Tokens.**
  - Copy Agenoverse `web/src/styles/theme.css` into `app/theme.css`, keeping `@theme static`, the dark default and the `[data-theme="light"]` overrides. Import it from `app/globals.css`.
  - The old `:root` vars aren't Tailwind tokens, so classes like `bg-tech-blue-dark/90`, `text-muted-foreground` and `bg-purple-primary` produce no CSS. `--tech-blue-darker` isn't defined anywhere.
  - **Don't wipe the default palette (`--color-*: initial`) yet.** The stock classes (`indigo-*`, `gray-*` and so on) are still used everywhere. Migrate one screen at a time; the wipe happens in P7.6.
- [x] **P1.1b Fonts.**
  - Replace Inter in `app/layout.tsx` with the `geist` package (Sans and Mono), plus Instrument Serif via `next/font/local`. Copy the woff2 files from `D:\PROJECTS\agenoverse\web\src\assets\fonts\`.
  - Fix the `--font-sans` override in `globals.css`.
  - Set `viewport.themeColor` to `#0e1116` and use `color-scheme: dark`.
- [x] **P1.1c Brand utilities.**
  - Port these from Agenoverse `globals.css`: `bg-grid`, `glow-teal`, `bg-noise`, `spotlight`, `rise`, `text-label`, `link-underline`, `transition-fast|base|slow`, `::selection`, `:focus-visible`, and the reduced-motion guard.
  - Skip the typewriter set unless something uses it.
- [x] **P1.1d Logo and naming.**
  - Port `Logo.tsx` (the "Cursor A" mark with its teal cursor block).
  - The wordmark is a lowercase "ageno quiz" with a small mono `by agenoverse` label.
  - Update the favicon and OG image, and set metadata and titles to "Ageno Quiz".
- [x] **P1.2 Clean up `globals.css`.**
  - Delete the duplicated mobile `@media` block (around lines 406-513 and 584-635), the `!important` heading overrides and the duplicate `fade-in`.
  - Delete the decorative keyframes (`float-slow*`, `pulse-slow`, `background-shine`) and the unused `app/animations.css`.
  - Remove the purple-gradient `.btn-primary`.
- [x] **P1.3 Primitives.**
  - **Setup:** port from Agenoverse `web/src/components/ui/`. Here `@/*` points to the repo root, not `src/`. Add `clsx`, `tailwind-merge` and a `cn()` helper in `lib/utils.ts`, and add `lucide-react` if it's missing.
  - **Port these:**
    - `Button`: variants primary (teal with ink text), secondary, warm (amber, community only), ghost and danger; sizes sm, md and lg; a loading state.
    - `Badge`, `Chip`, `Field`/`Input`, `SearchInput`, `Toast`, `CopyButton`.
  - **Build new, in the same style:** `Card`, `Skeleton`, `Dialog` (native `<dialog>`, focus-trapped), `SegmentedControl`, `EmptyState`, `Alert`.
  - Check this repo's `components/ui/` first, and replace or delete the old versions.
- [x] **P1.4 One shared header.**
  - Render `<Header/>` once, from shared layouts. Today about 8 pages render it themselves: `app/page.tsx`, `join/page.tsx`, `[code]/client.tsx` and the auth pages. The `(user)` layout already does it the right way.
  - **Design** (Agenoverse navbar style): ink background with backdrop blur, a 1px bottom border once scrolled, fixed `h-16`, logo on the left.
  - **Contents:**
    - Nav links: Join a quiz, My quizzes, Leaderboard.
    - An account menu and an accessible mobile menu.
    - A small `Agenoverse ↗` link. It reads `NEXT_PUBLIC_AGENOVERSE_URL`, defaulting to `https://agenoverse.com`.
- [x] **P1.5 Footer.** A slim footer in Agenoverse style:
  - The line "Ageno Quiz is part of Agenoverse".
  - Links to Community, Agenoversity and Playbook on the Agenoverse site.
  - A mono `// LET'S RISE TOGETHER` label.

**Done when:**
- The primitives exist and the header and footer use them.
- The site shell renders in ink and teal with Geist.
- No gradient, glow-pulse or purple classes remain in `globals.css`.

---

## Phase 2: Join page redesign

Files: `app/(quiz)/join/page.tsx`, `components/QuizCard.tsx`.

**Goal:** the first quiz card is visible within about 250px of the header, and joining by code takes one action.

- [x] **P2.1 Top area.**
  - Use one compact row:
    - **Left:** a mono `// QUIZZES` label, the title "Join a quiz" (`text-3xl`) and a one-line subtitle.
    - **Right:** an **"Enter access code" input and a Join button** inside a real `<form>`. The input is mono, uppercase and tracked. Pressing Enter submits, validation shows inline, and success navigates to the quiz.
  - Today the page has no working code input; the `accessCode` state is dead code.
  - Remove the "You're signed in" pill. Guests see a subtle "Sign in to save progress" note instead.
- [x] **P2.2 Toolbar.**
  - Contents:
    - a search input with an icon and a clear button
    - filter chips: All / Open / Code required
    - a sort control: Newest, Title
    - the result count
  - It replaces the two stacked section headings and the icon bubbles.
- [x] **P2.3 QuizCard.** Rebuild it flat.
  - **Contents:** title, a two-line description, a mono meta row (duration · N questions · difficulty badges), and a lock icon with "Code required" when one is needed.
  - **Look:** `surface` background, 1px `border`, 16px radius.
  - **Interaction:** the whole card is a link. Hover lifts it 2px and switches to `border-strong`.
  - **Remove:** all gradients, the hover underline animation and the per-card mount animation.
  - **Stop showing the access code on the card.**
  - Amber appears only on a `challenge` badge.
  - The grid is 1 column on mobile, 2 at md and 3 at lg, with `gap-4`.
- [x] **P2.4 Code-required flow.**
  - Remove `AccessCodeModal`. It springs in with an animation and checks the typed code against one the page already exposes.
  - Cards now go straight to the lobby, which asks for the code (P3.3).
- [x] **P2.5 States.** Skeleton cards while loading, an empty state for "no quizzes" and "no results", and a user-facing error with Retry (no Firestore wording).
- [x] **P2.6 Motion.** At most one 150ms fade on the list. Remove the framer-motion stagger and the hover scale.

**Done when:**
- At 1366×768 the code input and the first row of cards are visible without scrolling.
- Joining works with the keyboard alone.
- Lighthouse accessibility is 95 or higher.

---

## Phase 3: Quiz lobby (intro) redesign

Files: `app/(quiz)/[code]/client.tsx:1491-1616`, `components/quiz/DifficultySelect.tsx`.

**Goal:** everything fits on one screen with no scrolling at 1366×768. Two columns on desktop, stacked on mobile.

- [x] **P3.1 Extract.** Move the intro out of `client.tsx` into `components/quiz/lobby/QuizLobby.tsx` plus subcomponents. This starts breaking up the 1600-line file.
- [x] **P3.2 Left column: "About this quiz".**
  - Contents:
    - the title and a short description, clamped with "Show more" when long
    - a compact facts row (questions · duration · difficulty)
    - **Instructions**
  - **Instructions** are 4–5 short bullets: how the timer works, answers are final once submitted, tab switching is recorded, keep a stable connection.
  - Duration and multiplier appear **once**. Today each appears three times.
- [x] **P3.3 Right column: a sticky "Start" card.**
  - **Difficulty** uses a `SegmentedControl` or compact radio cards: Easy, Medium and Hard, each with its duration and multiplier, and teal marking the selected one. Show it only when the quiz has more than one difficulty.
  - **Remove** the glow and pulse keyframes, `hover:rotate-1`, `scale-105`, the ✓ glyph and the "auto-selected and pre-loaded" text.
  - **Access code field:** only when `requiresAccessCode` is set and the code hasn't been verified this session. Otherwise **Start quiz** shows straight away.
  - **Start area:**
    - A mono summary line, e.g. "20 questions · 30 min".
    - A full-width teal Start button with a loading state.
    - A sign-in prompt for guests when saving progress needs one.
- [x] **P3.4 Remove** the "Access Code:" display block (`:1529-1536`).
- [x] **P3.5 One source for durations and multipliers.**
  - Make `utils/difficulty-helpers.ts` the only source.
  - Today the stat box falls back to 45/30/20 minutes, the instruction list and `handleStartQuiz` use `quiz.duration || 30`, and `DifficultySelect` hardcodes multipliers of 1.0/1.5/2.0.
  - Also fix the `bg-blue-700` vs `primary` button mismatch.
- [x] **P3.6 States.** A lobby skeleton, a proper "quiz not found" screen for a bad code (with a link to `/join`), and an "inactive quiz" state.

**Done when:**
- A typical quiz's lobby has no scrollbar at 1366×768.
- On mobile, the Start card is reachable with at most one scroll.
- An open quiz starts in one click.

---

## Phase 4: Exam-taking experience

Files: the in-quiz view in `client.tsx`, `components/quiz/QuizTimer.tsx`, the results view.

- [x] **P4.1 Focused exam layout.**
  - A minimal top bar: quiz title, a mono tabular timer, a teal progress bar with "Q 5 of 20", and Submit. Hide the site nav during an attempt.
  - Optionally, show long question text on a bone (`data-theme="light"`) reading panel. Decide while building and record the choice in the log. Dark stays the default.
- [x] **P4.2 Question navigator.**
  - A side panel on desktop and a bottom sheet on mobile.
  - It shows a numbered grid with answered, unanswered, flagged and current states.
  - Add **Flag for review**.
- [x] **P4.3 Accessible options.**
  - Make the options a real `radiogroup` with `aria-checked`. Today they're clickable `<div>`s (`:1363-1395`).
  - Keyboard: 1–4 or A–D select an option, ← and → move between questions.
  - Move focus to the question heading when the question changes.
- [x] **P4.4 Timer.**
  - Fix the side effect inside the `setState` updater (`QuizTimer.tsx:94`) and the interval that gets recreated every second (`:102`).
  - Remove the hardcoded `duration={30}` (`client.tsx:1345`).
  - Add an `aria-live` warning at 5 minutes and at 1 minute, a cue that doesn't rely on colour alone, and auto-submit at zero.
- [x] **P4.5 Submit flow.**
  - A confirm dialog that says "You have N unanswered / M flagged".
  - An `isSubmitting` guard, so a double submit or a race with the timer can't happen.
  - **Show failures honestly, with Retry.** Today a failed submit quietly saves to localStorage under a fake `local-…` id and looks like a success (`:880-919`).
- [x] **P4.6 Autosave and resume.**
  - Save answers, flags, the current question and the start time in localStorage, keyed by quiz and user (prefix `ageno:quiz:`).
  - Offer "Resume attempt" after a reload, and warn on `beforeunload`.
  - Phase 5 moves this to a server-side attempt document.
- [x] **P4.7 State cleanup.**
  - Remove:
    - the `setScore` calls made during render (`:959,1079,1122,1146,1151`)
    - the `setTimeout` score hacks (`:738,863-875`)
    - the ref polling in `FixedScoreDisplay`
    - the 800ms auto-load timeout in `auto-load-questions.js`
  - Retry must reset the answers and the tab-switch count.
- [x] **P4.8 Results.**
  - Show the score, correct out of total, time taken, and a plain explanation of the difficulty multiplier.
  - Add a **per-question review**: the user's answer, the correct answer and an optional explanation. An admin setting controls whether it's shown.
  - Remove the raw Firestore id. Add "Back to quizzes" and "View my attempts".
- [x] **P4.9 Split `client.tsx`.** Keep every file under about 400 lines: a `useQuizAttempt` hook, `ExamShell`, `QuestionView`, `QuestionNavigator`, `SubmitDialog`, `ResultsView`.

**Done when:**
- An attempt survives a page refresh.
- A whole quiz can be taken with the keyboard alone.
- A double submit can't happen.
- A failed submit shows an error.

---

## Phase 5: Integrity and security

Without this, Ageno Quiz isn't really an exam system. The live app works, so the deployed rules must be looser than `firestore.rules` (probably test mode), which risks exposing data.

- [x] **P5.1 Audit the deployed rules.** Compare the live rules in the Firebase console with the repo file, and write the findings in the Session Log. (Findings: Session 6.)
- [x] **P5.2 Server-side attempts.** *(Built in Session 6; the user took a real quiz on the deployed build and it worked. Not hand-checked: a strict quiz and the 5/1-minute warnings. The key stays readable in Firestore until the P5.5 rules are deployed.)*
  - **No separate backend.** These are Next.js route handlers in this same project, running as Vercel serverless functions. That's the same pattern `app/api/auth/session/route.ts` already uses. Use the Node runtime (`firebase-admin` doesn't run on Edge) and reuse the existing `FIREBASE_*` env vars on Vercel.
  - Add API routes that use the Admin SDK (`firebase/admin.ts`):
    - `POST /api/attempts/start` creates `attempts/{id}` with a server `startedAt` and `deadline`, picks the question set, and returns questions **without** `correctIndex` or `isCorrect`.
    - `PATCH /api/attempts/{id}` autosaves answers.
    - `POST /api/attempts/{id}/submit` scores on the server, rejects anything past the deadline plus a grace period, and writes to `responses`.
  - What this fixes:
    - `getQuizByCode` (`firebase/firestore.ts:360`) and `firebase/quizDifficulty.ts:84-91` send the answers to the browser.
    - `client.tsx:791` caches them in localStorage.
    - `submitQuizResponse` (`firestore.ts:382-817`) writes a score the browser calculated.
- [x] **P5.3 Fix scoring.** *(One server scoring function, the multiplier mismatch and the answers-rebuilding fallback are done and checked with P5.2. The raw-vs-weighted decision below is still open: both are stored, the weighted score is still the headline.)*
  - Use one scoring function, on the server.
  - Fix the mismatched default multipliers: 1.0 in `client.tsx:377` vs 1.5/2.0 in `firestore.ts:577-581`.
  - Remove the fallback in `firestore.ts:464-471` that rebuilds questions from the user's own answers, which marks every answer correct.
  - **Decision needed:** keep "raw % × multiplier, capped at 100", where 50% on hard counts as 100%, or store the raw score and weighted points separately. The recommendation is to store both and show raw % as the score.
- [x] **P5.4 Separate the URL from the access code.** *(Done in Session 7, checked on the deployed app in Session 8.)*
  - Move quizzes to `/q/{slug-or-id}`.
  - Verify the access code on the server, and never send it to `/join`.
  - `getActiveQuizzes` (`firestore.ts:187`) stops returning codes and filters on `isPublic && active`.
- [x] **P5.5 Rewrite `firestore.rules`.** *(Done: the strict rules were deployed on 2026-10-26, released ruleset `1fe269e9-5319-4277-a69f-dcbb5ae4f4ee`, and confirmed identical to `firestore.rules` in the repo. Anonymous reads of quizzes, users, responses, attempts and the answer key all return 403.)*
  - **Cover these collections:**
    - `responses` (top-level)
    - `questions_{easy,medium,hard}`: admin only, players get questions through the API
    - `attempts`
    - `settings`
  - Deny client writes to `score`, and stop owners from updating their own responses.
  - Fix the `isPublished` vs `isPublic` mismatch.
  - The leaderboard reads other users' docs, so give it a public projection or denormalized display names.
  - Deploy the rules and verify them.
- [x] **P5.6 Middleware** (`middleware.ts`). *(Done in Session 7, checked on the deployed app in Session 8.)*
  - The admin matcher checks for `/admin`, but the real admin routes are `/dashboard`, `/quizzes`, `/users`, `/quiz-reports` and `/settings`.
  - `QUIZ_CODE_PATTERN` (`:55`) treats those paths as public quiz codes. Once quizzes live under `/q/` (P5.4), that problem goes away.
  - Verify the session cookie on the server in the `(admin)` layout instead of trusting the `user_role` cookie.
- [x] **P5.7 Remove the mobile auth bypass.** *(Done in Session 7, checked on the deployed app in Session 8.)*
  - `SafeQuizLoader` passes `skipAuthCheck={isMobileBrowser}`.
  - `app/(user)/layout.tsx:57` skips the check on mobile too.
- [x] **P5.8 Block dev routes in production:** `app/(dev)/*` and `/api/auth/session/debug`. *(Done in Session 7 and checked against a production build: all three return 404.)*
- [x] **P5.9 Server-side integrity signals.** (The browser side of fullscreen exits is already counted; see Session 5.) *(Done in Session 7, checked on the deployed app in Session 8.)*
  - Record tab switches, blur and leaving fullscreen as events on the attempt doc, timestamped when the server receives them.
  - Keep the "camera" stub out of the UI until it's real.

**Done when:**
- No answer data reaches the browser before submit (check the Network tab).
- A forged `addDoc` to `responses` is denied.
- A late submit is rejected.
- Non-admins are redirected away from admin routes without relying on client JS.

---

## Phase 6: Data layer cleanup

- [x] **P6.1 One question schema.** *(Session 9: `lib/quiz-schema.ts`; the migration script is tested on the emulator. The live data had nothing to migrate.)*
  - Today admin create writes `questions_{difficulty}` without `correctIndex` (`app/(admin)/quizzes/new/page.tsx:294`).
  - Meanwhile the detail and edit pages read and write the legacy `questions` (`[quizId]/page.tsx:62`, `edit/page.tsx:91,321-358`).
  - Pick one schema and write a one-off migration script for legacy quizzes.
- [x] **P6.2 One editor.** *(Built in Session 9 on a new `components/admin/quiz-editor/`, not on `QuizForm`; ticked in Session 10 when the user confirmed Phase 6 is done.)* Rebuild both `quizzes/new` (779 lines) and `[quizId]/edit` (777 lines) on `components/quiz/QuizForm.tsx`. Delete `CreateQuizForm.tsx` if nothing uses it.
- [x] **P6.3 Delete dead code:** *(Session 9)*
  - `services/quizService.ts` and `hooks/useQuiz.ts` (nothing imports them)
  - the duplicate `getQuestionsByDifficulty` (`firestore.ts:971` vs `quizDifficulty.ts:69`)
  - `components/examples/AuthStatus.tsx` and `components/debug/AuthDebugger.tsx`
- [x] **P6.4 Atomic writes.** *(Session 9)*
  - Use batches or transactions when saving an edit and when submitting. Today answers are written with an `addDoc` loop (`firestore.ts:772-797`).
  - Deleting a quiz also deletes its subcollections and responses.
  - Deleting a user also deletes their Auth account, through the Admin API.
- [x] **P6.5 Queries.** *(Session 9)*
  - Remove the N+1 reads and add pagination in:
    - `quiz-reports` (`:141,164,182`)
    - `dashboard` (`:84,145,158`)
    - `getUserQuizAttempts` (`firestore.ts:838-903`)
  - Remove the "debug" read of the entire `responses` collection (`firestore.ts:838-852`).

**Done when:**
- One module owns quiz data access.
- Admin create → edit → take works end to end on a new quiz.

---

## Phase 7: App-wide polish and accessibility

- [x] **P7.1 `/my-quizzes`.** *(Session 10)*
  - Remove the developer error text and the user-ID troubleshooting box (`:80-87,162-185,357-381`).
  - Fix the stats, which currently ignore 0% scores (`:47-48`).
  - Remove the doubled container padding.
  - Show cards on mobile instead of the 5-column table, and link each attempt to its review.
- [x] **P7.2 Leaderboard and profile.** *(Session 10)* Apply the design system. On the leaderboard, use amber only for the user's own row or the top-3 highlight. Split `profile/page.tsx` (1490 lines) into sections.
- [x] **P7.3 Admin.** *(Session 10)* Replace `alert()` and `confirm()` with `Dialog` and toasts. Use consistent tables, empty states and skeletons.
- [x] **P7.4 Landing page** *(Session 10)* (`app/page.tsx`), rebuilt in Agenoverse style.
  - **Hero:**
    - dark, with a subtle `bg-grid` and an asymmetric layout
    - a headline with one Instrument Serif italic word
    - CTAs: "Join a quiz" (teal) and "Enter code"
  - **Below the hero:** a "How it works" strip, then a community band with an amber accent ("Practice with the Agenoverse community") that links to the Agenoverse community page.
  - No floating blobs, gradient text or fake stats.
- [x] **P7.5 Audit.** *(Session 10; method and numbers in the log)* Run Lighthouse and axe on `/`, `/join`, the lobby, the exam, results and `/my-quizzes`. Targets: accessibility 95 or higher, desktop performance 90 or higher, CLS under 0.1.
- [ ] **P7.6 Finish the palette.** Once no stock colour classes remain (`rg "(indigo|purple|violet|blue|gray|neutral|slate)-[0-9]"` returns nothing), wipe the default Tailwind palette with `--color-*: initial`. Remove `framer-motion` if nothing uses it.

**Done when:**
- No `alert()` calls remain.
- No stock or purple colour classes remain.
- The audit targets are met.

---

## Phase 8: Agenoverse integration and pro exam features

Backlog. Pick items as they're needed.

### Agenoverse integration
- [ ] Add "Quiz" to Agenoverse's nav or footer (`web/src/lib/navigation.ts`). That change belongs to the Agenoverse repo, so make it in a session there.
- [ ] Community challenges:
  - Quizzes tagged `challenge` appear under an "Agenoverse challenges" filter, with amber accents.
  - Add an optional Discord or WhatsApp share link.
- [ ] Agenoversity tie-in:
  - After Phase 5, Ageno Quiz is the natural home for the graded, server-side assessments that Agenoverse's `playbook-plan.md` rule 6 calls for.
  - Playbook and path pages can link to a quiz by slug ("Test yourself").
- [ ] Verifiable certificates (Phase 5 must be done first): issued on the server, with a public `/verify/{id}` page. Agenoverse rejects printable certificates as fake credentials.
- [ ] Shared identity across Agenoverse products only once Agenoverse itself adds accounts (its stage MP-F1). Don't build cross-site auth before then.

### Pro exam features
- [ ] Shuffle questions and options per attempt, with the seed set on the server.
- [ ] Attempt limits and cooldowns.
- [ ] Scheduled availability windows (opens at / closes at).
- [ ] More question types: multi-select, true/false, short answer.
- [ ] Per-question analytics (difficulty index, distractor analysis) and CSV export.
- [x] An optional "fullscreen required" mode (done in Session 5 as `examMode: "strict"`; server-side recording is P5.9).
- [ ] Invite or assign quizzes by group.

---

## Session Log

Add new entries at the top. Template:

```
### YYYY-MM-DD — Session N
- Done: P0.1, P0.2
- Verified: tsc ✓ lint ✓ build ✓; manual: header stable on /join
- Notes/blockers: …
- Next up: P0.3
```

### 2026-10-26 — Session 10 (Phase 6 closed, P7.1 to P7.5)
- **P7.5 audit (Lighthouse 13 and axe-core, real Chrome, production build on localhost).** Pages: `/`, `/join`, the lobby (a real quiz, read-only), and, through a **throwaway harness** (deleted; it mounted the real components with a fake signed-in user and a patched `fetch`, because real sign-in needs real credentials), the exam, results, My quizzes, leaderboard, profile and four admin screens. axe ran at 1366 and 390 wide with the WCAG 2.0 to 2.2 A/AA and best-practice rule sets; sign-in and sign-up were axe-checked too.
  - **Found and fixed:** (1) the logo links had `aria-label="Ageno Quiz home"` while the visible text is "ageno quiz by agenoverse" (accessible name must contain the visible text): labels removed (header, footer, admin). (2) Inline links in muted text (sign-in hint, footer, results) were told apart by colour only (contrast with the surrounding text 1.07:1): now always underlined. (3) **The skip link was the last element in `<body>`**, so keyboard users reached it last, and its wrapper sat outside every landmark: it is now the first element, with no wrapper (and no stock colours). (4) One contrast miss (4.16:1, the "(n attempts)" note on the tinted own row of the leaderboard). (5) Heading levels skipped on `/join` (quiz cards were `h3` under the `h1`) and on Reports (chart titles): cards are `h2`, `DistributionChart` takes `as`. (6) **A signed-out visitor got a red 401 in the console on every page** (`/api/auth/session/check` answered 401 when there is simply no session cookie): that case is now a 200 `{ isAuthenticated: false }`; an invalid or revoked session is still a 401 (3 tests). (7) Firebase Auth was started with `getAuth()`, which loads Google's `gapi` script and a ~93 kB hidden iframe on **every page** even for signed-out visitors: `firebase/client.ts` now uses `initializeAuth` with the same persistence and no popup resolver, and Google sign-in passes `browserPopupRedirectResolver` itself (`lib/actions/auth.actions.ts`). Verified: no request to any outside host on `/`, `/join`, `/sign-in`, and the header still resolves to Sign in / Sign up.
  - **Final numbers (after the fixes):** axe: **0 violations** on every page at both widths, no horizontal scroll. Lighthouse **desktop**: accessibility **100** on all ten pages, best practices 96, performance **91 to 99** (home 99, join 97, lobby 97, exam 97, results 92, My quizzes 95, leaderboard 98, profile 94, admin dashboard 91, admin reports 96), CLS **at most 0.05** (exam 0.047, My quizzes 0.05, everything else under 0.02), LCP 0.6 to 1.0 s. **All three targets are met.** Best-practices 96 is the one remaining item (a Chrome DevTools "issues" flag, not looked into).
  - **Mobile (Lighthouse's throttled profile) is not at a good level: performance 59 to 66, TBT 0.8 to 1.3 s, LCP 3.9 to 4.6 s** (accessibility 100, CLS under 0.04). The task's targets only name desktop, so I did not chase it. The final run was done while the machine was short of memory and was stopped by the system before the last page (admin reports, mobile), so those mobile numbers are noisy and I can't say the `gapi` change moved them (an earlier, quieter run had 62 to 70). What the traces show: the time is JavaScript (shared chunks ~100 kB plus the page, 240 kB first load per page) rather than the network; the LCP element waits ~1.4 s for render. **Likely next steps (the "speed plan"):** see what the Node-polyfill `ProvidePlugin` and `*-browserify` setup in `next.config.mjs` adds to every client bundle (the legacy-JavaScript check flags ~12 kB of polyfills), lazy-load Firestore on the pages that don't need it, and re-measure on a quiet machine.
  - **Not covered:** the real exam submit-to-results flow and a real signed-in session (the harness showed the same components with fixtures), Google sign-in and the phone/authenticator two-factor flows after the Auth change (**please try Google sign-in and email sign-in once**), screen-reader use, Firefox and Safari, the sign-in and sign-up pages in Lighthouse (they are still on the old stock palette until P7.6).
- **P7.4 landing page (`app/(public)/page.tsx`, rebuilt):** now a **server component** (prerendered, 2.6 kB page, no auth wait); the only client code is the access-code field (`components/home/HomeCodeForm.tsx` around the existing `JoinCodeForm`). Dark hero with `bg-grid` and one soft teal glow (hidden on phones), a headline with one Instrument Serif italic word ("Take the quiz. See where you *stand.*"), "Join a quiz" (teal) and "Enter code" (jumps to the code card beside the hero, which has the working field). Then: "How it works" (four steps as a ruled strip, not a card grid), "Calm for you, fair for everyone" (three plain facts: the server keeps the time, the answers stay on the server until you submit, an attempt resumes after a reload or lost connection; all verified in Phases 4 and 5), and one amber moment: the community band ("Practice with the Agenoverse community", the campaign line, a link to agenoverse.com/community in a new tab). **Removed the invented numbers** ("500+ students daily", "100+ assessments", "98% completion rate", "10+ institutions"), the purple/blue gradient and the "Learn more" links that went nowhere. The one entrance motion is the CSS-only `rise`. `public/hero-pattern.svg` deleted (unused).
  - **Verified:** `tsc` ✓ `lint` ✓ `build` ✓; 4 new tests (`home-page.test.tsx`: one h1, both calls to action, the code field and sign-in hint, steps in order, safe external link, no numeric usage claims); 239 tests across the 13 non-emulator files pass. **Looked at in real Chrome** (production build, headless screenshots) at 1366 wide and in a 390px frame: no horizontal overflow, the headline on three lines, Join a quiz and the code card above the fold on both. **Not verified:** Lighthouse and axe (that is P7.5), the sign-in hint after a real sign-in, the community link target (it points to `AGENOVERSE_URL` + `/community`, as the footer does).
- **P7.3 admin (third part of this session):**
  - **Shell:** `app/(admin)/AdminShell.tsx` is a dark 64px top bar (logo, "Admin" badge, Dashboard / Quizzes / Users / Reports, Exit admin; the links scroll on a second row on phones) over a light (bone) working area, with a skeleton while auth loads. `AdminPage` no longer sets the light theme itself (the shell does).
  - **Dashboard, Users, Reports** rebuilt on `AdminPage` and the primitives: a `StatStrip` (new in `components/ui`, one card with hairline dividers instead of four boxes), skeletons, designed empty states, errors with Retry, Dialog + toast for every delete. No `alert()` or `confirm()` is left anywhere in the app. Quizzes list and view pages were already done in P6.
  - **Users:** now typed and server-backed. `GET /api/admin/users` (up to 500, newest first, only the fields shown, plus the real total; the page says when it shows fewer) and `PATCH /api/admin/users/[uid]` `{ role }`. The role change sets the `role` **claim and** `users/{uid}.role` together (it used to edit only the profile, so the claim lagged until next sign-in) and, on a demotion, revokes the person's refresh tokens so a still-valid admin token stops working at once (`requireAdmin` checks revocation). You can't change your own role (the page and the server both refuse). Role changes and deletes ask first in a Dialog. Sorting actually works now (the old headers sorted by field names that didn't exist). The "Invite User" button only showed an alert telling people to sign up, so it is gone.
  - **Reports:** the numbers and charts work on the report rows directly (`lib/admin-analytics.ts`, tested). CSV export fixes: quotes were not escaped, and a name or quiz title starting with `=`, `+`, `-` or `@` would run as a formula in Excel (now prefixed with an apostrophe); times are ISO (UTC) and the time taken is in seconds. Integrity counts show as words in one column.
  - **Charts:** the two Chart.js charts drew each distribution twice (a canvas plus a hand-made bar list) in a rainbow palette. Replaced by `components/admin/DistributionChart.tsx`: one teal series, labelled bars with the counts written out, no chart library. Dashboard bundle 313 kB to 241 kB first load.
  - **Settings page removed (a decision; easy to undo from git).** Nothing outside that page ever read `settings/appSettings`, so all seven controls did nothing: "Maintenance mode", "Allow guest attempts" (guests can't take quizzes at all now), "Require verification", "Enable registration", default duration, upload size, site name. Real-looking switches that don't work are worse than no page. The link is gone from the nav; `/settings` is still in the middleware's admin list (so it redirects non-admins and 404s for admins) and the Firestore rules for `settings` are untouched. If you want any of these for real, each needs the matching server-side check.
  - **Deleted as unused:** `components/analytics/*`, `components/common/*` (Loading, ErrorMessage, ImageWithFallback), `components/quiz/ImageUploader.tsx` (the image upload that was never exposed; it is in git if the https-link field is later replaced by uploads), the six old `components/profile/*Settings|Info|Tabs|MessageDisplay` files, `types/quiz.ts`, `toQuizResponse`; and the packages `chart.js`, `react-chartjs-2`, `react-icons`, `framer-motion` (nothing imported them any more; this also covers the P7.6 item "remove framer-motion").
  - **Verified:** `tsc` ✓ `lint` ✓ `build` ✓. Tests: 32 new (`admin-analytics.test.ts` 10: bands, 0%, CSV escaping and formula safety; `admin-pages.test.tsx` 10: users and reports pages; 4 new emulator tests in `admin-api.test.ts`, 36 pass: list, promote, demote with revoked sessions, self/invalid/missing refusals, guard on both new routes). 235 tests across the 12 non-emulator files pass. **Not verified:** how the admin looks (not opened in a browser), 390px width, a real role change against Firebase Auth (the tests mock Auth: check that a demoted test account is signed out of the admin and can't reopen it), a real CSV in Excel, the quiz-editor under the new shell (it should look the same).
- **P7.2 leaderboard and profile (second half of this session):**
  - **Leaderboard ranking changed (a decision; say if you want it otherwise).** It used to multiply the stored score by 1.0/1.3/1.6 keyed on `basic`/`medium`/`hard`, but the stored score is already weighted by the server (and levels are easy/medium/hard), so medium and hard were weighted twice and easy was never matched by "basic". Now the ranking uses the stored `score` as the player saw it (`lib/leaderboard.ts`: `buildQuizBoard`, `buildOverallBoard`). **One quiz:** every attempt, best score first, faster time wins a tie. **Overall:** one row per person, **points = the sum of their best score on each quiz**, so retaking a quiz can only improve it (the old overall board summed every attempt, so repeating one quiz climbed it). Ties: higher average, then who got there first. Per-person "Best time" across different quizzes is gone (it compared unlike things). The "Level" label (Beginner to Master) stays, from quiz and attempt counts only.
  - **Other leaderboard fixes:** the "Basic" difficulty filter matched nothing; it is now Easy/Medium/Hard. Everyone is ranked, the table shows the top 50, and a person below 50 still sees their own place (before they saw nothing). Amber is used for the top-3 rank numbers, the signed-in row and the "Your place" number only. The medal-emoji "Top Performers" cards (they repeated the first three table rows) and `TopPerformers.tsx` were removed. New: `LeaderboardFilters` (segmented time period, selects), `LeaderboardTable` (real table, columns drop away on small screens), `UserRank`, skeleton, empty states (with and without filters), error with Retry.
  - **Known limit:** the server still reads the 100 highest single scores (`lib/server/leaderboard.ts`) and the overall board is built from those, so with many results a person's lower scores can be missing from their points. Fine for today's data (78 results); fix it with a server-side aggregate when the numbers grow.
  - **Profile split:** `app/(user)/profile/page.tsx` 1490 to about 100 lines, sections in `components/profile/` (`ProfileSection`, `EmailSection`, `PasswordSection`, `SecuritySection`, `PhoneMfaSetup`, `TotpMfaSetup`, and `use-profile-action.ts`, which replaces ten copies of the same try/catch). On the design system: `Input`, `Button`, `Badge`, `Alert`, `Card`; per-field validation errors; a nav that scrolls sideways on phones. The authenticator QR code now comes from Firebase's `generateQrCodeUrl` with the issuer "Ageno Quiz" (the old hand-built link said "AgencyQuiz"). **Removed because they did nothing:** the "Request data export" and "Delete account" buttons and the "security log coming soon" box. Account deletion and export are not built; add them as real features if wanted. The page's own redirect is gone (the `(user)` layout does it).
  - **Verified:** `tsc` ✓ `lint` ✓ `build` ✓. 21 new tests: `leaderboard.test.ts` (10: no double weighting, best-per-quiz, ties, 60 people all ranked), `leaderboard-page.test.tsx` (5), `profile-page.test.tsx` (6). 215 tests across the 10 non-emulator files pass. **Not verified:** how either page looks (not opened in a browser), the real MFA flows (phone needs reCAPTCHA and a real number, the authenticator one a real app), the profile on a phone.
- Done: Phase 6 closed (the user said it is done, so P6.2 is ticked; I did not see the admin screens used). **P7.1 `/my-quizzes`** ticked.
  - **Page:** `app/(user)/my-quizzes/page.tsx` rebuilt on the dark surface with tokens and `components/ui`. One stats card (attempts, average, best, last attempt), then a list of rows (`components/my-quizzes/AttemptRow.tsx`): the same layout at every width (title, difficulty badge, date, minutes, score), so there is no 5-column table to collapse. The whole row is one link (one tab stop, 44px+) to the review. Skeleton while loading, a designed empty state ("Find a quiz"), an error with Retry. Amber is used once: a "Personal best" badge on the newest attempt with the top score (needs two or more scored attempts, and a best above 0). The developer text (Firestore index steps, "press F12", the user-ID troubleshooting box) is gone. Stats logic is in `lib/my-quizzes.ts`: a **0% score now counts** in the average and the best (the old filter dropped it); only an attempt with no score at all (a quiz the owner marks) is left out.
  - **Doubled padding:** `app/(user)/layout.tsx` no longer wraps pages in a container (the pages bring their own); its loading placeholder is dark. Leaderboard and profile keep their own containers and light look until P7.2.
  - **Review of one attempt (new):** `GET /api/attempts/[id]/result` (owner only; `getAttemptResult` in `lib/server/attempts.ts`) returns what the submit stored: the questions as they were, the result and (only if it was on at submit time) the review, plus the quiz title. 404 for someone else's or an unknown attempt, 409 `attempt_not_finished` for a running one. Page `app/(user)/my-quizzes/[attemptId]/page.tsx` shows the same screen as right after the quiz: `ResultsView` was split into `ResultsScreen` (the display, also used here) and `ResultsView` (adds Retry and the exit buttons), so nothing in the exam changed. `/api/my-attempts` now has `hasResult` (true when the response was written by an attempt); results saved before attempts existed show in the list without a link.
- Verified: `tsc` ✓ `lint` ✓ `npm run build` ✓. Tests: 12 new unit/component (`my-quizzes.test.ts`, `my-quizzes-page.test.tsx`: the 0% case, links, the personal-best badge, empty, error and Retry, no developer text), 4 new emulator tests in `attempts-api.test.ts` (45 pass: owner-only, unfinished refused, editing the quiz afterwards doesn't change the review, no key when the review was off, `hasResult`), `exam-logic` and `quiz-attempt` (80) unchanged and passing.
- **Not verified (needs you):** how it looks (not opened in a browser: needs a signed-in account with real attempts), 390px width, the review page for an old result (should say it can't be found, no link is offered), a screen reader.
- Next up: P7.6 (finish the palette: the four `(auth)` pages, the two `(dev)` pages and the `<body>` classes in `app/layout.tsx`; then wipe the stock Tailwind colours).

### 2026-10-26 — Session 9 (Phase 6)
- Done: P6.1, P6.3, P6.4, P6.5 ticked. P6.2 built, left unticked until the user has used it. **Also fixed a privilege-escalation hole found on the way (deploy this first).**
  - **Security fix, `POST /api/auth/user`:** it took `uid` and `role` from the request body and only checked that *some* ID token was valid. Any signed-in person could post `{ uid: <own>, role: "admin" }`, which set the admin claim and the `users` role, and then passed every admin check. Now the uid comes from the verified token (a different uid is a 403), the role is never read from the caller (new profiles are `user`, existing ones keep theirs), and email/verified come from the token. Tested against the emulator; the old route fails those tests for the right reason (the role became `admin`). Nothing in the app used the `role` argument. **I did not check whether it was ever exploited:** worth a look at who has the admin role in `users` (14 users in the database today).
  - **Where admin data goes now: server routes, like players.** New `/api/admin/*` routes (Node runtime, Admin SDK, guarded by `requireAdmin` in `lib/server/admin-access.ts`: a valid unrevoked ID token whose owner has the `admin` claim or `users/{uid}.role`; 401/403 otherwise). `middleware.ts` lists `/api/admin` as a path that checks tokens itself. Browser side: `lib/admin-api.ts`.
    - `GET/POST /api/admin/quizzes`, `GET/PUT/DELETE /api/admin/quizzes/[quizId]`, `DELETE /api/admin/users/[uid]`, `GET /api/admin/reports`, `GET /api/admin/stats`. Logic: `lib/server/admin-quizzes.ts`, `admin-users.ts`, `admin-reports.ts`.
  - **P6.1 schema.** Only shape written: `quizzes/{id}` + `questions_{easy|medium|hard}`, each question `{ text, options: [{ text, isCorrect }], points: 1, type: "single", order, imageUrl?, explanation? }`. This is what the live data and the player routes already used (read-only survey of production: 2 quizzes, both fully on it; no legacy `questions` collection, no `explanation` anywhere). `lib/quiz-schema.ts` is the one description (types, validation used by both editor and server, legacy handling, import/export); `lib/quiz-writes.ts` plans the writes. Questions now keep an `order`; `loadQuestions` sorts by it (unnumbered ones keep id order, as before). Legacy quizzes: a legacy question that names a `difficulty` belongs to that level, one that doesn't was shown at every level and is copied to each; the player route and the editor both follow this rule now. `npm run migrate:questions` (dry run; `-- --apply` to change) moves them for good (new dev dependency `tsx`); an admin save also moves a quiz's legacy questions. The edit page used to read and write only the legacy collection, so editing a quiz made on the create page showed it empty and saved questions players never see: gone with the page.
  - **P6.2 editor.** `components/admin/quiz-editor/` (QuizEditor, DetailsSection, LevelsSection, QuestionCard, ImportDialog, editor-state; every file under 400 lines) serves both `quizzes/new` and `[quizId]/edit`. **Deviation:** not built on `QuizForm`: nothing imported it, it kept two copies of the questions in state, and it used the old palette; it was deleted. Decisions: (1) the per-question **Points** box is gone: scoring has always counted every question equally, so the box did nothing. (2) the **multiplier is at least 1** (the scorer ignores anything lower, while the lobby would have shown it). (3) **images are an https link**, not an upload: nothing ever exposed the old uploader, and Storage rules are unchecked; `ImageUploader.tsx` is kept, unused, for that follow-up. (4) JSON **import/export** per level (the export imports back). (5) New: the explanation field (the results review already showed it), "listed on /join" and "open for attempts" switches, an unsaved-changes warning, and "someone else saved first" detection. The quiz list, view page, dashboard and users page lost their `alert()`/`confirm()` for deletes (Dialog + toast); the rest of their restyle is still P7.3. The admin pages sit in `data-theme="light"` via `components/admin/AdminPage.tsx` for now.
  - **P6.4 atomic writes.** A create is one batch; a save is one transaction that reads the quiz, checks the `updatedAt` the editor opened (409 `quiz_changed` if someone saved since; two saves from the same version: one wins, tested), keeps the access code unique (409 `access_code_taken`), writes only the questions that changed, removes deleted questions and dropped levels, and empties the legacy collection. **Size:** a Firestore transaction holds 500 writes. A **create** that needs more (a bulk import) is written in chunks, questions first and the quiz document last, so nobody sees a half-built quiz, and a failed chunk is taken back. A **save** of an existing quiz stays all-or-nothing, so one that needs more than 500 changed documents is refused up front (400 `too_many_changes`, nothing written); only changed questions count, so a typical edit is a handful. (Splitting an edit would leave players with a mix of old and new questions.) **Deleting a quiz** removes its questions (all collections), every result with its `answers`, and attempts, then the quiz document last (so a failed run can be repeated); the delete dialog says how many results go. **Deleting a user** removes the Auth account (before: only the profile doc, so they could sign straight back in), profile and sub-collections, attempts and activity log; refuses yourself and the last admin. **Decision: their finished results are kept.** Once the profile is gone a result holds only an opaque user id (no name, no email), so it is pseudonymous rather than personal data, and the quiz statistics and leaderboard stay correct; they show as an unknown user. Deleting results too would silently change other people's rankings.
  - **P6.5 queries.** Dashboard: counts and the average score are aggregation queries (no documents read), plus 5 recent quizzes and the latest 50 results (the charts used to run on 5). Reports: one page of up to 500 results (default 200, newest first, `cursor`), only the fields the screen uses (not the integrity events), quiz titles and names resolved in one batch per page; "Load older results" appends and the page says when the numbers cover only the loaded results. `getUserQuizAttempts` and the full-collection "debug" read were already deleted in Session 7. Deleted the unused `ScoresByDifficultyChart` (it read every response from the browser). The quiz filter on reports is now server-side (`?quizId=`, with that quiz's own total and paging); it uses the composite index `quizId` + `submittedAt`, which **already exists in production**. `firestore.indexes.json` is now in the repo and holds all 4 live indexes (read from the project with `firebase firestore:indexes`), so a future `firebase deploy --only firestore:indexes` can't remove any; if an index were missing the page says so and falls back to all quizzes. The date range still filters the loaded results. Results with no `submittedAt` are not listed (Firestore leaves them out of an ordered query); none exist today.
  - **P6.3 deleted:** `QuizForm`, `CreateQuizForm`, `DifficultySettings`, `firebase/quizDifficulty.ts`, `services/quizService.ts`, `hooks/useQuiz.ts`, `components/examples/AuthStatus` and `components/debug/AuthDebugger` (and its use in the dev test page), plus what only they used: `hooks/useFirestore`, `useCollection`, `useDocument`, `components/UserManagement` and `components/user-management/*`. Still unused and left alone: `components/analytics/{AttemptDetails,QuizMetrics,QuizVisualizations,QuizReportsWithVisualizations}` and `ImageUploader` (P7.3 will use or remove them).
- Verified: `tsc` ✓ `lint` ✓ `npm run build` ✓ (real `.env.local`; the new routes are dynamic). Tests: 182 unit/component (new: 22 schema, 19 editor; the rest unchanged and passing), **32 admin integration tests on the emulator** (guard on every route, create/open/save/delete, stale and racing saves, legacy move, the 500-write limit, user deletion, the registration fix, reports and dashboard, migration), 41 attempts and 20 rules tests still passing. The registration tests were run against the old route to confirm they catch it. Editor looked at in real Chrome through a throwaway harness page with a fake API (deleted): 1366×768 and 390×844, no horizontal overflow, problem list and the broken question highlighted. New command: `firebase emulators:exec --only firestore --project demo-ageno-admin "npx vitest run __tests__/admin-api.test.ts"` (the Firebase CLI here is the global one, not `npx`).
- **Not verified (needs you, after deploying):** a real admin session creating (including a quiz with a few hundred questions), editing (change a question, add a level, save twice in two tabs) and deleting a quiz, then taking it as a player; the list and view pages with real data; deleting a test user; the dashboard and reports with the 78 real results (and their speed); the migration script against production (it would report nothing to do: run it without `--apply` to see). The admin screens' look is old-style in places until P7.3.
- Notes: `.env.local`'s key value starts with a space before the quote; Next and Node's env loader cope, a hand-rolled parser doesn't. `/auth-test` and `/useauth-test` still exist (404 in production by design). Role changes on the Users page still only edit the profile doc (the claim catches up at next sign-in); a server route for it would fit P7.3.
- Next up: deploy and check (above), tick P6.2 and close Phase 6, then Phase 7 (P7.1 My quizzes first).

### 2026-10-26 — Session 8 (Phase 5 closed)
- Done: Phase 5 is closed. P5.4, P5.5, P5.6, P5.7 and P5.9 are ticked, so P5.1–P5.9 are all done.
  - **What happened since Session 7:** the user pushed `d4b3bb2`, Vercel deployed it, the user checked the app and reported that it works, and then deployed the strict `firestore.rules`.
  - **What I verified myself (read-only):** the live ruleset is `1fe269e9-5319-4277-a69f-dcbb5ae4f4ee` (released 2026-10-26 02:17 UTC), it is **identical to `firestore.rules` in the repo**, and anonymous requests to quizzes, users, responses, attempts and a question list (the answer key) all return 403. Rollback target if ever needed: the interim ruleset `58ee6f53-dc81-4c72-83a6-8f45b1cc3e79`.
  - **What the user checked:** their report is that the deployed app works with the strict rules live. I did not get a per-screen list, so these specific things are **not individually confirmed**: a phone, a strict-mode quiz showing fullscreen exits and focus loss in the admin reports, and the "Window focus lost" line on the results. If any of them misbehaves, it is a bug to fix in a later session, not an open Phase 5 task.
  - **Phase 5 "Done when", one by one:**
    1. *No answer data reaches the browser before submit:* the lobby and attempt responses carry no key (tested against the emulator and a production build), and the key can't be read from Firestore either (403, live).
    2. *A forged `addDoc` to `responses` is denied:* the live rules allow no create or update on `responses` or `answers` (20 rules tests, rules confirmed identical to the repo).
    3. *A late submit is rejected:* a submit after deadline + 30s is not read; the attempt is finished from the last autosave and marked `late` (server tests).
    4. *Non-admins are redirected away from admin routes without client JS:* the admin layout is a server component that verifies the session cookie and role; a forged `session` + `user_role=admin` cookie pair was refused against a production build.
- **Carried over from Phase 5 (nothing here blocks Phase 6):**
  - **Decision pending, P5.3:** show the raw percentage as the headline score, or keep the weighted one? Both are stored (`rawPercent`, `score`). Recommendation: raw % as the headline with the multiplier shown as separate points. The leaderboard's own 1.0/1.3/1.6 weighting on an already-weighted score should be fixed in the same change (`lib/leaderboard.ts`, P7.2).
  - **Rate limiting:** `POST /api/quizzes/resolve` and `POST /api/attempts/start` have none, and codes are 5–6 capitals and digits. Belongs with the operations work (a shared store such as Upstash, since serverless instances don't share memory).
  - **Speed plan** (discussed in Session 7's chat, not started): put the Vercel function region next to the database (`eur3`, so `fra1`), measure with `Server-Timing`, keep the exam's functions warm, cache question sets briefly, store question counts on the quiz document, turn on the Firestore offline cache. The leaderboard and My quizzes part is already done.
  - **Operations, not scheduled:** an automated test run on every push (there is still no `npm test`), error monitoring, Firebase App Check, Firestore backups, a committed `firestore.indexes.json`.
  - **Known loose ends:** `/my-quizzes` and the leaderboard still use the old light styling (P7.1/P7.2); the admin screens still use alert()/stock colours (P7.3); `services/quizService.ts` and `hooks/useQuiz.ts` are dead code (P6.3); a tab left open on a pre-Session-7 version can't submit and needs a reload.
- Verified: nothing was changed in the app this session (docs only), so `tsc`/`lint`/`build`/tests from Session 7 stand. The only checks were the read-only rules comparison above.
- Next up: Phase 6, starting with P6.1 (one question schema). Read the admin create/edit pages first: `quizzes/new` writes `questions_{difficulty}`, while the detail and edit pages still read and write the legacy `questions` collection, and the server reads `questions_{level}` and falls back to the legacy one.

### 2026-10-25 — Session 7 (Phase 5, continued)
- Done: P5.2 and P5.3 ticked (the user took a real quiz on the deployed build and it worked). P5.8 done. P5.4, P5.5, P5.6, P5.7 and P5.9 built and tested, **not deployed**. A dependency security update (Next 15.5.28) is in Session 6's log below.
  - **One idea ties P5.4 and P5.5 together: players no longer read Firestore.** Everything a player reads goes through small server routes, none of which ever returns an access code, an email or an answer key; then the rules can deny the browser everything except a person's own profile.
    - **New routes (`lib/server/*`, Admin SDK):** `GET /api/quizzes` (public list: switched on and `isPublic !== false`), `GET /api/quizzes/[quizId]` (one quiz + question counts; replaces the old `/summary` route), `POST /api/quizzes/resolve` (access code → quiz id; tries the code as typed, upper and lower case), `GET /api/leaderboard`, `GET /api/my-attempts`. The first two are briefly edge-cached (`s-maxage=30`) and the browser sends no token to them; the rest are private. Browser side: `lib/api-client.ts` (`apiRequest`), `lib/quizzes-api.ts`, `lib/exam/api.ts`.
    - **P5.4:** quizzes live at `/q/<quizId>` (`app/(quiz)/q/[id]`); `app/(quiz)/[code]` is now a small resolver that turns an old `/<CODE>` link into `/q/<id>` and remembers the code for the session. `PublicQuiz` (`lib/quiz-data.ts`) is the shape players get: **no access code, no owner, no answer settings**. `startAttempt` checks the code (`access_code_required` / `access_code_invalid`, case and spaces ignored) when the quiz needs one; the lobby only forwards what was typed and shows the server's answer inline. `/join` no longer lists codes, can't search by code, and its code box asks the server. Open quizzes (`requiresAccessCode: false`) and quizzes with no code stored need none.
    - **P5.5:** `firestore.rules` rewritten (final): `users` own profile or admin only; `quizzes` and everything under it admin only; `responses` and `answers` readable by their owner or an admin and **never writable from a browser** (admin may delete); `attempts` denied; `settings` admin; `userActivities` unchanged. 20 emulator tests (`__tests__/firestore-rules.test.ts`, now in the repo) cover what must keep working (profile, own results, admin screens) and every attack from the audit.
    - **Leaderboard and My quizzes** were rebuilt on the server routes (needed for the rules, and also the main speed fix for those two pages): the leaderboard page used to fetch every name and title one by one and **re-fetched the whole board each time a name arrived**; now it is one request. The ranking logic is unchanged, moved to `lib/leaderboard.ts`. Other people's names come as the name they chose or `User xxxxxx`: **the email-prefix fallback is gone** (it exposed part of people's emails).
    - `firebase/firestore.ts` is now types only; `getActiveQuizzes`, `getQuizById`, `getQuizByCode`, `getUserQuizAttempts` are deleted. `utils/difficulty-helpers.ts` accepts any quiz-like object (`QuizTiming`). `SafeQuizLoader` and `AuthStateHandler` are deleted.
  - **P5.6:** `app/(admin)/layout.tsx` is a server component. `lib/server/admin-access.ts` verifies the session cookie (revocation included) and the role (claim or `users/{uid}.role`) and redirects anyone else before anything renders; the old client layout became `AdminShell`. `middleware.ts` was rewritten: real admin paths are checked **first** (they used to match the "6+ letters = quiz code" rule and were open), `/leaderboard` and `/quiz/join` are no longer public, and the old-link rule is capitals and digits only (`/profile` was accidentally public). The `user_role` cookie is only a hint; the server check does not read it.
  - **P5.7:** **decision (say if you want it changed): starting an attempt needs sign-in, everywhere.** The lobby is open to everyone; a signed-out visitor sees "Sign in to start" (brings them back to the same quiz). `(user)/layout.tsx` lost its mobile and timeout leniency. Guests are gone from the server too (`anonymous` responses are no longer created); old guest responses stay in the data and just show as anonymous. `?redirectTo=` only follows paths on this site (`safeRedirectPath`; the sign-in page used to follow any URL).
  - **P5.8:** `lib/dev-routes.ts`: `/auth-test`, `/useauth-test` and `/api/auth/session/debug` return 404 in production unless `ENABLE_DEV_ROUTES=true` is set on purpose (middleware, the `(dev)` layout and the debug handler each check). The debug endpoint was public and listed cookie names and session details.
  - **P5.9:** the browser reports numbered events (`tab_hidden`, `window_blur`, `fullscreen_exit`) with the autosave and the submit, keeps unsent ones across a reload, and continues the numbering after a resume. `applyEvents` (`lib/exam/integrity.ts`) stamps them with the server's time, ignores repeats by number, caps storage at 500 (counts continue) and **derives the counts itself: a count sent by the browser is ignored**. Late submits' events are not read, like their answers. The response gets `tabSwitchCount`, `blurCount`, `fullscreenExits` and `integrityEvents` (only when there is something to report). The results screen shows what the server recorded (including "Window focus lost"). The camera stub is gone: the admin reports' "Camera Issues" column became "Left Fullscreen" and "Focus Lost", and new responses no longer carry `cameraFlags`. Transition note: a browser tab still running the previous version sends counts instead of events, which are ignored (that attempt's counts show 0).
  - **Decisions and things to know:** (1) sign-in required (above). (2) A blur also fires when the tab is hidden, so one tab switch normally records both; they are counted separately on purpose. (3) Access codes are 5–6 characters of capitals and digits, so they can be guessed by trying many; `/api/quizzes/resolve` and `start` have **no rate limit yet** (planned with the operations work). (4) The leaderboard's own score weighting (1.0/1.3/1.6 on an already-weighted score) is unchanged and should be fixed together with the raw-vs-weighted decision (P5.3/P7.2). (5) `/quizzes` (admin) and `/q/` (players) are different paths on purpose.
  - **Verified:** `tsc` ✓ `lint` ✓ `npm run build` ✓ (Next 15.5.28; `/dashboard` is now dynamic; the lobby page is 23 kB lighter without the Firestore browser SDK). Tests: 38 logic (event rules, scoring, normaliser, seed, storage), 42 component, 59 access-control (middleware, admin check, dev routes, redirect helper), 41 server integration against the emulator (public routes never leak a code, access-code checks, sign-in required, events, leaderboard, my attempts, plus everything from Session 6) passing two runs in a row, 20 rules tests. Mutation checks: weakening the admin gate and the late-submit and key-leak guards each make tests fail. **Real production build, real Firestore, read-only requests:** the quiz list and lobby payloads contain no access code or owner; start, leaderboard and my-attempts refuse without a sign-in; `/dashboard`, `/leaderboard`, `/profile` redirect to sign-in; a forged `session` + `user_role=admin` cookie pair is still refused by the server check; the two debug routes return 404. Nothing was written to production.
  - **Not verified (needs you, after deploying):** a real admin login reaching the admin screens (create, edit, delete a quiz; Settings; Reports with the new columns); joining by card and by code (including a code-protected quiz, and a wrong code); an old `/<CODE>` link; the sign-in redirect round trip from the lobby; the leaderboard and My quizzes with real data and their speed; a phone; a strict-mode quiz showing fullscreen exits and focus loss in the reports.
  - **Deploy order and checks (important):**
    1. Commit and push so Vercel deploys the app. The interim rules are still live, so everything works during this step.
    2. Check as a normal user: `/join`, open a quiz card, join by code (right and wrong), take a quiz, reload mid-way and resume, submit, Retry, leaderboard, My quizzes. Then as an admin: dashboard, create/edit/delete a quiz, users, reports, settings. Then signed out: the lobby shows "Sign in to start"; `/dashboard` sends you to sign-in.
    3. Only then deploy the rules: `firebase deploy --only firestore:rules --project ageno-quiz-af3ff` (rollback target: the interim ruleset `58ee6f53-dc81-4c72-83a6-8f45b1cc3e79`).
    4. Repeat the checks in step 2. If an admin screen shows empty data or a permission error, roll the rules back and tell me which screen.
  - **Browsers still open on the previous version** will fail to submit once the rules are live (they write `responses` directly): ask people to reload, or deploy at a quiet time.
- Next up: after the checks, tick P5.4–P5.7 and P5.9, mark Phase 5 Done, then Phase 6 (data layer cleanup). The performance work discussed in the session (region, caching, warm functions) is still to schedule; part of it (the leaderboard and My quizzes) is already done here.

### 2026-10-25 — Session 6 (Phase 5)
- **Later in the session: P5.2 and P5.3 implemented, tested, not yet ticked** (they need the user's check with a real quiz on a deployed build; same convention as Sessions 3–4). Summary of what changed, then the design decisions to review.
  - **New server code (Node runtime, Admin SDK):** `app/api/attempts/start` (POST), `app/api/attempts/[id]` (GET resume, PATCH autosave), `app/api/attempts/[id]/submit` (POST), `app/api/quizzes/[quizId]/summary` (GET, question counts only); logic in `lib/server/attempts.ts`, helpers in `lib/server/request.ts`; `middleware.ts` lists `/api/attempts` and `/api/quizzes/` as public paths (the routes verify the Bearer ID token themselves; no header = guest).
  - **Shared pure code:** `lib/exam/types.ts` (the wire types and `AttemptSeed`), `lib/exam/normalize.ts` (stored question → question with key), `lib/exam/scoring.ts` (**the one scoring function**, server only), `lib/exam/seed.ts` (server attempt → seed, corrects clock skew), `lib/exam/api.ts` (browser calls), `lib/quiz-data.ts` (`quizFromData`, field defaults shared by the browser converter and the server).
  - **Browser changes:** `useQuizLoader` now loads the quiz doc and question *counts* (no questions); `client.tsx` Start/Resume/Retry call the routes; `useQuizAttempt` submits through the API and autosaves to the server 2s after the last change (and still to the device); `QuestionView`/`Navigator` take `ExamQuestion` (options are plain strings, no key); `ResultsView` and `QuestionReview` render the server's result and review; `SubmitDialog` shows the server's reason; `lib/exam/answers.ts` no longer knows what is correct. **Deleted** from `firebase/firestore.ts`: `submitQuizResponse` (and its client-side scoring, the "rebuild questions from the user's own answers" fallback and the 1.5/2.0 default multipliers) and `getQuestionsByDifficulty`; `getQuizByCode`/`getQuizById` no longer read questions at all.
  - **How an attempt works now:**
    - **Start** (`POST /api/attempts/start {quizId, difficulty}`): checks the quiz exists, is active and has the level; copies the level's questions (with their key) into `attempts/{id}` together with the deadline (server clock), `autoCheck`, `showAnswerReview` and the multiplier as they are *now*; closes this person's earlier unfinished attempt at the same quiz; returns the questions **without** the key. The attempt doc has no client rule (default deny), so only the Admin SDK touches it.
    - **Autosave** (`PATCH`): replaces answers and flags with what the browser holds (only the attempt's own question ids, only whole in-range option numbers), counters only go up, refused after deadline + 30s.
    - **Submit** (`POST .../submit`): one transaction. Scores, writes `responses/{attemptId}` (the same fields the leaderboard, my-quizzes and admin reports read, plus `rawPercent`, `correctCount`, `totalQuestions`, `answeredCount`, `pointsMultiplier`, `attemptId`, `late`) and `answers/{questionId}`, marks the attempt submitted and stores the result. A second submit returns the stored result (exactly once, also under a race). The review (right option + explanation per question) is only in this response, and only when the quiz is auto-checked and `showAnswerReview` isn't false.
    - **Resume** (`GET`): the browser keeps `ageno:quiz:attempt:<quiz>:<uid>` as a pointer plus its freshest answers; resume fetches the server attempt (questions, clock) and prefers the device's answers. An attempt saved by the old version (client-made id) gets a 404, is dropped, and the lobby says "That attempt has already ended" — one-time and harmless.
  - **Decisions I made (say if you want any changed):**
    1. **Late submit.** "Rejected" is implemented as: a submit arriving later than deadline + 30s is **not read**; the attempt is finished from its last autosave, `late: true` is stored and shown ("only the answers saved before then counted"). Losing a whole exam to a dropped connection seemed worse than counting what was already saved. Autosave is refused after the same cutoff, so nothing can be added late.
    2. **Guests.** Still allowed (userId `anonymous`); the attempt id acts as the secret. P5.7 decides whether guests stay.
    3. **Snapshot per attempt**, so editing a quiz mid-attempt can't change what someone is scored on. Limit: **400 questions per level** (a Firestore transaction holds 500 writes and the doc 1 MB); beyond that start returns `too_many_questions`.
    4. **Questions with no answer key** (data names no right option) are never counted right, instead of silently treating option 0 as right (the old fallback did). All 3 real quizzes have a key on every question.
    5. **Multiplier:** the lobby's `getDifficultyMultiplier` (1.0 when a level has none) is now the only source, so the lobby, results and stored score agree. Existing stored scores are untouched.
    6. **Raw vs weighted (P5.3 decision, still open):** both are stored (`rawPercent`, `score`), the screen still shows the weighted `score` with the plain "counts as" note. Recommendation unchanged: show the raw % as the headline and keep the weighted points separate. Say the word and it's a small change.
  - **Verified:**
    - `tsc` ✓ `lint` ✓ `npm run build` ✓ (placeholder `FIREBASE_*`; the four new routes are listed as dynamic).
    - **69 unit/component tests** pass (`exam-logic`: normaliser, scoring, clock skew, storage; `quiz-attempt`: the exam against a fake server that scores with the real function: nothing in the page names the right answer while taking, double submit, failure + retry with the server's reason, late notice, review from the server's answers, autosave to the server, retry error).
    - **28 integration tests** (`__tests__/attempts-api.test.ts`) run the real route handlers against the Firestore emulator and pass three runs in a row: no key/explanation in start or resume responses, clock and duration, guest and bad-token handling, one live attempt per person, ownership (404), answer sanitising, counters only up, grace cut-off, server scoring and multiplier, forged body fields ignored, exactly-once (sequential and racing), late submit, editing the quiz mid-attempt, hand-checked quiz, review off, response and answer docs. Mutation check: leaking the key and ignoring lateness each make tests fail.
    - **Real data, read-only:** all 3 quizzes (per-level questions, all keyed) go through the normaliser cleanly; a dev server on a spare port returned the real counts for a real quiz, and the middleware lets the new routes through (400/401/404 for bad calls, as designed). **Nothing was written to production.**
  - **Not verified (needs you):** taking a real quiz end to end in a browser against a deployed build (start → answer → reload → resume → submit → score → review → retry), as a signed-in user and as a guest on mobile, a strict-mode quiz, the 5-min/1-min warnings after the change, and the Vercel runtime itself. `FIREBASE_*` env vars must be set on Vercel (the session route already needs them).
  - **Still open for P5.2's "Done when":** the Network tab no longer shows questions from the app, but `quizzes/*/questions_*` is still publicly readable in Firestore (interim rules), so someone calling Firestore directly can still read the key. P5.5 closes that and also denies client writes to `responses`; **deploy the app first, check a real quiz, then ship the strict rules** (old browsers still open on the previous version would fail to submit once those rules are live).
  - **Dependency security update (after the user's Vercel build failed with "Vulnerable version of Next.js detected"):** `next` and `eslint-config-next` 15.3.1 → **15.5.28** (pinned; the latest patch of the 15.x line, the `backport` tag), `react`/`react-dom` → 19.3.1, then `npm audit fix` (no `--force`), which took `npm audit` from 34 to 22 findings (production deps: 17). Re-verified on the new stack: `tsc` ✓ `lint` ✓ `build` ✓ (Next 15.5.28), 69 unit/component tests ✓, 28 emulator tests ✓. **Not done on purpose:** Next 16 (a major migration: the webpack polyfill config in `next.config.mjs`, `next lint` and `middleware` all change; do it as its own task), `firebase-admin` 13 → 14 and `vitest` 4 → 5 (major bumps; the vitest ones are dev-only). What is left in `npm audit` is those majors, the `firebase` client's bundled gRPC (npm offers no non-breaking fix), and PostCSS inside Next (build-time, only matters for untrusted CSS, which this app never processes). Not verified: that Vercel accepts 15.5.28 (it can't be checked from here).
  - **Housekeeping:** `firebase.json` now runs the emulator on 8181 (8080 was taken here). On Windows `emulators:exec` leaves `java.exe` running; stop it before the next run (noted in `CLAUDE.md`). `.gitignore` ignores the emulator logs. `CLAUDE.md` updated for the new flow.
- Done earlier: P5.1 (audit only; nothing was deployed or changed in Firebase).
  - **How the live rules were read:** `admin.securityRules().getFirestoreRuleset()` with the `FIREBASE_*` credentials in `.env.local` (project `ageno-quiz-af3ff`). It is read-only and returns the currently released ruleset. To repeat it, run a short Node script that initialises the Admin SDK and prints `rs.source[0].content`. Released ruleset `943b96b5-…`, created 2025-06-08. The repo has no `firebase.json`, so the rules are deployed by hand from the console; `firestore.rules` in the repo is **not** what is live.
  - **What is live:** the file is ~280 lines of commented-out earlier attempts, then one active block headed "testing new rules". Only that block counts.
  - **Findings, worst first** (all in the active block):
    1. **`responses` is open to forgery.** `allow create: if true` means anyone, signed in or not, can write a response with any `score`, `userId` or `quizId`, and `answers/{id}` is `create: if true` too. `allow write: if isAuthenticated()` on `responses/{document=**}` lets **any signed-in user update or delete anyone's response**, so a user can overwrite or wipe the leaderboard and other people's results. `read: if true` makes every response, with its answers, public.
    2. **Any signed-in user is effectively an admin for quizzes.** `quizzes/{id}`: `allow write: if isAuthenticated()`. They can create, edit or delete any quiz. The wildcard `/{subCollection}/{docId}` rule (`read: true`, `write: isAuthenticated()`) covers `questions`, `questions_easy|medium|hard` and `responses` under a quiz: anyone can **read every correct answer** without logging in, and any signed-in user can **change the answers**.
    3. **Anyone on the internet can read every user document** (`users/{id}`: `allow read: if true`). That is emails, roles and `activityLogs`. The scoped version sits in a comment.
    4. **Self-promotion to admin.** `users/{id}` `create: if isOwner(userId)` has no field limits. The client creates its own user doc (`auth.actions.ts:103,331`, `role: "user"`), but a person using the public Firebase config can write `role: "admin"` themselves first. `isAdmin()` reads that doc, so they pass every admin check (including the rules that do exist for admins). Blocking `role`/`customClaims` on **create** closes it.
    5. **Dead or missing rules.** No rule covers `settings/appSettings` (the admin Settings page, `settings/page.tsx:45,71`) or `attempts` (`components/UserManagement.tsx:121`); with default deny those reads and writes fail from the browser today. `quizCompletions` and `sessions` have rules (or used to) but no code writes to them (`quizCompletions` isn't used at all). `submissions` appears only in `services/quizService.ts` (dead code).
    6. Minor: `responses` has two overlapping matches (`/{responseId}` and `/{document=**}`); rules OR together, so the loose one wins. Guests are **not** Firebase-authenticated (`userId` is the string `"anonymous"`, `firestore.ts:388`), so a guest can create a response but can't retry a half-written one (`update` needs auth). A signed-in user can, which settles Session 5 note 1.
  - **Repo `firestore.rules` vs live:**
    - The repo file is much stricter (admin-only quiz writes, owner-only user reads, no public answers) but written for an older data model: it covers only `quizzes/{id}/questions` and `quizzes/{id}/responses`.
    - The app writes **top-level `responses`** and reads **`questions_{easy|medium|hard}`**, and neither has a rule in the repo file. **Deploying `firestore.rules` as it is now would break quiz taking (submit), the leaderboard, my-quizzes and the admin reports**, and players would get no questions.
    - It also mixes `isPublic` (quiz read) with `isPublished` (response create), so the response create would fail for any quiz without `isPublished`.
    - The leaderboard reads other users' docs; the repo rule (owner or admin only) would deny that.
  - **Consequence for ordering:** the plan puts P5.5 (rules rewrite) after P5.2 (server-side attempts) on purpose. The strict rules can only ship once players stop touching `questions_*` and `responses` from the browser. Until then the live app depends on the loose rules.
  - **Follow-up, same session (P5.1b): interim lockdown written and tested, NOT yet deployed.** `firestore.rules` in the repo is now the interim ruleset (header comment explains its limits), plus a new `firebase.json` (rules path and the Firestore emulator) so `firebase deploy --only firestore:rules --project ageno-quiz-af3ff` works from the repo. What it does:
    - `quizzes` and every subcollection: read stays public (join page, lobby), write is admin only.
    - `users`: read needs sign-in (was public); self-registration can't set `role` or `customClaims.role` to anything but `user`; the update rule is unchanged in effect; delete admin only.
    - `responses`: read needs sign-in; create only as yourself (`userId` must be your uid, or `"anonymous"` for guests) with a score that is null or 0–100; the owner can rewrite the same doc on a retry but not change `score`, `quizId` or `userId`; delete admin only. `answers` can only be written by the response's owner (or an admin).
    - `settings`: admin only (fixes the admin Settings page). `userActivities` unchanged. `quizCompletions` and `sessions` (unused) are dropped, so they are default deny.
    - **Still open until P5.2/P5.5:** questions (with the answers) are readable by anyone, and a player can create a response for themselves with any score from 0 to 100.
    - **Behaviour changes to expect:** a guest (not signed in) can no longer read the leaderboard or `users` (it was public before; desktop guests are redirected to sign-in anyway, mobile guests skip that check until P5.7). Guests can still take a quiz and submit, but their retry after a half-written submit is still refused (as before).
    - **Tested** in the Firestore emulator with `@firebase/rules-unit-testing` (throwaway project in the scratchpad, not in the repo): 51 checks pass, covering guest, player, admin via the `role` claim and admin via the `users` doc: the app's real operations (register, profile update, quiz CRUD by admin, submit, null score, retry rewrite, answers, leaderboard and my-quizzes reads) and the attacks from the audit (forged response as someone else, score over 100, raising your own score, deleting or editing others' responses, writing questions or quizzes, self-promotion to admin on create and update, anonymous reads of users and responses, reading settings).
    - **Deployed by the user** (`firebase deploy --only firestore:rules`; my own attempt was blocked by the harness's production-deploy guard). Confirmed afterwards by re-reading the released ruleset: `58ee6f53-dc81-4c72-83a6-8f45b1cc3e79`, 2026-10-25 02:52 UTC, and anonymous REST reads now return 403 for `users`, `responses` and `settings` while `quizzes` still returns 200. The user checked by hand: sign-in, leaderboard, quiz attempts and my-quizzes all work. Rollback target if ever needed: `943b96b5-7363-4e3e-a7ae-8397a95c5cd2`. Not checked by hand: admin quiz create/edit/delete and the Settings page, sign-up of a new account, a guest submit.
    - The user noticed `/my-quizzes` briefly showing the sign-in screen before loading. That is the existing client-side auth wait (not the rules); fix with P5.7/P7.1.
  - **Original decision text (superseded by the above):** an **interim lockdown** that keeps the current app working while closing the worst holes. Candidate changes, each one compatible with today's client code: (a) `quizzes` and its subcollections: write only for `isAdmin()`; (b) `responses`: keep `create`, drop `update` and `delete` for non-admins (this breaks only the guest and retry-after-partial-failure edge, which already fails for guests); (c) `users`: forbid `role` and `customClaims` on create, and limit public read to the leaderboard fields; (d) add `settings/{doc}` for admins. It would **not** stop answers being read (needs P5.2) or `create` forgery on `responses` (needs P5.2). Because it edits the production database's rules it needs the user's go-ahead and a quick check by an admin account (create, edit and delete a quiz; sign up; submit; leaderboard).
- Verified: audit only. Read the released ruleset through the Admin SDK (not the console UI) and grepped every `collection(`/`doc(` call to match code against rules. No code changed, `tsc`/`lint`/`build` not needed. **Not verified:** actual behaviour of the rules in the emulator or against live data (no forged write was attempted on production, by design).
- Notes/blockers: the Phase 4 real-quiz check is still pending. The audit does not depend on it, but P5.2 will change the same submit path, so a pass over a real quiz first would give a clean baseline.
- Next up: deploy, check a real quiz, tick P5.2/P5.3, then P5.4 and P5.5 (see the header).

### 2026-10-23 — Session 5 (Phase 4)
- Done: P4.1 to P4.9. `client.tsx` went from 1230 to 219 lines; the exam is now `components/quiz/exam/` + two hooks + `lib/exam/`.
  - **Structure (P4.9):** `hooks/useQuizLoader.ts` (quiz by code, questions per level, stale-request guard), `hooks/useQuizAttempt.ts` (reducer for answers/flags/position, deadline, submit guard, autosave, tab-switch count, `beforeunload`), `lib/exam/answers.ts` (pure: `getCorrectIndex`, `summarize`, `formatClock`, ...), `lib/exam/storage.ts`, and in `components/quiz/exam/`: `QuizAttempt` (one attempt, mounted with `key={attemptId}`), `ExamShell`, `ExamTopBar`, `ExamTimer`, `QuestionView`, `QuestionNavigator`, `SubmitDialog`, `ResumeAttempt`, `ResultsView`, `QuestionReview`. Every file is under 260 lines. Deleted: `FixedScoreDisplay`, `CorrectAnswersDisplay`, `QuizTimer` (replaced by `ExamTimer`), the empty `QuizCompletionScreen`.
  - **Layout (P4.1):** the exam calls `useExamMode`, so `QuizFrame` (new client wrapper used by `app/(quiz)/layout.tsx`; `SiteFrame` got a `header` prop) removes the site header from the DOM during an attempt; it returns on the results. Top bar: title (`h1`), mono timer, Submit, then "Q 5 of 20" and a teal progress bar (moves with `scaleX`, not width). **Decision on the bone reading panel: not used.** Questions are short, a second theme inside the exam adds contrast risk, and dark stays the default. Revisit only if long passages become common.
  - **Navigator and flags (P4.2):** numbered grid (current = teal fill, answered = teal tint, flagged = flag icon; each button's `aria-label` also spells the state out); a side panel at lg, a bottom sheet (the `Dialog` primitive, bottom-aligned) below. On phones the Previous / Flag / Next bar is sticky at the bottom.
  - **Options (P4.3):** native radios in a `radiogroup` (Tab and Up/Down work for free). 1–9 or A–Z pick an option, Left/Right move between questions (the shell `preventDefault`s them so the browser doesn't move the radio), focus goes to the question heading on every change (outline off on that heading only). Added "Clear answer" (radios can't be unchecked) and rendering of `imageUrl`, which the old exam never showed.
  - **Timer (P4.4):** deadline-based (`startedAt + durationSec`), one interval for the timer's life, state changes only when the displayed second does, catches up on `visibilitychange`. The side effect in the `setState` updater and `duration={30}` are gone. Warnings at 5 min and 1 min use an icon swap, words and colour, and are announced once through a polite `status` and an `alert` region (the clock itself is not live). Skipped when the quiz is shorter than the threshold. Auto-submit at zero.
  - **Submit (P4.5):** one dialog does confirm ("N unanswered / M flagged", jump to the first unanswered), saving, and failure with Try again. A synchronous `submittingRef` makes a second submit (double click, or the timer firing mid-save) a no-op. The fake `local-…` fallback and the `quizResponses`, `quiz_score_*` and `quiz_questions_*` localStorage writes are deleted: a failed submit now shows an error and keeps the answers. Once time is up the dialog can't be dismissed. **Data-layer change to make this honest:** `submitQuizResponse` takes an optional `attemptId`; it writes the response at `responses/{attemptId}` and each answer at `.../answers/{questionId}` with `setDoc` (was `addDoc`), so a retry after a partial failure rewrites the same documents instead of creating a second response. A first attempt hits the same rules as before (create); only a retry is an update.
  - **Autosave/resume (P4.6):** saved under `ageno:quiz:attempt:<quizId>:<uid|guest>` on every change (also at start, so the clock survives); cleared after a successful submit. A reload shows `ResumeAttempt` instead of the lobby ("Resume attempt" / "Start over" with a confirm). If the saved time has run out it says so and submits the saved answers. A resume is refused if the quiz's question ids changed.
  - **State cleanup (P4.7):** no `setScore` during render, no score timeouts, no ref polling, no `auto-load-questions.js` (already gone in P3). Retry builds a new seed (new attempt id, clean answers and tab-switch count) and remounts.
  - **Results (P4.8):** the score is the one the server stored (`score` from `submitQuizResponse`), plus correct of total, time taken, difficulty, not-answered and tab-switch counts when non-zero, and a plain multiplier note ("Hard is worth ×1.5. Your 67% raw score counts as 75%, capped at 100%.") only when the multiplier isn't 1. Review: each question with your answer and the correct one marked in words, optional `explanation`, filter All / Incorrect / Not answered. Quizzes with no auto-check show "Answers submitted" with no score or review. The raw Firestore id is gone; actions are "View my attempts" (signed in), "Back to quizzes", "Retry quiz". **Admin setting:** `Quiz.showAnswerReview` (missing = shown), with a checkbox added to the old `quizzes/new` and `quizzes/[quizId]/edit` pages (restyled in P7.3). `QuizQuestion.explanation` is read by the loaders; **there is no admin input for it yet** (belongs with the editor rebuild, P6.2; `saveQuestionsByDifficulty` would currently drop it on save).
  - **Loader change:** the client now uses `getQuestionsByDifficulty` from `firebase/firestore.ts` (it derives `correctIndex` from option flags and falls back to the legacy collection) instead of the one in `quizDifficulty.ts`, which returns no `correctIndex`. Without that the review would mark everything wrong for quizzes made on `quizzes/new`. `getCorrectIndex` prefers option flags over `correctIndex`. The lobby also got a Retry button next to a question-load failure.
  - **Dev tooling added:** `jsdom`, `@testing-library/react`, `@testing-library/dom` (devDependencies) and a small `vitest.config.ts` (alias and JSX runtime only).
- **Added later in the same session: fullscreen exam modes** (the user asked for real, protected exams; this pulls the Phase 8 "fullscreen required" idea forward and is the browser half of P5.9).
  - **Two modes per quiz, `Quiz.examMode`** (missing = `practice`; set with a select on the old new/edit admin pages): `practice` = fullscreen is requested on Start but leaving it only shows a dismissible one-line hint (`FullscreenNotice`), nothing is blocked or counted; `strict` = leaving fullscreen replaces the questions with `FullscreenGate` ("Return to fullscreen to continue", timer still visible and running, auto-submit still fires), and every exit is counted. **Warn and count only; no auto-submit on exits** (the user's choice for now).
  - **Flow:** Start, Resume and Retry call `enterFullscreen()` first thing from the click (browsers only allow it from a gesture). A strict quiz won't start (and its clock won't) if the browser refuses; the lobby shows why. A strict quiz on a browser with no fullscreen support (iPhone Safari) can't be started: the lobby says so and disables Start (decision: a serious exam isn't silently unprotected; revisit if mobile takers matter). Fullscreen is left again on the results. The lobby's third instruction changes with the mode.
  - **Recording:** `fullscreenExits` is autosaved with the attempt (survives reload), sent as the last argument of `submitQuizResponse`, written to the response doc only when > 0, and shown on the results ("Left fullscreen"). Not shown to admins yet (`components/analytics/AttemptDetails.tsx`).
  - **Files:** `lib/exam/fullscreen.ts` (API wrapper incl. Safari prefix), `hooks/useFullscreen.ts`, `FullscreenGate.tsx`, `FullscreenNotice.tsx`; `QuizAttempt`, `client.tsx`, lobby and `useQuizAttempt` changed.
  - **Verified:** `tsc` ✓ `lint` ✓; 47 tests pass (6 new: gate hides questions and counts, return restores answers and sends the count, refusal message, expiry while gated still submits, unsupported browser not gated, practice hint doesn't block or count). Real Chrome via a throwaway page (deleted): Start went fullscreen with no header; `exitFullscreen()` (what Esc does) showed the gate in strict and the hint in practice; the buttons returned to fullscreen. `npm run build` was **not** re-run after this addition (it passed before it).
  - **Limits, by design of the web:** Esc, Alt+Tab, the Windows key and a second device can't be blocked from a page, only detected; the browser only reports leaving fullscreen, not other windows (a focus-loss signal is P5.9). A reload exits fullscreen without an event, so it isn't counted. Counting happens in the browser, so a determined user can tamper with it until P5.2/P5.9 move it to the server.
- Verified: `tsc` ✓ `lint` ✓ `build` ✓ (run in a scratch copy so the dev server on 3000 was not disturbed; with a throwaway `FIREBASE_*` key, because the key in `.env.local` is not a valid PEM, so "Collecting page data" fails without an override). Tests: `npx vitest run __tests__/exam-logic.test.ts __tests__/quiz-attempt.test.tsx` passes (scoring helpers, clock math, storage; keyboard, flags, navigator, submit confirm, double submit, a timer expiring during a submit (fails if the guard is removed), failure then retry with the same attempt id, timeout, results and review, review off, no score, autosave, restore, clear on success, `beforeunload`, tab switches). Real Chrome via a throwaway harness page (deleted): header absent during the exam and present on results/resume; keys 2 / Right / c / Right worked; the dialog traps focus and Escape closes it; with the network blocked the submit shows the honest error dialog; the 5-min and 1-min warnings render and announce; at 390px there is no horizontal scroll, the Next button sits at the bottom edge and is 44px tall; the bottom sheet opens, jumps and closes. Screenshots checked at 1366×768 and 390×844.
- **Not verified:** a real quiz end to end (needs real Firestore data and a signed-in user): load → start → answer → submit → score, a successful write to `responses` with the new ids under the **deployed** rules, resume after a real reload, and the guest path on mobile. Not checked: Lighthouse / axe (P7.5), a screen reader, Firefox and Safari, questions with `imageUrl`, questions with more than 4 options.
- Notes/blockers:
  1. **Retry-after-partial-failure needs `update` on `responses`.** If the deployed rules allow `create` but not `update` for a user's own response, the first submit still works; only a retry after a half-written first try would be denied (and would show the error). Confirm in P5.1.
  2. **The score can disagree with the review when scoring ids don't match.** The stored score is computed by `submitQuizResponse` from the legacy `questions` subcollection first; the review uses the level the person actually took. For quizzes saved by `quizzes/new` and `QuizForm` both read `questions_{level}` and agree. P5.3 moves scoring to the server and fixes the default-multiplier mismatch (`firestore.ts` still defaults medium/hard to 1.5/2.0 when a level has no settings, while the lobby shows ×1).
  3. **Everything an attempt needs is still in the browser** (questions with answers, the deadline, the autosave): P5.2. Someone can edit localStorage to extend their clock. `beforeunload` and autosave are conveniences, not integrity.
  4. `components/common/Loading|ErrorMessage` and `QuizForm` still import framer-motion; the exam doesn't.
  5. `.env.local` now exists in this checkout (it was missing in Session 4), so `/api/auth/*` should work in dev.
  6. Two `next dev` servers briefly shared `.next` this session (mine on port 3111, stopped). If the dev server on 3000 acts odd, restart it.
- Next up: the user takes a real quiz (an open quiz, a code quiz, a multi-level quiz, a reload mid-attempt, a deliberate offline submit), then Phase 5, starting with P5.1 (audit the deployed rules).

### 2026-10-23 — Session 4 (Phase 3)
- Done: P3.1, P3.4, P3.5 ticked. P3.2, P3.3 and P3.6 are implemented but left unticked until checked in a browser. Phase 2 was closed first (user checked `/join`, incl. the polish pass).
  - **New** `components/quiz/lobby/`: `QuizLobby` (layout; 2 columns at lg, `24rem` sticky right card), `LobbyAbout` (label, title, description clamped to 3 lines with "Show more" above 220 chars, facts strip, 4 instructions), `LobbyStartCard` (difficulty, access code, Start), `DifficultyOptions` (stacked native radios), `LobbyStates` (`LobbyFrame`, `LobbySkeleton`, `QuizNotFound`, `QuizInactive`, `QuizLoadFailed`). `lib/quiz-access.ts` keeps "code verified" in `sessionStorage` (`ageno:quiz:verified:<id>`).
  - **`client.tsx`** 1414 → 1230 lines. The intro JSX is gone; it renders `QuizLobby` and the state screens. The exam view is untouched except what the lobby needs (see below).
  - **Duration/multiplier single source (P3.5):** the lobby, the difficulty-change notice, `handleDifficultySelect` and `handleStartQuiz` now use `getDifficultyDuration` / `getDifficultyMultiplier` from `utils/difficulty-helpers.ts`; the local multiplier copy in `client.tsx` is deleted. The 45/30/20 fallback and the hardcoded 1.0/1.5/2.0 are gone with the old intro and `DifficultySelect.tsx` (deleted, along with all its glow/pulse keyframes). `bg-blue-700` mismatch is gone with the old Start button.
  - **Lobby behaviour:** the facts strip (Questions, Time limit, and Points only if some level has a multiplier ≠ 1) shows the chosen level once; the difficulty rows list only what differs between levels (time and/or ×multiplier). The "Access Code:" block is gone. The Start card shows a code field only for `requiresAccessCode` quizzes whose code isn't verified this session; Enter submits and starts. Joining from `/join` by typing the code marks it verified, so you aren't asked twice. Open quizzes start in one click. The summary line from the plan ("20 questions · 30 min") is replaced by "Your time starts when you press Start." because the facts strip already shows those numbers. Guests see "Sign in to save this attempt to your account."
  - **States (P3.6):** skeleton in the lobby's grid (also used as the `Suspense` and `SafeQuizLoader` fallback); "We couldn't find that quiz" with a link to `/join`; "This quiz isn't open right now" (new optional `Quiz.active`, read from the `active` field `QuizForm` already writes; missing = active); a load-failed alert with Retry. "No questions for this level" is now an inline warning in the Start card instead of replacing the whole page.
  - **Pulled forward from P4.7, because the lobby needs it:** the 800ms `setTimeout` auto-load (`auto-load-questions.js`, deleted) is now a direct call, so Start is ready as soon as the questions arrive. The old effect also retried forever when a level had no questions (the failure never set `difficultySelected`); a `questionsFailed` flag stops that.
- Verified: `tsc` ✓ `lint` ✓ `build` ✓ (placeholder `FIREBASE_*`); `/ABC123` returns 200 with the skeleton, one `<main>`. **Not verified:** everything visual, the no-scroll goal at 1366×768, mobile reach of the Start card, and any real quiz flow (needs real Firestore data: open quiz, code quiz, multi-difficulty quiz, a quiz with an empty level).
- Notes/blockers:
  1. **Code gate is still client-side.** The code is in the URL and in the `/join` payload; the lobby compares against `quiz.accessCode`. It stops casual clicking from the list, not a determined user. Real fix is P5.4.
  2. **Desktop guests are redirected to `/sign-in`** by `AuthStateHandler` (no return path), while mobile browsers skip the check and can take quizzes as `anonymous` (P5.7). So the guest sign-in prompt in the Start card is only seen on mobile for now. Consider a post-login redirect back to the quiz.
  3. Switching to a level with no questions still falls back to whatever questions are loaded (existing behaviour in `loadQuestionsForDifficulty`); the data-layer cleanup (P6.1) should settle this.
  4. `quiz.questions.length` is the question count shown; it is the count for the loaded level, not a stored field.
- **Closed later in the session:** the user checked the lobby and it fits at 1366×768 with no scroll after a spacing pass (page padding 40→32px, title `text-3xl`, description clamped to 2 lines, smaller "Show more" and facts, tighter bullets and card spacing). The dev-only `AuthDebugger` was removed from `app/(quiz)/[code]/page.tsx`: it called `/api/auth/session/debug`, got a 500 because this checkout has no `.env.local` (no `FIREBASE_*` Admin credentials), and added an error line plus extra height under the lobby. Phase 3 is ticked and Done. **Not exercised by hand:** the not-found, inactive and load-failed screens, a quiz with an empty level, and the 390px mobile reach of the Start card.
- Notes: `.env.local` is missing, so `/api/auth/*` (session cookie) fails in this dev setup. Add the three `FIREBASE_*` values before testing sign-in or admin flows.
- Next up: P4.1.

### 2026-10-23 — Session 3 (Phase 2)
- Done: P2.4 and P2.6 ticked. P2.1, P2.2, P2.3 and P2.5 are implemented but left unticked until someone has looked at them in a browser.
  - **Page** (`app/(quiz)/join/page.tsx`, rewritten, ~200 lines): dark surface, compact header row (`// QUIZZES`, "Join a quiz", one-line subtitle) with the code form on the right, then the toolbar, then a 1/2/3-column grid (`gap-4`). Uses `useAuth()` instead of its own `onAuthChange` effect. Search, access filter and sort are `useMemo`s; the filter chips show counts for the current search. The "You're signed in" pill is gone; guests get "Sign in to save your progress." under the form (space is reserved, so nothing shifts when auth resolves).
  - **New components** in `components/join/`: `JoinCodeForm` (real `<form>`, mono uppercase input, Enter submits, inline `role="alert"` error, matches the typed code case-insensitively against the already-loaded list and only calls `getQuizByCode` if the list is empty) and `QuizToolbar` (`SearchInput`, `Chip` filters All/Open/Code required, `SegmentedControl` sort Newest/Title, polite result count).
  - **`components/QuizCard.tsx`** rebuilt flat: whole card is a `next/link` to `/${accessCode}`, `Card interactive`, title, 2-line description, mono meta row (duration or range via `getDifficultyDuration`, difficulty outline badges), lock icon plus "Code required". Access code no longer shown. `AccessCodeModal`, all gradients, the date line and the per-card framer-motion are gone; the join page no longer imports framer-motion.
  - **States:** 6 skeleton cards while loading; "No quizzes are open yet" and "No quizzes match" (with a clear button) empty states; an error `Alert` with Retry and no Firestore wording. To make the error state reachable, `getActiveQuizzes()` (`firebase/firestore.ts`) now throws instead of returning `[]` (the join page was its only caller).
  - **Motion:** one 150ms opacity-only `fade-in` utility added to `globals.css`, used on the list.
- Verified: `tsc` ✓ `lint` ✓ `build` ✓ (placeholder `FIREBASE_*`). Dev server: `/join` returns 200 with one `<header>`, one `<main>`, the `h1`, the code form and skeletons. **Not verified:** how it looks, the 1366×768 "code input and first card row above the fold" goal, keyboard-only joining in a real browser, Lighthouse accessibility ≥ 95.
- Notes/blockers:
  1. **Temporary access-control gap until P3.3:** with the modal removed, clicking a code-required card goes straight to the lobby, which does not yet ask for the code. This was never real protection (the old modal compared against a code the page already exposed, and `getQuizByCode` accepts its own code), but P3.3 should add the lobby code field soon. The code is also still in the card's URL and the list payload until P5.4.
  2. **No question count on cards.** Nothing writes `questionCountByDifficulty` and the converter doesn't read it, so the old card always showed "N/A". I omitted it rather than fake it. Needs a denormalised count saved with the quiz (P6.1/P6.2) before it can come back.
  3. **No `challenge` badge**: the `Quiz` type has no tags field yet (Phase 8).
  4. `getActiveQuizzes` still returns every quiz (no active/public filter); that is P5.4.
  5. `QuizTimer`, `QuizForm` and `common/Loading|ErrorMessage` still import framer-motion, so the package stays.
- **Polish pass (same session, after the user's first look):** the user confirmed the code input and first row fit without scrolling at 1366×768 and asked for a more professional filter. Changes: new `FilterTabs` primitive (`components/ui/FilterTabs.tsx`: underlined tabs with mono counts, `aria-pressed` buttons) replaces the filter chips; toolbar is one row on a hairline (tabs left; search and a compact "Sort" select right; on phones search and sort first, tabs just above the list); result count moved to an `sr-only` live region (the tab counts carry it visually). `SearchInput` got an `inputClassName` prop (`h-11 rounded-md` here, so the controls share one radius and height with the code field and the Join button). Cards now read: mono levels label, title, description, divider, footer with clock plus duration and either "Start →" or lock plus "Code required". The code field has a key icon and the button says "Join quiz". Search, filter and sort persist in `sessionStorage` (`ageno:join:view`), so coming back from a lobby keeps the view. `tsc` ✓ `lint` ✓; `npm run build` not re-run after this pass.
- Next up: user visual check of `/join` (mobile width and keyboard still unchecked), then tick P2.1–P2.3 and P2.5, mark Phase 2 Done, then P3.1.

### 2026-10-23 — Session 2 (Phase 1)
- Done: P1.1, P1.1b, P1.1c, P1.1d, P1.2, P1.3, P1.4, P1.5. Phase 0 was closed first (user confirmed the header is stable and sticky).
  - **Tokens/CSS:** `app/theme.css` is the Agenoverse port (brand, semantic, state colours, fluid type scale, radii, motion, `[data-theme]` flips). `app/globals.css` was rewritten from 750 lines to ~270: brand utilities (`transition-fast|base|slow`, `text-label`, `bg-grid`, `glow-teal`, `bg-noise`, `spotlight`, `rise`, `link-underline`), base styles, `::selection`, `:focus-visible`, scrollbars, logo cursor and the reduced-motion guard. Deleted the purple `.btn-primary/.btn-secondary`, the duplicated mobile blocks, the `!important` heading and touch overrides, every decorative keyframe, the legacy `.quiz-card/.option/.timer/...` classes (no `className` used any of them), and `app/animations.css`. `animate-float-slow*` and `animate-pulse-slow` were only used for decorative blobs on the sign-in/up pages; those blobs now simply don't animate (the pages get redesigned later).
  - **Deliberate deviations from the plan (read before Phase 2):**
    1. The default Tailwind palette is **not** wiped (P7.6), as planned. This also means `rounded-sm/md/lg` and `text-xs`…`text-6xl` now follow the Agenoverse values (6/10/16px and the fluid scale) on every unmigrated screen. I added stock line-height ratios to `theme.css` (`--text-*--line-height`) so unmigrated text keeps its leading; review in P7.6.
    2. `<body>` stays light (`bg-white text-gray-800` in `layout.tsx`) until every screen is migrated. Tokens are dark by default, so **new or redesigned screens must sit on a dark surface** (`data-theme="dark"` plus `bg-bg text-text`) and the shell (header, footer, dialogs, toasts) sets `data-theme="dark"` itself. Base `h1`–`h4` have no colour for the same reason. `viewport.colorScheme: "dark"` joins in P7.6; `themeColor` is already ink.
    3. Button has no hover scale (brightness only, per the motion rules) and has an extra `danger` variant (outlined, readable on both themes). The `rise` keyframe is 16px, per the roadmap, not Agenoverse's 20px.
  - **Fonts:** `geist` (Sans + Mono) and Instrument Serif (self-hosted in `app/fonts/`, copied from Agenoverse) replace Inter. Variables are set on `<html>`.
  - **Brand:** `components/brand/Logo.tsx` and `LogoWordmark.tsx` ("ageno quiz" plus an optional mono `by agenoverse`). New `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`; generated `app/opengraph-image.tsx` replaces the old SVG (social platforms don't render SVG). Metadata and titles say "Ageno Quiz". Removed the placeholder canonical link, the fake Google verification code, the nonexistent favicon/twitter image paths and the `example.com` base URL (`metadataBase` now reads `NEXT_PUBLIC_SITE_URL`, then Vercel's production URL).
  - **Primitives** in `components/ui/` (barrel `index.ts`): ported Button, Badge, Chip, Field (`Input/Textarea/Select`), SearchInput, Toast (`ToastProvider` is mounted in the root layout), CopyButton; new Card, Skeleton, Dialog (native `<dialog>`), SegmentedControl (native radios), EmptyState, Alert. `cn()` lives in `lib/utils.ts` along with `AGENOVERSE_URL` / `agenoverseUrl()`.
  - **Shell:** `components/layout/{Header,AccountMenu,Footer,SiteFrame,Container}.tsx`, `lib/navigation.ts`. `SiteFrame` (header, the single `<main id="main-content">`, optional footer) is used by `(auth)`, `(quiz)` (no footer: lobby and exam need the height), `(user)` and a new `(public)` group, which now holds the landing page (URL unchanged). No page renders a header any more; nested `<main>` tags in pages became `<div>`, and the root wrapper is a `<div>`. The old `Header`, `Footer`, `UserProfile` and the landing page's inline footer (fake `#` social links) are deleted. The account menu is hand-built (no Headless UI), so `@headlessui/react` was uninstalled. The old footer's dead links (`/about`, `/privacy-policy`, ...) and placeholder social links are gone; the new footer links to real Agenoverse pages.
- Verified: `tsc` ✓ `lint` ✓ `build` ✓ (placeholder `FIREBASE_*`). With `npm run dev`: `/`, `/join`, `/sign-in`, `/sign-up`, `/reset-password`, `/verify-email` and `/ABC123` all return 200 with exactly one `<header>` and one `<main>` (footer on all except the quiz route, as designed); generated CSS contains the new tokens and utilities. **Not verified:** how it looks. Nobody has looked at the shell in a browser, and the keyboard and focus behaviour of the account menu and mobile drawer is untested by hand.
- Notes/blockers: `/my-quizzes` and `/leaderboard` render only after client-side auth (existing behaviour). Pages still use `container mx-auto` rather than the new `Container`; fine until each is redesigned. `react-icons` is still used by admin pages (removed with P7.3). `common/Loading.tsx` and `common/ErrorMessage.tsx` should be replaced by `Skeleton`/`Alert` as screens are migrated.
- Next up: the user checks the shell (header at the top and scrolled, mobile drawer at 390px width, account menu with the keyboard), then Phase 2 starting with P2.1.

### 2026-10-23 — Session 1 (Phase 0)
- Done: P0.3, P0.4, P0.5, P0.6. P0.1 and P0.2 were implemented but left unticked until checked; the user then confirmed in the browser that the header is stable and sticky, so both are ticked and Phase 0 is Done.
  - P0.1: `components/Header.tsx` now has a fixed `h-16` bar, `transition-[background-color,box-shadow]`, a passive rAF-throttled scroll listener with hysteresis (on above 48px, off below 4px), and an initial run on mount. Removed `.transition-all` and `will-change` from both mobile blocks in `globals.css`.
  - P0.2: root `<main>` is `overflow-x-clip`; the join page's nested `<main>` is a `<div>`. Also changed `overflow-x: hidden` to `clip` on `html, body` in both mobile blocks of `globals.css` (same sticky-breaking problem on phones).
  - P0.3: the audit missed several links. Fixed every `/admin/...` href and `router.push` in `components/quiz/QuizForm.tsx`, `quizzes/[quizId]/page.tsx`, `quizzes/[quizId]/edit/page.tsx` and `dashboard/page.tsx` (including `/quizzes/new` and `/quiz-reports`), and `/quiz/join` → `/join` in `client.tsx`. `middleware.ts` still lists `/quiz/join` and `/admin/`; that belongs to P5.6.
  - P0.4: `join/page.tsx` has one `useMemo` filter over title, description and code; the `filteredQuizzes` state and both effects are gone.
  - P0.5: removed all live `console.log/debug/info` (49 statements, via an AST script) and ~300 lines of commented-out log blocks from app code. `console.warn/error` and `__tests__/` were left alone. Cleaned up what that exposed (empty branches, a dead mobile-detection effect in `(quiz)/layout.tsx`, two unused vars in `app/api/auth`).
  - P0.6: removed the `JSON.stringify(currentQuestion)` line from `client.tsx`. The only remaining `JSON.stringify(quiz.questions)` writes answers to localStorage, which is P5.2's job.
- Verified: `tsc` ✓ `lint` ✓ `build` ✓. grep finds no `console.log/debug/info` outside `__tests__/`, and no `/admin/` or `/quiz/join` hrefs outside `middleware.ts`. **Not verified:** header stability and sticky behaviour in a real browser.
- Notes/blockers: `npm run build` fails at "Collecting page data" without `FIREBASE_*` vars, because `firebase/admin.ts` throws at import. There's no `.env` in this checkout. I built with placeholder values and a generated throwaway key. `__tests__/auth-flow-test.ts` still has its own `console.log` calls. 
- Next up: Phase 1.

### 2026-10-23 — Session 0 (planning)
- Done: audited the codebase (join, lobby, exam, header, data layer, rules, middleware) and read the Agenoverse brand system. Wrote this roadmap.
- Verified: the file:line references come from the audit and haven't been re-checked since. Re-read the files before editing.
- Notes: the user chose UI first, then security, with the Agenoverse design system. The live app works, so the deployed rules are looser than the repo's.
- Next up: P0.1
