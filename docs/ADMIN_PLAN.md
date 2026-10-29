# Ageno Quiz Admin Plan

**Purpose:** make the admin side fast, safe and pleasant to run: bring a whole quiz in from a file (or from an AI) in minutes, support questions with several correct answers, attach reasoning to every answer option, and see how each question performs. Same rules as the other plans: phases, checkbox tasks, a status table and a session log.

- **Created:** 2026-10-26
- **Last updated:** 2026-10-29 (Session 16: A5.1 to A5.3 built; browser check outstanding)
- **Current phase:** A5 (A5.1 backfill run, A5.2 results by question and A5.3 attempt review built; the browser check is in MANUAL_STEPS; A5.4 dashboard strip and A5.5 CSV next). A3 still waits on its browser check and Storage setup, A2 on its browser check and a try of the skill; A1.10 waits one release; then A4
- **Related:** `docs/IMPROVEMENT_ROADMAP.md` (its Phase 8 "Pro exam features" items are folded in here where they touch admin), `docs/PERFORMANCE_PLAN.md` (speed rules still apply), `docs/MANUAL_STEPS.md` (things only the user can do)

---

## How to use this file (for AI sessions)

1. Read the **Status** table and the **Session Log** first, then **Recommended order**.
2. Pick the first unchecked task in the current phase. Read the files it names before editing; line numbers drift.
3. After each task run `npx tsc --noEmit` and `npm run lint`, plus the tests the task names. At the end of a phase run `npm run build` and look at the screens in `npm run dev`.
4. Tick a box only for what you verified. Update Status, "Current phase", "Last updated" and add a Session Log entry.
5. Obey the architecture rules in `CLAUDE.md`. The ones this plan leans on hardest:
   - the browser never touches Firestore; every admin action is a route under `app/api/admin/*` guarded by `requireAdmin`;
   - `lib/quiz-schema.ts` is the one description of a quiz; the editor and the server both call `validateQuizInput`;
   - any code path that writes a quiz or its questions must call `invalidateQuiz(id)`;
   - any code that writes `responses` must keep `leaderboard/*` and `userTotals/*` in step;
   - UI follows the Agenoverse design system (dark ink + teal, tokens, `components/ui`, no component library, no emoji).
6. **Data changes follow "expand, then contract"** (see 3.2): add the new shape, make every reader accept old and new, ship, backfill, and only later remove the old reading code. Never a big-bang migration.
7. Reference task IDs in commits: `feat(admin): A1.3 multi-answer scoring`.

---

## Status

| Phase | Title | Priority | Status |
|---|---|---|---|
| A0 | Decisions | now | Done (2026-10-26) |
| A1 | Question model v2: several correct answers, reasoning per option, a cheaper submit | P0 | In progress (built; browser check and `admin-api` run outstanding) |
| A2 | Quiz format, import/export, and the AI skill | P0 | In progress (built; browser check and a real AI run outstanding) |
| A3 | Faster editing | P1 | Built (A3.1 to A3.6; browser check and Storage setup outstanding) |
| A4 | Quiz lifecycle (draft, schedule, trash, versions) | P1 | In progress (A4.3 trash done) |
| A5 | Insights (attempt review for admins, question analytics) | P1 | Built (A5.1 to A5.3; browser check outstanding; A5.4 and A5.5 not started) |
| A6 | Governance (audit log, editor role, user tools) | P2 | Not started |
| A7 | AI built into the app (optional) | P3 | Not started |

Status values: `Not started`, `In progress`, `Done`, `Blocked (reason)`.

---

## A0: Decisions made

| # | Decision |
|---|---|
| 1 | Questions mostly arrive from AI conversions of existing question sets, so a **strict, versioned JSON format plus an AI skill** is the main way in. Paste-from-spreadsheet, CSV and a plain-text format stay as the human routes. `.xlsx` upload and GIFT/QTI wait until someone asks. |
| 2 | Review shows the correct option(s) always, your wrong picks with their reasons, and the other options' reasons in a fold. |
| 3 | One `admin` role now. The editor role (A6.2) waits for a second administrator. |
| 4 | The AI **skill** (outside the app, run by the admin's own AI) is in. AI **inside** the app (A7) is not, until A1–A5 are done. |
| 5 | A large replace may close the quiz for new attempts for a moment while it applies (chunked path, A2.8). |
| 6 | **Several correct answers are supported.** Questions have an explicit `type`: `single` or `multiple`. Multiple scores **all-or-nothing** (the picked set must equal the correct set). Partial credit is a later per-question option. Players are told how many to choose ("Choose 2"). True/false is a single question with two options. Short answer is deferred. |
| 7 | The canonical import/export format is **JSON** ("Ageno Quiz Format v1"), the same shape the editor and server validate, with a small envelope. |
| 8 | The data structure changes where it should (A1): answers become lists, the correct key becomes a list, questions carry `type` and `schemaVersion`, and a submit stops writing one document per answer. |

---

## Part 1. How admin works today

Read from the code on 2026-10-26.

**Screens** (`app/(admin)`, served at `/dashboard`, `/quizzes`, `/users`, `/quiz-reports`): dashboard (totals, average score, recent results, score and time bands), quiz list, a read-only quiz view, one editor for create and edit, users, reports.

**Access.** Server layout verifies the session cookie and the role on every request (`lib/server/admin-access.ts`); every `/api/admin/*` route calls `requireAdmin`. Two roles: `admin` and `user`. Demotion revokes sessions; you can't change your own role or delete the last admin. This part is solid.

**Quiz data.** A quiz is one document plus one subcollection per difficulty (`questions_easy|medium|hard`). Saving is one transaction with a `version` check. A question is `{ text, options: [{ text, isCorrect }], type: "single", points: 1, explanation?, imageUrl?, order }`: one correct option, one optional explanation. The server copies the questions (key included) into each attempt document.

**Getting questions in.** Typing in the editor, or the JSON dialog (`ImportDialog.tsx`): one level at a time, questions only, no preview, no per-row errors.

**Gaps**

| Area | Gap |
|---|---|
| Question types | **Exactly one correct answer, everywhere.** `validateQuestion` rejects more than one; an answer is one number (`sanitizeAnswers`, `AnswerMap`); `scoreAttempt` compares one index; the exam uses radios; the review marks one. |
| Reasoning | One explanation per question. No reason per option. |
| Authoring | No bulk entry beyond JSON. No spreadsheet or text import. No whole-quiz import. No duplicate quiz. No preview-as-player. Images are pasted https links. |
| Submit cost | A submit writes a document per answered question under `responses/{id}/answers/*` **in the same transaction**. Nothing in the app reads them (only tests do). That is up to 400 wasted writes per submit, ties the question limit to Firestore's 500-write transaction cap, and makes per-question analytics a read-per-answer. |
| Safety | Deleting a quiz **permanently deletes every result with it**, immediately. No trash, no undo, no version history, no audit log of admin actions. |
| Lifecycle | Only `active` and `isPublic`. No draft state, no open/close window, no attempt limits, no tags. |
| Insight | Reports show score and integrity counts per attempt. No per-question view. The admin can't see an attempt's answers or its integrity timeline (`integrityEvents` is stored, never shown). |
| Users | List capped at 500, filtered in the browser. No disable account, no per-user history. |
| Write limits | A save is one transaction of at most 500 writes. Replacing a 400-question level can need 800, so it is refused. |
| Attempt size | An attempt document holds the questions **and** the stored result with the review (explanations twice). Per-option reasons would roughly double that against the 1 MiB document limit. |

---

## Part 2. What the research says

Searches run 2026-10-26. Where a search did not find what I wanted, this says so.

**Bulk import (Canvas, Moodle, vendor LMS docs).** Proven pattern: official **template** → upload → **validate and report per row** → import the good rows → summary of failures. Vendors stress exact headers, UTF-8, one answer per cell. [uteach](https://uteach.io/support/products/import-quiz-questions-with-bulk-import), [SmartWinnr](https://help.smartwinnr.com/article/46-how-to-use-import-questions), [Learnamp](https://learnamp.atlassian.net/wiki/spaces/KB/pages/1157005326/Quiz+Import). Moodle's formats are GIFT and Moodle XML. [Moodle export docs](https://docs.moodle.org/501/en/question/export). Not found: Kahoot/Quizizz/Google Forms details, QTI 3.0.
**Excel security:** the `xlsx` package on npm stops at 0.18.5 with known prototype-pollution and ReDoS advisories; fixed versions ship only from SheetJS's own site. So: no npm `xlsx`; CSV/TSV and JSON need no risky parser. [Snyk](https://security.snyk.io/package/npm/xlsx/0.18.2)

**Reasoning per option.** Sources agree distractors built on common misconceptions are diagnostic and that plausible distractors make learners think about several concepts. [The eLearning Coach](https://theelearningcoach.com/elearning_design/tests/the-importance-of-writing-effective-distractors/), [Learning & the Brain](https://www.learningandthebrain.com/blog/can-multiple-choice-tests-really-help-students/). A 2005 meta-analysis cited there found three options are often enough. **I found no study isolating "a reason on every option" from "a reason on the correct answer only"**, so it stays optional.

**Item analysis.** Difficulty index (target about 30–70% correct), discrimination index (above about 0.25 is good; negative suggests a wrong key), distractor efficiency (an option picked by under 5% is non-functional). [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11040895/), [APIMS](https://apims.net/apims/article/view/9). No platform's screen layout was found; A5's design is mine.

**AI-drafted questions.** LMS products make the feature opt-in, AI drafts, a named reviewer accepts or rejects each item, nothing goes live unapproved; education guidance says not to use it unreviewed for high-stakes assessment. [OpenEduCat](https://openeducat.org/glossary/what-is-ai-quiz-generator/), [ZenQMS](https://support.zenqms.com/hc/en-us/articles/52105778114835-AI-Generated-Training-Challenge-Questions-on-Documents). Not found: standards for answer-key validation.

**Audit logs.** Append-only, who/what/when on each entry; hash-chaining is the heavy version. With a database only the server touches (`firestore.rules` denies browsers), append-only writes from one module are enough. [Overview](https://www.techinterview.org/post/3233465643/system-design-audit-log/). Not found: soft delete or version history patterns; A4 uses ordinary practice (trash with retention, typed confirmation for permanent delete, full-snapshot revisions), not a cited standard.

**Data evolution** (not searched; standard practice): version the stored shape, make readers tolerant, add before removing ("expand and contract"), backfill with a dry-run script. The repo already works this way (`migrate:questions`, `backfill:leaderboard`).

---

## Part 3. Design

### 3.1 Question model v2

**Stored question** (`quizzes/{id}/questions_{level}/{qid}`):

```
{
  schemaVersion: 2,
  type: "single" | "multiple",
  text, order, points: 1,                      // points kept for older readers
  options: [{ text, isCorrect, rationale? }],
  explanation?, imageUrl?
}
```

- `type` already exists as the constant `"single"`; it becomes real. Rules: `single` = exactly one correct option; `multiple` = at least one correct option (a warning if every option is correct). 2–10 options, as now.
- `rationale` (≤ `LIMITS.rationale` = 1000 chars) is per option; `explanation` stays as the overall note. Both optional, independently, per question. No quiz-level requirement.
- `scoring` (`all_or_nothing` | `partial`) is **not stored yet**; the field name is reserved and added when partial credit is built. Default behaviour = all-or-nothing.
- Old documents (no `schemaVersion`, `type: "single"`, string options, `correctIndex`) keep reading through `normalizeQuestion`, which becomes the only place that understands every shape.

**In memory on the server** (`StoredQuestion`, used by attempts and scoring):

```
{ id, text, options: string[], type, correct: number[], rationales?: (string|null)[], explanation?, imageUrl? }
```
`correctIndex: number | null` is replaced by `correct: number[]` (empty = no key; nothing counts as right, as today). A helper `upgradeStoredQuestion()` accepts the old `correctIndex` shape, because **attempts already in progress hold old-shape snapshots** and must finish.

**Answers** become lists everywhere: `AnswerMap = Record<questionId, number[]>`, indexes sorted, unique, in range; `[]` means unanswered. `single` allows at most one pick. The server's `sanitizeAnswers` accepts the old `number | null` too (old browser tabs, the device autosave under `ageno:quiz:attempt:*`, in-progress attempt documents) and always stores the list form.

**Scoring** (`lib/exam/scoring.ts`, still server-only): a question is correct when the picked set equals the correct set. `answered` = non-empty pick. `correct`, `rawPercent`, the multiplier and the leaderboard arithmetic are unchanged, so the leaderboard needs no change.

**What players are told.** `ExamQuestion` gains `type` and, for `multiple`, `pickCount` (the number of correct options, so the UI can say "Choose 2"). That is the only key-related thing sent before submit, and it is intentional. Nothing else about the key or any reason is sent.

**Exam UI.** `single` stays a radio group. `multiple` is a checkbox group ("Select all that apply · Choose 2"), keys 1–9 / A–F toggle, the navigator's "answered" means at least one pick. Mobile targets stay ≥ 44px.

**Review and results.** `ReviewItem` becomes `{ correct: number[], explanation?, optionRationales? }`. Each option shows its tags (Your answer / Correct answer), then its reason if there is one. Wrong picks show their reason emphasised; the correct options' reasons are always shown; the remaining options' reasons are in a "Why the others are wrong" fold. A question with only an `explanation` renders as today. Stored results from before v2 (`correctIndex`) are read through one helper, `reviewCorrect()`.

### 3.2 Data structure changes (done properly)

Ship in this order, all in A1:

1. **Expand.** New fields and shapes are written from the first deploy; every reader accepts old and new. Question docs get `schemaVersion: 2` only when saved by the new editor, so existing quizzes aren't touched until someone edits them.
2. **Responses get a compact answer sheet and stop writing one doc per answer.**
   ```
   responses/{attemptId}: { …existing fields…, schemaVersion: 2,
     sheet: { [questionId]: { p: number[], ok: boolean } } }   // p = picked options, ok = scored correct
   ```
   Same data the `answers/*` documents held, plus multi-select, in one document (≤ ~10 KB at 400 questions). A submit now writes about four documents instead of up to 404, so the question limit no longer depends on the transaction cap. Per-question analytics (A5) read one document per response, not one per answer. The old `answers/*` documents stay where they exist (user and quiz deletion already `recursiveDelete` them). `backfill:sheets` (dry run unless `-- --apply`) builds `sheet` for older responses from their `answers/*`.
   Pick indexes are the **canonical option positions**, so future per-attempt option shuffling can map back; analytics ignore a question's picks if its option texts changed since (`sheet` entries carry no hash; analysis compares the response's `submittedAt` with the question's last change in revisions once A4.4 exists, and until then states the caveat).
3. **Review is derived, not stored.** `result.review` stops carrying text; the review is rebuilt from the attempt's own `questions` snapshot when a result is returned (submit and `GET /api/attempts/[id]/result`), so reasons and explanations are stored once. Old attempts with a stored review keep using it.
4. **Size budget.** `LIMITS.maxLevelBytes` (about 300 KB of question text, options, reasons and explanations per level) enforced by `validateQuizInput` with a clear message, plus a size meter in the editor. A test builds a worst-case attempt and asserts it stays well under 1 MiB.
5. **Contract, later.** After a release in which no new write uses the old shapes, and after the backfills, a follow-up task (A1.10) removes the compatibility code that is no longer reachable, keeping the normalizers for stored quizzes.
6. **No data migration of questions is required**: old questions read as `type: "single"`. A `migrate:questions-v2` script (dry run by default) may rewrite them to the v2 shape for tidiness; optional.

Firestore rules stay "deny everything"; no new rules. New indexes are only needed if a new query appears (A4/A5 note theirs).

### 3.3 The format and the AI skill (A2)

> Tables, lists and code inside `text` / `explanation` (a Markdown subset in the same string, format still v1) are specified in `docs/RICH_TEXT_PLAN.md`; the AI rules for them are rules 7 and 8 in `lib/quiz-format/instructions.ts`.

**Ageno Quiz Format v1** is JSON: the editor's `QuizInput` plus an envelope. One schema, not two.

```json
{
  "format": "ageno-quiz",
  "version": 1,
  "quiz": {
    "title": "Network basics",
    "description": "…",
    "duration": 20,
    "examMode": "practice",
    "showAnswerReview": true
  },
  "levels": {
    "easy": {
      "duration": 20,
      "pointsMultiplier": 1,
      "questions": [
        {
          "type": "single",
          "text": "Which protocol encrypts web traffic?",
          "options": [
            { "text": "HTTP",  "isCorrect": false, "rationale": "Sends data in plain text." },
            { "text": "HTTPS", "isCorrect": true,  "rationale": "Adds TLS on top of HTTP." },
            { "text": "FTP",   "isCorrect": false }
          ],
          "explanation": "The S stands for secure.",
          "imageUrl": "https://example.com/diagram.png",
          "note": "AI inferred the answer; please check."
        }
      ]
    }
  }
}
```

- Required: a `levels` entry with `questions`, each with `text`, `options` (with `isCorrect`). `type` defaults to `single` when exactly one option is correct and `multiple` when more than one is (the file may state it; a mismatch is an error).
- `quiz` and the level settings are optional. A file may also be a bare list of questions or one level, for adding to an existing quiz.
- `id` on a question is optional and means "update this question"; without it the question is new. Export writes ids.
- `note` is never stored; the import preview shows it so guessed answers get checked.
- `version` is checked: unknown versions are refused with a clear message; older ones keep being read. The format version is separate from the stored `schemaVersion`.
- Cell and field text is plain text everywhere, never HTML.

**One source of truth, generated artifacts.** The rules live in `lib/quiz-format/` (pure TypeScript) built on `LIMITS` and `validateQuizInput`. A script `npm run build:format` generates, from that code:
- `public/ageno-quiz/schema.json` (JSON Schema, served by the app at a stable URL),
- `skills/ageno-quiz-format/validate.mjs` (one dependency-free file the AI can run on its output),
- the example files and the template CSV.
`npm run build:format -- --check` fails if the generated files are stale; a test also checks that every fixture the JSON Schema accepts passes `validateQuizInput` and the other way round (contract test with `ajv` as a dev dependency).

**The skill** (`skills/ageno-quiz-format/`): `SKILL.md` (name, description, rules), `schema.json`, `validate.mjs`, `examples/`. Rules for the AI:
1. Ask only for what's missing (level, time, whether to add reasons); don't ask what the source already says.
2. Never invent a correct answer the source doesn't give. If it had to infer one, say so in `note`.
3. Use `multiple` only when the source says select-all-that-apply or more than one answer is right.
4. 3–5 options unless the source has more; don't pad with silly distractors; vary where the correct answer sits; no "all/none of the above".
5. Add `rationale`s and `explanation`s when asked or when the source provides them, never fabricated "facts".
6. Keep within the limits (text lengths, ≤ 400 questions per level); split into several files otherwise.
7. Run `validate.mjs`, fix what it reports, and only then hand over `quiz.ageno.json`.

**No-install fallback.** The admin "AI & formats" page (A2.7) has a "Copy AI instructions" button (the same rules plus the schema, ready to paste into any AI chat), the template downloads, and a link to the skill folder or a zip of it. Check the current way skills are packaged for Claude Code and claude.ai when building this; don't rely on this plan's description.

### 3.4 The import flow (A2)

1. **Pick the way in** (page `/quizzes/import`, also from the editor): upload or paste **JSON** (the AI route); **paste cells copied from Excel or Sheets** (clipboard text is tab-separated, so no file parser is needed); **upload CSV** (UTF-8 with BOM handled); paste/upload the **plain-text format**. All routes produce the same `QuizInput`.
2. **Map** spreadsheet columns by header name; ask only when ambiguous.
3. **Preview and check.** Table of every question with ok / warning / error, inline fixes, summary ("46 questions: 44 ready, 2 need fixing (rows 7, 31)"). Warnings: duplicate text (in the file and against the quiz), one option, no correct answer, `multiple` with every option correct, correct answer naming a missing option, very long option, non-https image, any `note` from the AI.
4. **Choose the target:** new quiz / add to a level / replace a level / **update in place by question id**.
5. **Show the plan** before writing: "12 new, 30 changed, 5 removed, 3 unchanged" (exactly `planQuestionWrites`'s output).
6. **Commit** through the existing create/save routes; the server runs `validateQuizInput` again.

Spreadsheet columns (one row per question; the template has an instructions row and a sample row, and import skips rows starting with `#`):
`level | type | question | option_a … option_f | correct | explanation | a_why … f_why | image`
`correct` accepts `B`, `b`, `2`, the exact option text, or a list for multiple (`A,C`).

Plain-text format (human typing; `[x]` = correct, `~` = reason for the option above, `>` = overall explanation, `!` = image):

```
# Network basics
## Easy | 20 min | x1

1. Which protocol encrypts web traffic?
   - HTTP
     ~ Sends data in plain text.
   - [x] HTTPS
     ~ Adds TLS on top of HTTP.
   > The S stands for secure.
```
More than one `[x]` makes the question `multiple`.

Parsing is pure code in `lib/quiz-import/` (no Firebase, no DOM), runs in the browser, and is tested on awkward input: quoted commas, line breaks inside cells, BOM, CRLF, stray whitespace, empty trailing rows, duplicate headers.

**Export.** "Download quiz" as JSON (the format above, with ids and reasons), CSV or text. It is also the backup and the edit-in-Excel loop.

**Big writes.** `updateQuiz` is one transaction capped at 500 writes, and "replace a 400-question level" can need 800. Under the cap: unchanged. Over it: the route sets `importing: true` on the quiz (new attempts get a polite "this quiz is being updated"; running attempts finish because they hold a snapshot), writes in chunks of 450 with `BulkWriter`, then sets the final quiz fields, clears the flag and calls `invalidateQuiz`. If a chunk fails, the flag stays and the admin sees what state it is in with Retry or Undo; never claim "atomic" for this path. `createQuiz` already chunks with rollback; reuse it. Considered and rejected for now: a `setVersion` pointer swap (cleaner semantics, but every reader changes).

### 3.5 Editing speed (A3)

Grid view (one row per question, keyboard navigation, paste many rows); draft autosave to the device (`ageno:admin:draft:<quizId|new>`) with a restore prompt; preview as player (the real `QuestionView` and `QuestionReview`); a Checks panel (duplicates, answer position patterns, "all of the above", no explanation, options never chosen once A5 exists); duplicate quiz, copy/move questions between levels, multi-select; image upload to Firebase Storage (admin-only route, Storage rules, size/type limits) last.

### 3.6 Lifecycle (A4)

`status` (`draft | published | archived`; existing `active` quizzes migrate to published, inactive to archived); `opensAt` / `closesAt` and attempt limit / cooldown enforced in `startAttempt`; **trash** (soft delete, results kept, leaderboard rows hidden, Restore, and "Delete forever" that needs the title typed and states how many results go); **revisions** (full snapshot per save, last 20, restore = a normal save, chunked path for big ones); tags and list filters; bulk actions on the list.

### 3.7 Insights (A5)

Per quiz, a Questions tab: attempts, % correct, discrimination (top vs bottom 27% by score), per-option pick rate with a flag under 5%, and flags ("very hard < 30%", "very easy > 90%", "negative discrimination: check the key"). Reads `sheet` from the latest N responses (default 2000, one document each), cached 5 minutes; no hot counter document (one counter would cap submits near one write per second during a mass exam). Multi-select questions show pick rates per option the same way. Attempt detail from a report row: answers against the key, the integrity timeline (`integrityEvents`), **void** (same code path that keeps `leaderboard/*` and `userTotals/*` right) and **allow another attempt**. Dashboard "needs attention" strip and a 30-day trend from cached count queries.

### 3.8 Governance (A6)

`adminAudit/{autoId}` written only by `recordAdminAction()` from every admin route (actor, action, target, small before/after summary with no answer keys or personal data, time), in `after()`; no route updates or deletes it. Editor role as least privilege (`requireRole`). Users: server-side search and paging, disable/enable account, per-user page, CSV, optional groups.

### 3.9 AI inside the app (A7, optional)

Server-side only, off by default, admin-only, rate-limited, drafts only. Fill empty reasons for existing questions as suggestions; draft questions from pasted text into the A2 import preview, marked "AI draft" until accepted. Source documents are untrusted text: output is only ever data validated by the schema, never an action. Entries in the audit log say content was AI-drafted.

---

## Part 4. Phases and tasks

### Phase A1: Question model v2 (P0)

Files: `lib/quiz-schema.ts`, `lib/exam/{normalize,scoring,answers,types,storage}.ts`, `lib/server/attempts.ts`, `hooks/useQuizAttempt.ts`, `components/quiz/exam/{QuestionView,QuestionNavigator,ExamShell,ResultsScreen,QuestionReview}.tsx`, `components/admin/quiz-editor/*`, `app/(admin)/quizzes/[quizId]/page.tsx`, `scripts/`.

- [x] **A1.1 Schema and normalizers.** `type`, `rationale`, `schemaVersion`, `LIMITS.rationale` / `maxLevelBytes`; `validateQuestion` per type (single exactly one, multiple at least one); `questionToDoc`, `questionFromStored`, `normalizeQuestion` (→ `correct: number[]`, `rationales`), `upgradeStoredQuestion`. Tests in `quiz-schema.test.ts` and `exam-logic.test.ts` covering every legacy shape.
- [x] **A1.2 Answers as lists.** `AnswerMap`, `sanitizeAnswers` (accepts old and new, enforces `single` ≤ 1), device-storage reader accepts the old shape, `ProgressPatch`; attempt documents read old snapshots and answers.
- [x] **A1.3 Scoring.** Set equality; `answered`, `isCorrect`, the result fields; tests for single, multiple, none picked, extra pick, missing pick, no key, unknown index.
- [x] **A1.4 Wire types and leak check** (verified by `attempts-api`: start, resume and the public quiz routes carry only `type` and `pickCount`). `ExamQuestion.type` / `pickCount`; `ReviewItem` v2 with `reviewCorrect()` for stored v1 results; assertions in `attempts-api.test.ts` that start, resume and the public quiz routes never contain `isCorrect`, `correct`, reasons or explanations (only `type` and `pickCount`).
- [x] **A1.5 Cheaper submit** (verified: a 400-question submit writes a sheet and no `answers/*`; `backfillSheets` test passes in `admin-api.test.ts`). Write `responses.sheet` and `schemaVersion`, stop writing `answers/*`; update `attempts-api.test.ts` and `admin-api.test.ts`; assert a 400-question submit writes a handful of documents; `backfill:sheets` script (dry run by default) and its test.
- [x] **A1.6 Review derived from the snapshot; size budget** (verified: `attempts-api` review rebuilt from the snapshot and old stored reviews still read; size-budget unit test and editor meter pass). Stop storing review text in `result`; both result entry points rebuild it; old attempts with a stored review still work (emulator test); `maxLevelBytes` validation, editor size meter, worst-case attempt under 1 MiB test.
- [x] **A1.7 Exam UI.** Checkbox group for `multiple` with "Select all that apply · Choose N", keyboard toggling, navigator "answered", submit dialog counts; update `quiz-attempt.test.tsx` (single and multiple, keyboard only, resume from an old-shape autosave).
- [ ] **A1.8 Results UI** (built and covered by jsdom tests; the 390×844 look is in MANUAL_STEPS). Per-option reasons and the fold as in 3.1, in both result entry points; check at 390×844 and with long text.
- [x] **A1.9 Editor.** Question type switch (changing `multiple` → `single` with several correct asks which to keep), radios vs checkboxes for "correct", per-question "Add a reason for each option", completeness line, `editor-state` actions, `quiz-editor.test.tsx`; the admin quiz view shows reasons and types; a "Preview review" dialog using the real `QuestionReview`.
- [ ] **A1.10 Contract.** One release later: remove compatibility paths that no new write can reach; keep the normalizers for stored data. Update `CLAUDE.md` (data layer, the quiz-taking flow) and the `lib/quiz-schema.ts` header comment as part of this phase, not after.

**Done when:** an admin builds a quiz with a single question, a select-all question and reasons on some options; a player finishes it and sees checkboxes with "Choose N", is scored all-or-nothing, and the review shows the right reasons; an attempt started *before* the deploy still submits and shows its result; no response before submit contains a key, a reason or an explanation; a submit writes about four documents; tsc, lint, the named unit tests and the emulator tests pass.

### Phase A2: Quiz format, import/export and the AI skill (P0)

Files: new `lib/quiz-format/`, `lib/quiz-import/`, `components/admin/quiz-import/`, `app/(admin)/quizzes/import/`, `app/(admin)/quizzes/ai/`, `skills/ageno-quiz-format/`, `lib/server/admin-quizzes.ts`, `scripts/build-format.ts`.

- [x] **A2.1 Format core (pure).** Envelope, version check, bare-list forms, `type` inference/mismatch, `note` handling; fixtures; contract test with `ajv`. (verified: `quiz-format.test.ts`, 62 tests incl. the `ajv` contract table. `lib/quiz-format/{types,read,checks,validate,json-schema,examples}.ts`; `checkQuestion` in `quiz-schema.ts` is the one per-question rule set.)
- [x] **A2.2 Generated artifacts.** `npm run build:format` (+ `--check`): `public/ageno-quiz/schema.json`, `skills/ageno-quiz-format/validate.mjs`, examples, template CSV. A test runs the generated validator on the examples and on deliberately broken files. (verified: `format-artifacts.test.ts` runs `validate.mjs` with Node; `build:format -- --check` is clean. Also generates `SKILL.md`, the plain-text template and a zip of the skill folder for claude.ai.)
- [x] **A2.3 Other parsers.** CSV/TSV, text format, existing JSON; all return `{ questions, issues[] }` with row/line numbers and end in the same `QuizInput`. (verified: `quiz-import.test.ts`; `lib/quiz-import/{table,spreadsheet,text,index}.ts`. Columns are found by header name; `correct` takes `B`, `2`, the option text or `A,C`.)
- [x] **A2.4 Checks.** Duplicates in file and against the quiz, per-row status, summary line, warnings from 3.4. (verified: `lib/quiz-format/checks.ts`, tested in `quiz-format.test.ts` and `quiz-import.test.ts`.)
- [ ] **A2.5 Wizard UI** (built; covered by jsdom tests in `import-wizard.test.tsx`; the 390×844 look and keyboard-only use are in MANUAL_STEPS) — with every route, mapping, preview with inline fixes, target choice, plan summary, commit with progress and a result summary; empty/error/success states; keyboard-only works; replaces the old `ImportDialog` (delete it when nothing uses it).
- [x] **A2.6 Export.** JSON, CSV, text, with ids and reasons; round-trip test: export → import with "update in place" yields zero changes. (verified: round trips for JSON, CSV and text in `quiz-import.test.ts`; Export buttons on the quiz page, and per level in the editor.)
- [ ] **A2.7 "AI & formats" page and the skill** (page, copyable instructions, downloads and zip built; a dry run of the rules is in Session 14; trying it in your own AI tool is in MANUAL_STEPS) — `SKILL.md` per 3.3, the copyable AI instructions, template and example downloads, the schema link. Try the skill end to end with a real source set (a handful of questions in plain text, one with several answers, one with no key given) and record the outcome in the Session Log.
- [x] **A2.8 Big-write path.** Chunked update with the `importing` flag, lobby message, retry/undo; `invalidateQuiz` at the end; emulator tests: an 800-write replace succeeds, a failing chunk leaves a recoverable state, attempts started before the import still finish. (verified against the emulator, `admin-api.test.ts` 54 of 54 and `attempts-api.test.ts` 62 of 62: a 603-write replace succeeds; a failing chunk keeps the flag, blocks starts with `quiz_updating`, and the same save finishes it or the previous contents put it back; a stale mark is taken over; a stale version is refused before any write; an attempt begun before the import is still scored. The editor warns on `updateUnfinished`; the wizard offers Try again / Put it back.)
- [ ] **A2.9 Later/optional:** `.xlsx` upload (only with a parser that is safe on untrusted files, checked at the time) and GIFT/Moodle XML; not before someone asks.

**Done when:** an admin gives an AI their question set and the skill, gets a `quiz.ageno.json` that the validator passes, drops it into the wizard, sees a preview with any AI-flagged answers highlighted, and has a working quiz with an access code in a couple of minutes; a file with bad rows says exactly which and why; export → import changes nothing; a 400-question replace succeeds.

### Phase A3: Faster editing (P1)
- [x] **A3.1 Draft autosave and restore.** (verified: `quiz-editor-tools.test.ts` for the storage rules and `quiz-editor-speed.test.tsx` for the flow: kept after 0.8 s of quiet and when the tab is hidden, offered back with Restore / Discard, a copy equal to the saved quiz is dropped, a save or Discard clears it, a quiz saved again since is said so, blocked or full storage is survived and said.) `components/admin/quiz-editor/{draft-storage,useDraft}.ts`; key `ageno:admin:draft:<quizId|new>`.
- [ ] **A3.2 Grid view with multi-row paste** (built; covered by jsdom tests; the look, the 390-wide behaviour and a paste from a real spreadsheet are in MANUAL_STEPS). `QuestionGrid.tsx` + pure `grid.ts`: question, options A–D (more on demand), a Correct column (`B`, `A, C`, option text), type, arrow-key and Enter navigation, paste of tab-separated cells (a header row is matched by name), Undo.
- [ ] **A3.3 Preview as player** (built; jsdom-tested; the look is in MANUAL_STEPS). `PlayerPreview.tsx` draws the real `QuestionView` while answering and the real `QuestionReview` after submitting, for one question or a walk through the level. Replaces `PreviewReview`.
- [x] **A3.4 Checks panel.** (verified: `quiz-editor-tools.test.ts` for each rule, `quiz-editor-speed.test.tsx` for the panel and the jump.) `lib/quiz-checks.ts` (pure): repeated question across levels, repeated options, "all/none of the above", select-all with everything right or only one right, a right answer that sits in one place, the longest option usually right, no explanation or reasons, seconds per question. Advice only, never blocks a save. "Options never chosen" waits for A5.
- [x] **A3.5 Duplicate quiz, copy/move questions, multi-select.** (verified: `admin-pages.test.tsx` for Duplicate, `quiz-editor-speed.test.tsx` for select / copy / move / delete / undo, `quiz-editor-tools.test.ts` for `duplicateInput`.) A duplicate goes through the normal create route: closed, new access code, no question ids. Copying or moving questions makes new questions in the target level (a stored question belongs to one level); it is all draft-only until Save, with one-step Undo.
- [ ] **A3.6 Image upload to Storage** (built; the route is tested with Firebase mocked in `image-upload.test.ts` and the field in `quiz-editor-speed.test.tsx`; a real upload needs Storage enabled, see MANUAL_STEPS). `POST /api/admin/images` (admin only; the body is the picture; 2 MB; PNG, JPEG, WebP or GIF judged by the bytes, never SVG) stores it with the Admin SDK under `quiz-images/<random>.<ext>` and returns a `firebasestorage.googleapis.com` address with a download token, so no Storage rule is involved and players load it like any other `imageUrl` (the host is already allowed in `next.config.mjs`). The browser never talks to Storage; `storage.rules` is deny-all. The question card has a preview and Remove next to the address box, and an Upload button only when `NEXT_PUBLIC_IMAGE_UPLOAD=1` (off by default: Storage needs the paid Blaze plan and this project is on the free plan, so pictures are pasted links for now). Bucket: `FIREBASE_STORAGE_BUCKET`, else `<project>.appspot.com`. Not done: deleting pictures when a question or quiz is deleted.

**Done when:** twenty typos across a quiz can be fixed without leaving the grid, and a closed laptop doesn't lose unsaved work.

### Phase A4: Quiz lifecycle (P1)
- [ ] **A4.1** `status` with the migration from `active`. **A4.2** Schedule, attempt limit, cooldown (server-enforced, shown in the lobby). **A4.3** Trash: soft delete, restore, typed-title permanent delete; leaderboard and counts stay right. *Done 2026-10-27 (see Session 13). Not built: automatic purge after N days (the optional Vercel cron in the manual steps); trash is emptied by hand with "Delete forever".* **A4.4** Revisions. **A4.5** Tags, filters, bulk actions.

**Done when:** deleting a quiz by mistake is a two-click recovery, and a quiz can be prepared in draft and opened at a set time.

### Phase A5: Insights (P1)

**Why this phase exists (found 2026-10-29):** an admin can list results (`/quiz-reports`: who, score, time, integrity counts) but cannot open one. Nothing reads `responses.sheet`, `integrityEvents` or the attempt's question snapshot for an admin, and `getAttemptResult` refuses anyone but the attempt's owner. So "what did this person get wrong?" and "which questions does everyone get wrong?" have no answer on screen. A5 builds both, in that order: **one person's attempt first (A5.3), then per-question statistics (A5.2).** The order of the task numbers is historical; do A5.3 first.

**Principles (the industry practice this follows)**
- **Least privilege, one audited door.** A different person's answers are personal data. Only `requireAdmin` routes serve them; the owner-only player route is not loosened (no `if admin` branch inside `getAttemptResult`); the admin reader is its own function that takes no `userId`. Players never see each other's answers. Every admin read of an individual attempt is logged once A6.1 exists (the route calls `recordAdminAction` then); until then the reader is the single place to add it.
- **Show what the person actually saw.** The review is rebuilt from the attempt's own question snapshot, so a later edit of the quiz never changes it (a mis-key found later is shown as it was scored, with the current key noted in A5.2, not rewritten).
- **Review is shown to the admin even when the quiz hides it from players** (`showAnswerReview: false`) and even when the quiz is checked by hand (`isAutoCheck: false`; this is where the admin needs the answers most).
- **Server decides, client displays.** Counts, "wrong / skipped" and times come from the server DTO; the client only filters. DTOs are plain JSON in `lib/admin-types.ts`; no Firestore types cross the wire.
- **Bounded reads.** One attempt = one `attempts` document + one `responses` document + two name look-ups. Per-question statistics read at most the latest N `responses` (default 2000, `select` only the fields used), cached for 5 minutes by tag; no counter document (a hot counter would cap submits near one a second during a mass exam).
- **Old data keeps working** (expand, then contract): attempts from before question model v2 (`correctIndex`, single-number answers), results with a stored `review`, and results with no `integrityEvents` all render. A result whose `attempts` document is gone says so plainly and does not guess.
- **Accessible and on-brand.** Existing `QuestionReview` for each question (status in words + icon, never colour alone), `FilterTabs` for Wrong / Skipped, tokens only, a table for the timeline with real headers, keyboard reachable rows (the whole row is a link, not a click handler), loading skeleton and error with Retry.
- **Honest numbers.** Statistics are advice for the admin, with the sample size next to every percentage, and a "too few attempts" state under 10 instead of a misleading figure.

**Tasks**
- [x] **A5.1** Run `backfill:sheets` (dry run, then `-- --apply`) so older results have a `sheet` (needed by A5.2 only; A5.3 does not use it). *Done 2026-10-29 against production: 94 results, 15 already had a sheet, 79 got one, 0 unreadable; a second dry run said 94 of 94 done. It only adds `sheet` and `schemaVersion: 2`; scores, answers and the old `answers/*` documents are untouched.*
- [x] **A5.2** Per-question statistics (built 2026-10-29; the link from a question to the people who got it wrong is not built, and a browser check is outstanding). `lib/item-analysis.ts` (pure, unit-tested: % correct, discrimination with the top and bottom 27% by score, pick rate per option incl. multi-select, flags "very hard < 30%", "very easy > 90%", "negative discrimination: check the key", "option picked by under 5%"), `lib/server/admin-insights.ts` (reads the latest N sheets, tagged cache), `GET /api/admin/quizzes/[quizId]/insights`, a Questions tab on the quiz page with the sample size shown, and a link from each question to the people who got it wrong. Needs the question *key at the time of the attempt*, so statistics are computed from each attempt's own snapshot, not the current quiz.
- [ ] **A5.3** Attempt review (the admin sees what a person did wrong). Done in steps:
  - [x] **A5.3a Reader.** `getAttemptForAdmin(attemptId)` in `lib/server/attempts.ts` (shares `upgradeAttempt` with `owned`, takes no user id, always builds the review from the snapshot, returns the player's name and email, the quiz title, level, score, raw %, multiplier, time taken, late flag, integrity counts and the timestamped events). `AdminAttemptDetail` DTO in `lib/admin-types.ts`. *Done 2026-10-29.*
  - [x] **A5.3b Route.** `GET /api/admin/reports/[attemptId]` behind `requireAdmin`, `no-store`. *Done 2026-10-29.*
  - [x] **A5.3c Page.** `/quiz-reports/[attemptId]` (server page through `loadForAdmin`, `AttemptDetailClient` fetches when it got `null`): header (player, quiz, level, submitted, score with the multiplier explained, correct x of y, time), "Wrong / Not answered" filter with counts, one `QuestionReview` per question (new `viewer="admin"` wording: "Their answer"), and a **Recorded during the attempt** table (time into the attempt, event in words). *Done 2026-10-29.*
  - [x] **A5.3d Entry points.** Every Reports row links to its attempt (the player's name), and the Dashboard's recent results too. The detail page has "All results by this person" instead of a second same-quiz query (that would need a third index; the person's list already shows every quiz). *Done 2026-10-29.*
  - [x] **A5.3e Per-person view.** `GET /api/admin/reports?userId=` (and `/quiz-reports?userId=`) lists one person's results with `person` named in the response; a "Results" link on each row of the Users screen. A person and a quiz are not combined (400 `invalid_filter`; the quiz filter is greyed out in person view). It uses the existing `responses` index on `userId` + `submittedAt`, so **nothing to deploy**. *Done 2026-10-29.*
  - [ ] **A5.3f Tests.** Done: emulator block in `admin-api.test.ts` (6 tests: another person's picks next to the key and the player's name; review given to the admin when the quiz hides it from players; the player's own result route still owner-only; events in order and the truncation flag, no device clock sent; an attempt from before question model v2; 401/403/404/409/bad id), and `admin-attempt-detail.test.tsx` (8 tests: wording, Wrong / Not answered filter, timeline, nothing-recorded, checked-by-hand quiz, Retry, missing answers, Reports links). Added with A5.3e: the `userId` filter emulator test, Reports and Users page tests, the detail page's person link, and an `access-control.test.ts` case for `/quiz-reports/<id>`.
  - [ ] **A5.3g Later:** **void** an attempt (same code path that keeps `leaderboard/*` and `userTotals/*` right, compare with `backfill:leaderboard` dry run) and **allow another attempt**; note for the admin on a result ("checked by hand").
- [ ] **A5.4** Dashboard "needs attention" strip (quizzes with very low average, results with many integrity events) and a 30-day trend from cached count queries.
- [ ] **A5.5** Per-question results CSV (formula-safe cells, same helper as the reports CSV): one row per person and question, for the admin's own analysis.

**Out of scope for A5:** manual marking of free-text answers (no such question type yet), sharing a result with a player, exporting personal data in bulk beyond the existing CSV, emailing results.

**What A5.2 does (decisions):** `lib/item-analysis.ts` is pure. "Got it right" is the share of every result at that level (a skipped question counts as not right); right or wrong is what was recorded when the result was scored (`ok`), else the current key. Discrimination is the top 27% by score minus the bottom 27%, shown only with 10 or more scored results. Flags: very hard under 30% and very easy over 90% (10 or more results); "check the key" when discrimination is below -0.1 (30 or more scored results); an unused option when a wrong option of a question with 3 or more options is picked by under 5% (20 or more results). Under 10 results the figures show and nothing is flagged. The tab reads the latest 2000 results of the quiz (`quizId` + `submittedAt` index, already deployed) and says when it is not all of them; it is cached 5 minutes under the quiz's tag, so an edit clears it. Known limit: a question edited after some results were taken is judged against all of them, because a result stores picks, not the options it saw. Server: `lib/server/admin-insights.ts`, `GET /api/admin/quizzes/[quizId]/insights`; screen: the quiz page's "Results by question" tab (`QuizInsightsPanel`).

**Done when:** an admin opens any finished result and sees exactly which questions that person got wrong or skipped (with the correct answer and the reasons) and what the browser recorded during the attempt; and opens a quiz and sees which questions are too hard, possibly mis-keyed, or have dead options, on one screen.

### Phase A6: Governance (P2)
- [ ] **A6.1** Audit log + screen (test: every admin route writes one entry, none contains a key or personal data). **A6.2** Editor role (when a second admin exists). **A6.3** Users: server-side search/paging, disable account, per-user page, CSV. **A6.4** Groups and assignment (optional).

**Done when:** "who deleted that quiz and when" is answered on screen.

### Phase A7: AI inside the app (P3, optional)
- [ ] **A7.1** Draft reasons for existing questions. **A7.2** Draft questions from text into the import preview. **A7.3** Guardrails: off by default, rate limit, audit entries, "AI draft" marking, prompt-injection fixtures.

**Done when:** nothing AI-written reaches a player without an admin accepting it.

---

## Recommended order

1. **A1** — the data and scoring change. It comes first because everything after it (the format, the importer, the editor grid, analytics) is built on the question shape, and changing that shape later would mean redoing them. Ship it in two or three small releases (A1.1–A1.4 behind the same deploy, then A1.5–A1.6, then the UIs), each keeping old attempts working.
2. **A2** — format, importer and skill. Build the pure format core and generated validator before any UI.
3. **A4.3 (trash)** can jump the queue at any point: today one wrong click on Delete destroys a quiz's results for good.
4. Then **A3, A4, A5**, then **A6**, and **A7** only if you want it.

Estimated size (sessions of the kind the other plans used): A1 ≈ 3–4, A2 ≈ 3, A3 ≈ 2, A4 ≈ 2, A5 ≈ 2, A6 ≈ 2, A7 ≈ 1–2.

## Risks to watch

- **Attempts in progress during the A1 deploy.** Old snapshots, old answers and old device-storage drafts must all still finish and show a result. Emulator tests for each shape are part of A1, not optional.
- **Key and reason leaks.** Only `type` and `pickCount` may travel before submit; test every pre-submit route.
- **Attempt document size** — keep the budget test green.
- **Write limits** — the chunked import path is not atomic; always report its state honestly.
- **Cache.** Every new write path (import, trash, restore, revisions) calls `invalidateQuiz`.
- **Leaderboard.** Voiding, trashing and restoring touch `responses`/`leaderboard`; reuse the existing update code and compare with `backfill:leaderboard` (dry run).
- **Generated files drifting** from the code — `build:format -- --check` in the verification steps.
- **Untrusted input** — plain-text rendering only, size limits, no npm `xlsx`, AI output treated as data.

## Manual steps likely needed (move to `docs/MANUAL_STEPS.md` when reached)

- Run `backfill:sheets` dry run, then `-- --apply`, against production (A1.5 / A5.1).
- New Firestore indexes for any new query in A4/A5 (`firebase deploy --only firestore:indexes`).
- Storage rules and bucket setup for image upload (A3.6).
- Installing the skill in your own AI tool, and trying it on a real question set (A2.7).
- `ANTHROPIC_API_KEY` in Vercel (A7 only).
- Vercel cron for trash purge (A4.3, optional).

---

## Session Log

Add new entries at the top.

### 2026-10-29 — Session 16, part 3 (A5.1 backfill and A5.2 results by question)
- Done: **A5.1** `npm run backfill:sheets` run on production after a dry run (94 results: 79 got a sheet, 15 had one, 0 unreadable; rerun reports nothing left). It only adds `sheet` and `schemaVersion: 2`; nothing else reads `schemaVersion`. **A5.2** `lib/item-analysis.ts`, `lib/server/admin-insights.ts`, `GET /api/admin/quizzes/[quizId]/insights`, `QuizInsightsPanel` and a "Questions / Results by question" switch on the quiz page (share right, separation, flags in words, option pick bars, "Needs attention" filter, hardest or easiest first, the number of results shown).
- Decisions: see "What A5.2 does" under Phase A5. A pick outside a question's options is not a pick (found by the unit test).
- Verified: `tsc`, lint, `npm run build` clean (public pages unchanged; `/quizzes/[quizId]` 176 kB, admin). Passing: `item-analysis` (14), `quiz-insights-panel` (7); emulator `admin-api.test.ts -t A5` 9 of 9 (3 for this route: figures from real stored sheets incl. a result with no sheet and one at another level, empty quiz, admin-only/404/bad id). A read-only run of the analysis on production returned correctly for the first quiz (1 result, 20 questions, average right 50%); the rest of that run died on network resets (`ECONNRESET` from this machine to Firestore) twice, so the other quizzes were not looked at. Not looked at in a browser.
- Next up: the browser check, then A5.4 (dashboard "needs attention" strip and trend) and A5.5 (per-question CSV); the link from a question to the people who got it wrong.

### 2026-10-29 — Session 16, part 2 (A5.3d/e: one person's results)
- Done: `getReportsPage(..., userId)` and `?userId=` on the reports route (`person` in the response; person and quiz filters are exclusive), `/quiz-reports?userId=` (heading names the person, Back to all results, quiz filter off), a "Results" link on every Users row, and "All results by this person" on the attempt page. Checked first whether the index was needed: `responses` already had `userId` + `submittedAt` (My quizzes uses it), so `firestore.indexes.json` is unchanged and there is no deploy step.
- Verified: `tsc`, lint clean. Passing: `admin-pages` (20, three new), `admin-attempt-detail` (9), `access-control`; emulator `admin-api.test.ts -t reports` 9 of 9 (includes the new person-filter test). Not run: the whole `admin-api` file, a build (only small page/prop changes since the last build). Not looked at in a browser.
- Next up: the browser check (MANUAL_STEPS, "Admin Phase A5.3"), then A5.1 (`backfill:sheets`) and A5.2 (per-question statistics).

### 2026-10-29 — Session 16 (A5.3: an admin sees what each person did wrong)
- Found: the admin side listed results but could not open one. Nothing read `responses.sheet`, `integrityEvents` or the attempt's question snapshot for an admin, and `getAttemptResult` only serves the owner. Rewrote the A5 section (principles, tasks, out of scope) and built the first slice.
- Done: **A5.3a to A5.3c.** `getAttemptForAdmin` (`lib/server/attempts.ts`; `owned` now calls a shared `upgradeAttempt`, so old and new attempts read the same way), `GET /api/admin/reports/[attemptId]`, `/quiz-reports/[attemptId]` (`AttemptDetailClient`: player, quiz, score, time, Wrong / Not answered filter, every question with their answer, the key and the reasons, and the recorded-events table), `AdminAttemptDetail` and `AttemptEventDTO` in `lib/admin-types.ts`, `adminReports.attempt`. The player's name in the Reports table and the quiz title in the Dashboard's recent results link to it. `QuestionReview` takes `viewer="admin"` ("Their answer", neutral select-all line); the player wording is unchanged.
- Decisions: the admin reader is its own function, not a branch inside the owner-only one, so the player route stays owner-only (tested). The admin always gets the review, also when the quiz hides it from players or is checked by hand. The device's clock for an event is never sent (`clientAt` stays on the server). A result whose `attempts` document is gone says "the detailed answers aren't stored" rather than guessing. `ResultsScreen` was not reused (it is the player's screen, with its own container and wording, and it sits near the 170 kB budget); the admin screen shares `QuestionReview` instead.
- Verified: `npx tsc --noEmit` and `npm run lint` clean; `npm run build` passes (public pages unchanged: `/q/[id]` 169 kB, `/my-quizzes/[attemptId]` 167 kB; admin `/quiz-reports/[attemptId]` 166 kB). Passing: `admin-attempt-detail` (8), `admin-pages`, `question-review`, `access-control`, `exam-logic` (155 together); emulator `admin-api.test.ts -t "A5.3"` 6 of 6 (not the whole file this time). **Not verified:** anything in a real browser (checklist: MANUAL_STEPS, "Admin Phase A5.3"); the rest of `admin-api.test.ts` and `attempts-api.test.ts` were not rerun (the only change they touch is `owned`, split into two functions without a change in behaviour).
- Next up: A5.3d/e (done in part 2 below), then the browser check and A5.2.

### 2026-10-27 — Session 15 (A3: faster editing)
- Done: **A3.1** a copy of unsaved edits is kept on the device (after a pause in typing, and when the tab is hidden or closing) and offered back with Restore / Discard; **A3.2** a Cards / Grid switch in the editor (the choice is remembered) with the grid: keyboard movement, a Correct column, per-cell edits, paste of spreadsheet rows; **A3.3** one preview dialog drawn by the real question and review components, replacing the review-only preview; **A3.4** a Checks panel from the pure `lib/quiz-checks.ts`; **A3.5** Duplicate (on the list and the quiz page) and ticking questions to copy, move or delete them, all with Undo. Side fix: pressing Enter in a text box no longer saves the quiz and leaves the editor (it did, in the card view too).
- Decisions: the Correct column is a visible text column (`B`, `A, C`, option text, read by the importer's `parseCorrect`) so a pasted sheet lines up cell for cell; a pasted block that starts with a header row (a Question column and mostly known names) is matched by name wherever its columns sit. Moving a question to another level makes a new question without an id, because stored questions are per level and the server matches ids inside a level. A duplicate starts closed, like an import. Restoring a draft over a quiz that was saved again is allowed but says that saving then replaces the newer changes. The editor's "unsaved changes" check now compares with keys sorted (a restored draft built its objects in another key order and looked changed).
- Found while testing: a first row of data such as `Line one, A, B` was read as a header (two cells look like column names), so a header now needs a Question column and mostly recognised names; a selection cleared by an effect raced the first click, so the selection is now keyed by level instead.
- Verified: `npx tsc --noEmit`, `npm run lint` and `npm run build` clean (public pages unchanged: `/q/[id]` 169 kB, `/my-quizzes/[attemptId]` 171 kB; the editor routes 195 kB, admin only). Passing: `quiz-editor-tools` (27), `quiz-editor-speed` (21), `quiz-editor` (26), `admin-pages` (18), `import-wizard` (15), plus `quiz-schema`, `quiz-format`, `quiz-import`, `format-artifacts`, `exam-logic`, `access-control`. Run in parallel on a busy machine a few editor tests passed the 5 s default, so the two editor test files now allow 20 s. **Not verified:** anything in a real browser (checklist: MANUAL_STEPS, "Admin Phase A3"). No server code changed, so no emulator suite was run.
- **A3.6** image upload is built too (see the task above); the Session's test counts below include it: `image-upload` (8), `quiz-editor-speed` (21).
- Next up: the browser checks in MANUAL_STEPS and turning on Storage (then tick A3.2, A3.3 and A3.6); A1.10 one release after A1 ships; then A4 (A4.1 `status`).

### 2026-10-27 — Session 14 (A2: quiz format, import/export, the AI skill)
- Done: **Format core** (`lib/quiz-format/`): reader for JSON (whole quiz, one level, bare list, older exports with `correctIndex`; unknown fields warn; a newer `version` is refused with a message; BOM; JSON errors with line and column), `checkRows` (the schema's own rules via the new `checkQuestion`, plus warnings: duplicates in the file and against the level, the AI's `note`, select-all with everything right, very long options, "all/none of the above"), `validateQuizFile` (the whole-file report), `buildJsonSchema`, `write.ts` (export JSON/CSV/text). **Parsers** (`lib/quiz-import/`): pasted cells and CSV (tab, comma or semicolon; quotes, line breaks in cells, BOM, CRLF), columns by header name, the plain-text format, auto-detect. **Generated files** by `npm run build:format` (`-- --check` verifies): `public/ageno-quiz/{schema.json,template.csv,template.txt,example.ageno.json,ageno-quiz-format.zip}` and `skills/ageno-quiz-format/` (`SKILL.md`, `schema.json`, `validate.mjs` = the app's own checks bundled with esbuild, examples). **UI**: `/quizzes/import` (bring it in, check with inline fixes using the editor's question card, choose new quiz / existing quiz with add / replace / update by id, the plan in numbers, save), the same check in a dialog inside the editor (replaces the old `ImportDialog`; `parseImportedQuestions` and `exportQuestions` removed), `/quizzes/ai` ("AI & formats": steps, skill zip, copy-the-instructions, downloads), Export JSON / CSV / text on the quiz page, Import and AI & formats buttons on the list. **Big writes**: a save over 500 writes goes through `updateQuizInChunks` (flag `importing`, chunks of 450, quiz fields last); `startAttempt` refuses with `quiz_updating` while the flag is set.
- Decisions: a new quiz from an import is **closed** unless "Open it to players right away" is ticked (nothing unreviewed goes live). *Update by id* never removes anything; *Replace* removes what the file lacks and says how many. CSV export carries an `id` column so edit-in-Excel round trips; the text format has no ids (use it to replace a level). Cells starting `= + - @` get an apostrophe on export and lose it on import. In the `correct` cell the exact option text wins over a letter or number, with a warning when both readings differ. Skill packaging checked against the current Agent Skills docs: `name` lowercase and hyphens without "claude" or "anthropic" (a test holds it), claude.ai takes a zip with the folder at the top (Settings → Features), Claude Code reads `~/.claude/skills/` or `.claude/skills/`. `middleware.ts` lets `/ageno-quiz/*` through without sign-in so an AI tool can fetch the schema. The JSON Schema is stricter than the app (no unknown fields, `isCorrect` required); the contract table in `quiz-format.test.ts` says per case what each side does and checks the schema never accepts what the app refuses.
- Skill dry run (by me, not by another AI): a three-line source (single answer, select-all, one with no answer given) became `quiz.ageno.json` following `SKILL.md`, the guessed answer carrying a `note`; `validate.mjs` said "Ready to import. 3 questions: all ready, 1 with a warning". The same file with two correct options on a `single` question failed with the right message and exit code 1.
- Verified: `npx tsc --noEmit`, `npm run lint` and `npm run build` clean (public pages unchanged: `/q/[id]` 169 kB, `/my-quizzes/[attemptId]` 171 kB; admin `/quizzes/import` 182 kB, `/quizzes/ai` 120 kB). Passing: `quiz-format` (62), `quiz-import` (37), `format-artifacts` (11), `import-wizard` (15), `quiz-editor` (27), `quiz-schema`, `access-control`, `admin-pages`, `exam-logic`, `quiz-attempt`; emulator suites `admin-api` 54 of 54 and `attempts-api` 62 of 62. **Not verified:** anything in a browser, the skill in a real AI tool.
- Note for next time: do not pass backslashes or apostrophes through a shell heredoc into a Python script here (they get halved or break the quoting); use the Edit/Write tools. `emulators:exec` left its `java.exe` behind again; stop it between runs.
- Next up: the browser checks and the skill try in MANUAL_STEPS (then tick A2.5 and A2.7); A1.10 one release after A1 ships; then A3 (A3.1 draft autosave first). A2.9 (xlsx, GIFT) only if asked.

### 2026-10-27 — Session 13 (A4.3 trash, done ahead of A2 because one wrong click on Delete destroyed a quiz's results)
- Done: **Delete now moves a quiz to the trash.** `DELETE /api/admin/quizzes/[id]` sets `deletedAt`/`deletedBy` on the quiz (`trashQuiz`), closes unfinished attempts (so a late submit can't put it back on a board) and removes its leaderboard rows (totals recomputed). Nothing else is deleted. `POST .../restore` (`restoreQuiz`) rebuilds the quiz's leaderboard rows from its results (`restoreQuizToLeaderboard`, same arithmetic as the backfill) and clears the flag. `POST .../delete-forever` (`deleteQuizForever`) only works on a quiz in the trash and needs the exact title in the body; it then runs the old `deleteQuiz`. Players: the public list, the lobby route, the code lookup and starting an attempt all treat a trashed quiz as missing; week and month boards and the dashboard quiz count leave it out; a player can still open their own old result. Saving a trashed quiz is refused (`quiz_in_trash`). The Quizzes screen has Quizzes and Trash tabs, a "Move to trash" dialog saying what is kept, Restore, and "Delete forever" with the title typed and the result count shown; the dashboard's delete also goes to the trash.
- Decisions: a quiz in the trash is marked by `deletedAt` (no `status` field yet; A4.1 will fold it in); no automatic purge; admin Reports still list results of trashed quizzes (results are kept).
- Verified: `tsc`, lint clean; `admin-pages` (16, four new for the trash UI); `admin-api` emulator suite 49 of 49 (all new trash tests: hiding, closing attempts, keeping results, restore returning the same board numbers, typed-title rules; plus `backfillSheets`). Nothing looked at in a browser (checklist in MANUAL_STEPS).
- Next up: A2 (format core first).

### 2026-10-26 — Session 12 (A1 built)
- Done: A1.1–A1.9 in code. `lib/exam/normalize.ts` (`type`, `correct: number[]`, `rationales`, `upgradeStoredQuestion` for attempts begun before this), `answers.ts` (answers as lists: `toPicks`, `togglePick`, `picksMatch`), `scoring.ts` (set equality), new `lib/exam/review.ts` (`buildReview`, `upgradeResult`, `reviewCorrect`), `lib/response-sheet.ts`, `lib/server/response-sheets.ts` + `scripts/backfill-sheets.ts` (`npm run backfill:sheets`). Server: sanitiser accepts old and new answers, `owned()` reads old attempt documents into the new shape, a submit writes `responses.sheet` (+ `schemaVersion: 2`) and no `answers/*`, the stored result has `review: null` and both result entry points rebuild it from the snapshot. Schema: `type`, `rationale`, `LIMITS.rationale`, `LIMITS.maxLevelBytes` (300 KB), `levelBytes`. UI: checkboxes with "Select all that apply · Choose N", keyboard toggling, review with per-option reasons and the "Why the others are wrong" fold, editor type switch (asks which option stays correct), per-option reasons, size meter, "Preview the review" dialog, admin quiz view shows types and reasons.
- Decisions: a `sheet` entry omits `ok` when the quiz is not scored; a question with several correct options is read as `multiple` whatever its stored `type` says; `single` with several picks keeps the lowest.
- Verified: `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` passes. Passing: `exam-logic` (62), `quiz-schema` (31), `quiz-editor` (24), `quiz-attempt` (47), and the emulator suite `attempts-api` (62: select-all start/score/review, no key or reason before submit, a 400-question submit writes a sheet and no `answers/*`, attempts begun before the update finish, old stored results still read, review rebuilt from the snapshot). Bundle: `/q/[id]` still 169 kB; `/my-quizzes/[attemptId]` about 171 kB (was 170.5, the review UI grew a little; within noise of the 170 budget, watch it). One `attempts-api` leaderboard test failed once on a count off by one and passed on rerun (looks like a flake, not this change). **Not verified:** `admin-api.test.ts` (emulator; includes the `backfillSheets` test): two attempts to start it hit "port taken" from a leftover `java.exe`; nothing looked at in a browser.
- Note for next time: the full `attempts-api` suite takes about 8 minutes; `emulators:exec` leaves its `java.exe` behind on Windows each time, so stop it between runs.
- Next up: the user checks the deployed site (MANUAL_STEPS, Admin Phase A1) and tick A1.8; run `admin-api.test.ts` once (`firebase emulators:exec --only firestore --project demo-ageno-admin "npx vitest run __tests__/admin-api.test.ts"`, stop the leftover `java.exe` first) and tick A1.5; A1.10 one release later; then A2.

### 2026-10-26 — Session 11 (planning, finalised)
- Done: audited the admin code; researched bulk import, option feedback, item analysis, AI-draft review and audit logs; wrote this plan; then revised it with the user's decisions: several correct answers, JSON as the canonical format plus an AI skill, and a proper data-structure change (answers and keys as lists, `type`/`schemaVersion`, per-option reasons, a compact `sheet` on responses instead of one document per answer, review derived from the snapshot).
- Verified: nothing run; no code changed. Confirmed in code that no app code reads `responses/{id}/answers/*` (only tests do), and that the whole pipeline is single-answer today.
- Notes: research gaps are stated in Part 2 (no study on per-option reasons; nothing cited for soft delete/versioning; no platform layout for item analysis).
- Next up: A1.1.
