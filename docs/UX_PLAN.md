# UX Plan: light mode, a calmer exam screen, a clearer result

**Purpose:** (1) add a light theme, default for new visitors, with a Light / Dark / System switch; (2) make the quiz-taking screen compact enough that a normal question and its options fit one screen without scrolling; (3) make the result and the answer review denser (two questions per screen), easier to scan and more professional.

- **Created:** 2026-10-27
- **Last updated:** 2026-10-27 (Session 4: U6 final QA)
- **Current phase:** U6 done in code. Still open, all needing a real device or a signed-in browser: U4.5 (two cards per screen holds only for cards with at most one reason block), U5.2 (print and OG image not rendered), U0.1 (baseline screenshots) and the checks in MANUAL_STEPS ("UX plan")
- **Same rules as the other plans:** read `docs/IMPROVEMENT_ROADMAP.md` ("How to use this file") first; tick a box only after verifying; run `npx tsc --noEmit` and `npm run lint` after each task and `npm run build` at the end of a phase; update this file's Status table and Session Log every session; reference task IDs in commits (`feat(theme): U1.2 ...`). Things only the user can check (a real browser, a phone) go in `docs/MANUAL_STEPS.md`.

## Decisions (made with the user, 2026-10-27)

| Decision | Choice | Note |
|---|---|---|
| Default theme for a first visit | **Light** | The roadmap said "dark by default" (Agenoverse brand). The user's request overrides it for this app; update the roadmap's Design principles line when U1 ships. |
| Switch | Light / Dark / System, remembered per device | "System" follows the OS, and follows it live if the OS changes. |
| Dark theme | Stays exactly as it is, minus fixes found in QA | No dark redesign. |
| Admin | Body follows the chosen theme; its dark top bar stays | Admin already uses the light tokens, so this mostly works today. |

## What the code looks like today (the audit)

Good news first: the app is **already tokenised**. `app/theme.css` has a complete `[data-theme="light"]` set (bone background, white surfaces, contrast-checked link/error/success colours) and the admin uses it. Nothing in the player UI needs a rewrite; it needs the dark lock taken off.

- **Dark is locked in** by `data-theme="dark"` written on ~22 wrappers (`ExamShell`, `ResultsScreen`, `AttemptReview`, `JoinClient`, `LeaderboardClient`, `MyQuizzesClient`, `profile`, `UserGate`, the four `(auth)` pages, `AuthFrame`, `(public)/page`, `LobbyStates`, `Header`, `Footer`, `Dialog`, `Toast`, `FullscreenGate`) and by `viewport.colorScheme: "dark"` / `themeColor: "#0e1116"` in `app/layout.tsx`. There is no theme state, no storage, no toggle.
- **Raw brand classes** (not tokens): `text-ink` ×15 (mostly ink-on-teal text: fine in both themes), `bg-ink` ×5 + `bg-ink/95` etc. (top bars and drawers: need a look), `bg-bone` ×1, `text-bone` ×2, `bg-amber` ×1. Hex colours only in `app/opengraph-image.tsx` (a fixed image: leave) and the Google logo.
- **Decoration that assumes dark:** `bg-noise` is a white-noise SVG (invisible on bone), `bg-grid` and `glow-teal` should be fine but need a look.
- **Contrast facts for the light tokens** (measured today, WCAG 2.2):

| Pair (light) | Ratio | Verdict |
|---|---|---|
| ink `#0e1116` on bone | 17.3 | ok |
| body `#2a2e35` on white / bone | 13.6 / 12.5 | ok |
| muted `#5c5f66` on white / bone | 6.4 / 5.9 | ok |
| link `#0a756b` on white / bone | 5.6 / 5.1 | ok |
| success `#067647` on white / on soft `#ecfdf3` | 5.7 / 5.4 | ok |
| error `#b42318` on white / on soft `#fef3f2` | 6.6 / 6.1 | ok |
| ink text on teal button | 8.6 | ok |
| **teal-deep `#0f8b7f` (the light `--color-accent`) as small text on white** | **4.2** | **fails 4.5: use `text-link` for text, accent only for fills, borders, rings** |
| **`--color-border` `#d4d1ca` on bone** | **1.4** | **fine for dividers, but an answer option is a control and needs 3:1 (WCAG 1.4.11): use `border-strong` `#8a8780` (3.6) or a fill** |

### Why the exam screen feels big (measured from the classes)

| Thing | Now | Effect |
|---|---|---|
| Question text | `text-xl sm:text-2xl` = 21 px phone, **26 px at 1366 wide**, `leading-snug` | a 3-line question takes ~110 px; reads like a heading |
| Question label + hint | `Question N` label above, hint line below | two extra lines before the options |
| Option row | `min-h-14` (56 px), `py-3`, `gap-4`, 28 px letter badge, `space-y-3` (12 px) | 4 options ≈ 4×56 + 3×12 = **260 px** |
| Top bar | 56 px title row **plus** 44 px progress row, sticky | **100 px** gone before any content |
| Content padding | `pt-6 lg:py-8`, `mt-6` before options, `mt-8` before buttons | ~70 px of gaps |
| Button row | 44 px buttons, own row | 60–70 px |
| Hint under options | 44 px row (shortcuts text, Clear) | another row |

At 1366×768 a browser leaves ~650 px of viewport. Today: 100 + 32 + 20 + 110 + 24 + 260 + 32 + 60 + 44 ≈ **680 px**, i.e. already over before the question gets long. Target below: ~**470 px** for the same question.

### Why the result feels big and unclear

- Left card is 22 rem wide with a **`text-6xl` score** and a long list of facts; the review cards sit beside it (fine), but each review card is `p-5`, `text-lg` question, options `px-4 py-2.5`, so a 4-option question with one reason is ~420–520 px: **one question per screen**.
- The status word ("Correct" / "Incorrect", `text-sm font-medium`, with an icon) and the right-aligned tags (`YOUR ANSWER · CORRECT ANSWER`, mono uppercase `text-xs text-text`) are the loudest text in the card, louder than the options themselves.
- Right and wrong are told apart only by a 1 px border colour; the reason (`text-sm text-text-muted`) looks like a footnote and is not visually separate from the options.
- "Why the others are wrong" is a bare `<details>` link.

## Research notes (what was used, and its limits)

The web search was thin; most of this is established practice, so treat the numbers as tuned defaults to confirm by eye in U6, not as proven optima.

- Touch targets: 44×44 px minimum (iOS HIG / WCAG 2.5.8 AA is 24 px, this app already aims higher at 44). **Keep 44 px** for options; there is no reason to go to 56.
- Body text 16 px+, line-height 1.4–1.6, line length 45–75 characters. The app's global `line-height: 1.7` is for articles; an exam wants 1.45–1.5.
- A 2016 study of 119 students found dark-on-white and a plain sans at 12–14 pt the most preferred for online exams, and a visible countdown the preferred time display ([Computers in Human Behavior](https://datalearner.com/academic/journal-papers/0747-5632/volumes-and-issues/176/paper-detail/36255)). It supports a light default and a plain sans; it does not settle one-question-per-page (students there chose 3–5 per page), so the one-question flow stays as a product decision.
- Never carry meaning by colour alone (WCAG 1.4.1, [summary](https://www.ogcio.gov.hk/en/community/web_mobileapp_accessibility/promulgating_resources/handbook/wcag2a/8_8_use_of_colour.htm)): every right/wrong state keeps an icon and a word.
- No-flash theming: a synchronous inline script in `<head>` sets the theme before first paint (effects flash; `suppressHydrationWarning` on `<html>` is already set here). Listen to `prefers-color-scheme` for "System". Suppress transitions on first paint ([write-up](https://dev.to/137foundry/how-to-prevent-the-flash-of-wrong-theme-when-implementing-dark-mode-2pg1)). `next-themes` does this, but it is a dependency for ~40 lines; **write it by hand** (Agenoverse forbids extra libraries and the bundle budget is tight).

## Design targets

### Exam screen (U3)

- **Question text:** 18 px (`1.125rem`) at all widths, 20 px from `lg`, weight 500, `leading-[1.45]`, max width ~68ch, colour `text` (the strongest). Not `h2`-sized; keep the semantic `h2`.
- **Label:** fold "Question N" into the top bar's "Q N of M" (it is already there) and drop the extra label line; keep the select-all hint on one line directly under the question.
- **Options:** `min-h-11` (44 px), `py-2` , `gap-3`, letter badge 24 px, option text 16 px / `leading-[1.4]`, rows `space-y-2` (8 px). 4 options ≈ 4×44 + 3×8 = **200 px** (was 260). Selected = tinted fill + 2 px accent border + filled badge; unselected border at `border-strong` (3:1).
- **Top bar:** one 56 px row on desktop: title, `Q 5 of 20`, a slim progress bar that fills the middle, timer, Submit. On phones keep two rows only if needed (title truncates; progress stays a 2 px line under the bar), so ≤ 64 px.
- **Gaps:** content `pt-4 lg:pt-6`, options `mt-4`, buttons `mt-5`. Shortcut hint moves into the right end of the button row on desktop (hidden on phones); the "Clear answer" link stays beside it.
- **Buttons:** Previous / Flag / Next at 40–44 px, quiet except Next (primary). Phones keep the sticky bottom bar.
- **Result for the user:** a typical question (≤ 3 lines, 4 short options) fits at 1366×768 and at 390×844 with the buttons visible. Long questions still scroll, as they should.

### Results and review (U4)

- **Summary:** score `text-5xl` (not 6xl), a one-line verdict under the title, a compact stat strip (Correct, Time, Difficulty) instead of a tall list; integrity counts stay but grouped, quieter. Card width 20 rem.
- **Review card, compact:** `p-4`; header row = `Q3` mono + a **small status pill** (12 px, weight 600, tinted background, icon + word); question 16 px / weight 500; options `py-2`, 15 px.
- **Right / wrong / yours, told apart three ways** (tint + icon + word, never colour alone):
  - correct option: soft green fill, green 1 px border, check icon at the left, tiny pill `Correct`
  - your wrong pick: soft red fill, red border, X icon, tiny pill `Your answer`
  - your right pick: green as above, pill `Your answer · Correct`
  - others: plain surface, neutral border, no icon
  - the shouting right-aligned mono uppercase tags go; pills are 11–12 px, sentence case.
- **Reasoning:** a separate block under the options, on `bg-alt` with a 3 px left rule (green for the correct option's reason, red for a wrong pick's, neutral for the general explanation), label `Why` in small caps-free 12 px weight 600, text 14 px `text-body`, `leading-[1.5]`, max ~65ch. "Why the others are wrong" becomes a proper disclosure row with a chevron.
- **Density:** target ≈ 300–340 px per 4-option question with one reason, so **two per screen** at 1366×768 and a comfortable one-and-a-half on a phone. Whitespace goes *between* cards (16 px) and inside blocks (consistent 8/12/16), not by shrinking text below 14 px.
- **Filter tabs:** All / Incorrect / Not answered stay; add "Flagged" only if the data is already in the result (check first).

### Palette and type in light (U2)

New semantic tokens in `app/theme.css`, defined for both themes so components never branch on theme:

| Token | Light | Dark |
|---|---|---|
| `--color-success-soft` / `-line` | `#ecfdf3` / `#a6d9bd` | success 12% on surface / success 45% |
| `--color-error-soft` / `-line` | `#fef3f2` / `#f1b5ae` | error 12% on surface / error 45% |
| `--color-accent-soft` | teal-deep 8% on white | teal 10% |
| `--color-text-faint` (placeholders, disabled) | `#7a7d84` (only for non-essential text) | `#7d8087` |

Hierarchy the user asked for ("black for content, some lighter, some darker"): headings `text` (ink 17:1), questions `text`, option and explanation text `text-body` (`#2a2e35`), meta and labels `text-muted` (`#5c5f66`), never lighter than that for anything a person must read. Fonts stay **Geist Sans** (clear, open apertures, tabular figures with `tabular-nums`) for everything in the exam; **Geist Mono** only for the timer, numbers and small labels. Instrument Serif never appears in the exam or result (existing rule).

## Phases

### U0: Baseline (30 min)

- [ ] U0.1 Run `npm run dev`, capture "before" screenshots (lobby, a question, the navigator, results, review, join, my quizzes) at 1366×768 and 390×844, light only after U1. Keep in `docs/ux-baseline/` (gitignored if large) or just note heights in the log.
- [x] U0.2 Run the existing UI tests once (`quiz-attempt.test.tsx`, `import-wizard.test.tsx`, `quiz-editor*.test.tsx`) so a later failure is known to be new.

Done when: the baseline numbers are in the Session Log.

### U1: Theme infrastructure and the switch

- [x] U1.1 `lib/theme.ts` (pure): `type ThemePreference = "light" | "dark" | "system"`, `resolveTheme(pref, systemDark)`, storage key `ageno:theme`, every storage access in try/catch.
- [x] U1.2 A tiny inline script in `app/layout.tsx` `<head>` (string constant exported from `lib/theme.ts`, unit-tested) that sets `document.documentElement.dataset.theme` and `style.colorScheme` before paint; `<html>` is server-rendered with `data-theme="light"` so no-JS and a failed script both give the default.
- [x] U1.3 `components/layout/ThemeToggle.tsx`: Light / Dark / System (`SegmentedControl` exists in `components/ui`), reads/writes storage, listens to `prefers-color-scheme` while on System, and to the `storage` event so two tabs agree. Put it in the header (desktop), the mobile drawer, the profile page (Preferences), and the exam top bar as a small icon button (so a person can switch mid-quiz without leaving fullscreen).
- [x] U1.4 Remove the hard-coded `data-theme="dark"` on the ~22 wrappers so they inherit from `<html>` (list in the audit). Keep it only where dark is the design (the admin top bar). Header, Footer, Dialog, Toast follow the theme.
- [x] U1.5 `viewport`: `themeColor` as two media entries (`#f6f5f1` light, `#0e1116` dark), `colorScheme: "light dark"`.
- [x] U1.6 Disable transitions for the first paint and on a theme change (a `data-theme-switching` attribute removed after two frames) so the switch is instant, not a 250 ms colour smear.
- [x] U1.7 Replace or review the raw classes: `bg-ink`, `bg-ink/95`, `bg-ink/90`, `bg-ink/70` (top bar, drawer, overlays) → `bg-bg/95` etc.; `text-bone`, `bg-bone` → tokens; `bg-noise` → hide or invert in light; check `bg-grid`, `glow-teal`.
- [x] U1.8 Tests: `lib/theme` unit tests (resolve, storage failure, system change); a component test for the toggle; the existing tests still pass.

Done when: first visit is light with no flash; the switch works on every page, survives reload, follows the OS on System; no screen has a dark island by accident.

### U2: Light palette polish

- [x] U2.1 Add the soft/line/faint tokens (table above) to `app/theme.css` for light and dark, plus `@media print` parity.
- [x] U2.2 Fix the two measured contrast problems: small text that uses `text-accent` → `text-link` (grep `text-accent` and check each in light); option and card controls use `border-strong` where they are controls.
- [x] U2.3 Cards in light: white surface, 1 px border, a very soft ink-tinted shadow (`shadow-float` is too heavy for cards; add `--shadow-card`). Check Alert, Badge, Chip, FilterTabs, Field, SegmentedControl, Skeleton, Dialog backdrop in light.
- [x] U2.4 A contrast script (`scripts/check-contrast.mjs`, pure Node) that reads the tokens and asserts AA for the text pairs and 3:1 for control borders, run in a test so nobody regresses it.

Done when: every token pair that carries text or a control passes in both themes (script output in the log).

### U3: Compact, calm exam screen

- [x] U3.1 Type and spacing tokens for the exam only (`--text-question`, `--text-option`; local, not global) and the sizes from the targets above in `QuestionView.tsx`.
- [x] U3.2 `ExamTopBar.tsx`: one row ≤ 56 px on desktop; keep every `aria-*` and the progress `role="progressbar"`.
- [x] U3.3 `ExamShell.tsx`: gaps, button row, shortcut hint beside the buttons, navigator card tightened (grid cells stay 44 px).
- [x] U3.4 Verify at 1366×768 and 390×844 with a 3-line question and 4 options, and with a 10-line question and 6 options (it must scroll gracefully with the sticky bar on phones and not hide the options).
- [x] U3.5 Update `quiz-attempt.test.tsx` only if it relied on removed text (the "Question N" label); keep the accessibility name tests green.

Done when: the typical question fits one screen at both sizes, with Next visible, and the exam looks right in light and dark.

### U4: Results and review

- [x] U4.1 `ResultsScreen.tsx`: summary card per the targets (score `text-5xl`, one-line verdict, stat strip, quieter integrity facts). Keep `data-testid="quiz-score"`.
- [x] U4.2 `QuestionReview.tsx`: compact card, status pill, option states (tint + icon + word), reasoning block, disclosure row. Pure presentational; no data changes (`ReviewItem` stays).
- [x] U4.3 `AttemptReview.tsx` (My quizzes) shares both components, so check it once more; no separate styling.
- [x] U4.4 Tests: a component test for the review states (correct, wrong pick, right pick, skipped, select-all, a reason present/absent) asserting the words and icons exist (not colour).
- [ ] U4.5 Verify two review cards fit at 1366×768 in light and dark; read a real quiz with long reasons for the worst case.

Done when: a person can tell right from wrong from their pick at a glance, the reasons read as a separate, calm block, and two questions show per screen.

### U5: Other player screens

- [x] U5.1 Walk lobby, join, my quizzes, leaderboard, profile, sign-in/up/reset/verify, the public home page and the admin pages in light; fix what looks off (these are mostly already token-based).
- [ ] U5.2 Check the print stylesheet and the OG image are unaffected.

### U6: Final QA and docs

- [x] U6.1 `npx tsc --noEmit`, `npm run lint`, `npm run build`, the unit/component tests; bundle budget (public pages < 170 kB First Load JS, check the toggle did not push `/join` over).
- [x] U6.2 Keyboard and screen-reader pass on the toggle and the new review (focus ring visible in both themes; the toggle has an accessible name and state).
- [x] U6.3 Add to `docs/MANUAL_STEPS.md`: look at both themes on a real phone and a laptop; check the system theme switch live.
- [x] U6.4 Update `CLAUDE.md` ("Site shell and design system": theme now comes from `<html data-theme>`, default light, the toggle, no per-page lock) and the roadmap's Design principles line; tick this file.

## Effort and risk

| Part | Size | Why |
|---|---|---|
| U1 theme switch | **Medium** (about half a day of work) | The tokens exist; the work is the no-flash script, a toggle, and removing ~22 hard locks. The risk is not the code but small visual leftovers, which U5/U6 sweep. |
| U2 palette polish | Small | Two measured contrast fixes, a few tokens, one script. |
| U3 exam compaction | **Easy** | Three files, mostly class changes. Fast to see and tweak. |
| U4 results redesign | Medium | Two components redesigned, plus tests; design taste matters more than difficulty. |
| U5/U6 QA | Small–medium | Mechanical, but the part that makes light mode "perfect". |

Realistic total: **2–3 focused sessions**; the exam screen (U3) alone is one short session and can ship first. Not hard, no data or API changes, no migrations, nothing to deploy beyond a normal release. The one thing I cannot do from here is judge it on your real devices, hence U0 and U6.3.

## Order of work

U0 → **U3** (quick visible win) → U1 → U2 → U4 → U5 → U6. U3 and U4 are styled with tokens only, so they come out right in both themes whenever U1 lands.

## Out of scope (ideas for later)

- A text-size control (A− / A+) in the exam, and a "Compact / Comfortable" density switch for the review.
- Collapsing correctly answered questions by default in the review ("Show incorrect first").
- A high-contrast theme.

## Session log

- **2026-10-27 (Session 1):** Audited the theme (tokens complete, dark locked on ~22 wrappers, no switch), measured the exam and review sizes from the classes, measured light-mode contrast (two failures found: accent text and control borders), researched typography/theme practice (limited sources, noted above), wrote this plan. No code changed. Next: U0, then U3.
- **2026-10-27 (Session 2):** U0.2: baseline `exam-logic` + `quiz-attempt` tests green (109). U0.1 (screenshots) not done: no browser available here, left open. U3 (done in the plan's order, before U1): `QuestionView` question text 18 px (20 px from `lg`) weight 500, `leading-[1.45]`, the "Question N" label removed (the sr-only "Question N of M:" in the heading and the top bar's "Q N of M" remain), select-all hint is quiet mono 12 px under the question, options `min-h-11` / `py-2` / `gap-3` / 24 px badge / `space-y-2`, unselected border `border-strong`, selected 2 px accent border with the padding reduced by 1 px so rows do not jump; hint/Clear row 36 px. `ExamTopBar` is one 56 px row (title, Q N of M, progress bar in the middle, questions button < lg, clock, Submit); on phones the title is sr-only and the bar is a 2 px line along the bottom edge. `ExamShell` gaps (`pt-4 lg:py-6`, buttons `mt-3 lg:mt-4`), navigator 16 rem and `top-20`. `tsc`, `lint`, `quiz-attempt.test.tsx` (47) pass with no test changes. Not verified: how it looks at 1366×768 / 390×844 (U3.4 left unchecked; steps added to MANUAL_STEPS). Nothing committed yet. Next: U1 (theme switch).
- **2026-10-27 (Session 2, later):** U1 built. `lib/theme.ts` (types, `resolveTheme`, storage with try/catch, `applyTheme`, `setPreference` with `data-theme-switching` for two frames, and `themeInitScript` built from the same constants), inline script in `<head>`, `<html data-theme="light">`, `ThemeSync` (OS change while on System, other tabs via `storage`), `useThemePreference` (`useSyncExternalStore`), `ThemeToggle` (`icon` variant steps Light, Dark, System; `segmented` variant uses `SegmentedControl`). Placed in: header (desktop), mobile drawer, Profile → Appearance, exam top bar (hidden on phones, where the Questions sheet carries the segmented control instead). Removed `data-theme="dark"` from 21 files (all wrappers, Header, Footer, Dialog, Toast, ExamShell, FullscreenGate); AdminShell's outer `data-theme="light"` removed so the admin body follows the theme, its dark top bar stays. Raw classes: Header/Footer/ExamTopBar/FullscreenGate `bg-ink` -> `bg-bg`/`bg-bg-alt`; scrims `bg-ink/70` kept (a dark scrim is right in both themes); `Logo`/`LogoWordmark` get an `auto` variant (stroke/text follow `text-text`, now the default). `bg-noise` is defined but unused; `bg-grid` and `glow-teal` use `--color-text` / teal at low alpha so they work in light. `viewport`: two `themeColor` entries and `colorScheme: "light dark"` (the address bar follows the OS, not a manual choice that differs: noted in the code). Tests: new `__tests__/theme.test.tsx` (11: resolve, defaults, throwing storage, the inline script run for real, toggle, switching flag, ThemeSync). Checks: `tsc`, `lint` clean; 123 UI tests green; `npm run build` ok, public pages: `/` 163 kB, `/join` 166, `/q/[id]` 169, `/sign-in` 163 (budget 170); `/my-quizzes/[attemptId]` is 171 (signed-in page, not measured before). Updated `CLAUDE.md` (theme paragraph) and the roadmap's Design principles line. Not verified: how any page looks in light or dark in a real browser (U5 walk-through); contrast of `text-accent` small text in light is still open (U2.2); `text-warning` (amber) on bone is likely weak (check in U2). Next: U2, then U4.
- **2026-10-27 (Session 2, end):** U2 and U4 built.
  - **U2.** New tokens in `app/theme.css` for light, dark, the nested-dark block and print: `success-soft/-line`, `error-soft/-line`, `accent-soft`, `text-faint`, `warm-text`, `--shadow-card` (none on dark, a hairline on light) and **`control-border`** (3:1 edge for controls: `#8a8780` light, `#6b727d` dark; `border-strong` stays for decoration, because it is also used for scrollbars and dialogs). Light `warning` and `warm-text` are `#8a5300` (the amber fill is too pale as text on bone; the amber fills for Button/Badge are unchanged). Every `text-accent` became `text-link` (same teal in dark, `#0a756b` in light) and `text-warm` became `text-warm-text`. Controls use `control-border`: Field, SegmentedControl, inactive Chip, answer options. Card has `shadow-card`; Skeleton is `bg-border/70` (it was white on bone); Badge default has a border; ghost Button hovers with a 6% text tint. `scripts/check-contrast.mjs` reads the tokens (it needs hex values, so the dark tints are hexes, not `color-mix`) and checks 28 pairs in both themes (AA 4.5 for text, 3:1 for control edges and the focus/progress accent); `__tests__/theme-contrast.test.ts` runs it. All pass. `text-faint` is only 4.13:1 on white: it is for placeholders only and is checked at 3:1; nothing essential may use it.
  - **U4.** `QuestionReview` rewritten (pure presentation, `ReviewItem` unchanged): `p-4`, mono "Question N" with a small status pill (icon + word on a tint), question 16 px / 500, options 15 px with `py-2`, a right option = soft green + check + pill, a wrong pick = soft red + cross + pill, others plain with their letter; the existing wording of the pills is kept ("Your answer", "Correct answer", "Your answer · Correct answer"). A reason sits in a ruled block inside its option ("Why it's correct" / "Why it's wrong", 3 px green or red rule), the overall explanation in its own neutral ruled block ("Explanation"), and "Why the others are wrong" is a disclosure row with a chevron. `ResultsScreen`: card 20 rem, score `text-5xl`, a three-cell strip (Correct, Time, Difficulty), then "Not answered" and the integrity counts as quiet small rows; `data-testid="quiz-score"` kept. `AttemptReview` shares both, only its loading skeleton width changed. The "Flagged" filter was **not** added: flags are in the attempt's state, not in the submit result, and adding them would be a data change. New `__tests__/question-review.test.tsx` (6) asserts words and icons for right pick, wrong pick, skipped, select-all, reasons present and absent.
  - **Checks:** `tsc`, `lint` clean; 193 UI/unit tests green across 12 files; `npm run build` ok, sizes unchanged (`/` 163, `/join` 166, `/q/[id]` 169, `/my-quizzes` 169, `/my-quizzes/[attemptId]` 171 kB).
  - **Not verified:** that two review cards fit at 1366×768 and how any of it looks (U4.5, U3.4); the editor's `PlayerPreview` and the `(admin)` pages in dark; U5/U6 are still open. Nothing committed. Next: you look at it in a browser (MANUAL_STEPS), then U5 fixes what you find, then U6.
- **2026-10-27 (Session 3, U5):** Looked at the screens in a real (headless Edge) browser at 1366×768 and 390×844 in both themes: home, join, sign-in, sign-up, reset-password, verify-email, a real quiz lobby, the mobile menu and the exam's Questions sheet, the exam (a typical question, a 10-line question with 6 options, select-all, a picked answer), results and review, and with fake data in a temporary page (deleted, never committed) My quizzes, Leaderboard, Profile → Appearance, Admin Users, Reports and Quizzes. Not seen: the signed-in pages with real data (they need a sign-in), the admin shell and dashboard, the editor, the strict-mode fullscreen gate. No console or hydration errors on any real page (the preview page's own hydration warnings came from `Date.now()` in the fake data).
  - **Verified:** a normal question with 4 options and the Next button fits in 768 px and in 844 px on a phone; a 10-line question scrolls as intended; the top bar is one row, the phone bar shows "Q N of M", the questions button, the clock and Submit; both toggles (icon in the header, segmented in the menu, the sheet and Profile) work and read well; light and dark look right everywhere seen.
  - **Fixed (found by looking):** inputs, selects, search fields, the join/lobby code fields, the Google button, the difficulty options and the navigator's unanswered cells still used the 1.4:1 `border-border`; they now use `border-control-border`, and placeholders use `text-text-faint`. The picked option, picked segment, answered question and picked difficulty use the new `bg-accent-soft` (in light `bg-accent/10` gave a muddy grey-green). The practice fullscreen notice wrapped to three lines on a phone: it is now one line there ("You've left fullscreen." + "Return" + "Dismiss"; the screen-reader name is still "Return to fullscreen"; the inner span keeps the space that a flex button would swallow). In a quiz card the divider touched the description text; the footer now has its own padding.
  - **Not done:** U4.5: with a reason on the right option, a "Why the others" row and an explanation, one review card is about 495 px, so about one and a half cards fit at 768 px; with at most one reason block it is about 300-400 px and two fit. I did not tighten it further because the reasons are the point of the review. U5.2 (print, OG image): `app/opengraph-image.tsx` is untouched and the print block got the new tokens, but I did not render either.
  - **Checks:** `tsc`, `lint` clean; 12 UI test files (157 tests) plus `quiz-editor-speed` (22) and `import-wizard` (15) pass; `npm run build` ok, `/join` 166, `/q/[id]` 169, `/my-quizzes` 169, `/my-quizzes/[attemptId]` 171 kB. Next: U6.
- **2026-10-27 (Session 4, U6):** Final QA.
  - **U6.1.** `npx tsc --noEmit` and `npm run lint` clean; `npm run build` ok. First Load JS: `/` 163, `/join` 166 (the toggle did not push it over), `/q/[id]` 169, `/sign-in` 163, `/sign-up` 163, `/reset-password` 159, `/verify-email` 161, `/leaderboard` 165, `/my-quizzes` 169 kB, all under 170; `/my-quizzes/[attemptId]` is 171 (signed-in page, same as the last session). Tests: 13 files, 254 tests pass (`exam-logic`, `quiz-attempt`, `theme`, `theme-contrast`, `question-review`, `auth-pages`, `home-page`, `leaderboard-page`, `my-quizzes-page`, `profile-page`, `server-rendered-pages`, `admin-pages`, `access-control`). The editor and import test files were not rerun (nothing they cover changed this session; they passed in Session 3).
  - **U6.2.** Done by reading the code and the existing tests, not with a screen reader. The icon toggle is a real `<button>` named "Theme: Light. Switch to Dark." (the name carries the current state; `theme.test.tsx` asserts it); the segmented toggle is a `fieldset` named "Theme" over native radio inputs (arrow keys, checked state, `Tab` into the group come from the browser) and its focus ring is drawn on the visible segment (`peer-focus-visible`). Every other control, the "Why the others are wrong" `summary` included, gets the global `:focus-visible` 2px accent ring, which the contrast script checks at 3:1 against both backgrounds. In the review, the status pill, the "Your answer" / "Correct answer" pills and the "Why it's correct" / "Why it's wrong" / "Explanation" labels are real text; only the check, cross and letter badge are `aria-hidden`, so a screen reader hears the same facts as the screen shows. Not done: a run with NVDA/VoiceOver (added to MANUAL_STEPS).
  - **U6.3, U6.4.** MANUAL_STEPS has the theme, exam and review checks, now with a keyboard/screen-reader item and the print / OG image check. `CLAUDE.md` ("Site shell and design system") and the roadmap's Design principles line already carry the theme rules from Session 2; checked, no change needed.
  - **Left open (needs you):** U0.1 baseline screenshots, U3.4/U4.5 by eye on a real laptop and phone, U5.2 print and OG image, the signed-in pages with real data, and a screen-reader run. Nothing else in the plan is open.
